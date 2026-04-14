/**
 * OpenShift Lightspeed Service — REST API Client
 *
 * Wraps the OLS REST API for use from the CLI.
 * Handles auth (K8S bearer token), query, streaming, conversations, feedback.
 * Also provides NIMClient for NVIDIA NIM and smartQuery for backend fallback.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as yaml from "js-yaml";

// --- Types ---

export interface OLSConfig {
	/** Base URL of the OLS service, e.g. https://lightspeed-service.openshift-operators.svc:8443 */
	serviceUrl: string;
	/** Path to kubeconfig file (default: ~/.kube/config or KUBECONFIG env) */
	kubeconfigPath?: string;
	/** Override namespace where OLS is deployed */
	namespace?: string;
	/** Skip TLS verification (for dev) */
	insecureSkipVerify?: boolean;
	/** NVIDIA NIM API key */
	nimApiKey?: string;
	/** NIM model name */
	nimModel?: string;
	/** NIM API base URL */
	nimBaseUrl?: string;
	/** Internal: conversation ID for REPL continuity */
	_conversationId?: string;
}

export interface OLSQueryRequest {
	query: string;
	conversation_id?: string;
	attachments?: Attachment[];
}

export interface Attachment {
	type: "oc_command_output" | "log" | "event" | "yaml" | "file" | "url";
	content: string;
	name?: string;
}

export interface OLSQueryResponse {
	response: string;
	conversation_id: string;
	referenced_documents?: ReferencedDocument[];
	tool_calls?: ToolCall[];
	tool_results?: ToolResult[];
	input_tokens?: number;
	output_tokens?: number;
	available_quotas?: QuotaInfo;
}

export interface ReferencedDocument {
	title: string;
	url: string;
	content?: string;
}

export interface ToolCall {
	tool_name: string;
	arguments: Record<string, unknown>;
	tool_id: string;
}

export interface ToolResult {
	tool_id: string;
	status: string;
	output_snippet: string;
}

export interface QuotaInfo {
	allowed: boolean;
	limit?: number;
	remaining?: number;
}

export interface StreamingChunk {
	type: "text" | "tool_call" | "tool_result" | "referenced_documents" | "metadata" | "error";
	data: unknown;
}

export interface ConversationSummary {
	id: string;
	created_at: string;
	last_updated: string;
	message_count: number;
	first_query?: string;
}

export interface Conversation {
	id: string;
	messages: ConversationEntry[];
}

export interface ConversationEntry {
	query: string;
	response: string;
	created_at: string;
	referenced_documents?: ReferencedDocument[];
}

export interface FeedbackRequest {
	conversation_id: string;
	query: string;
	response: string;
	rating: number; // 1-5
	feedback_text?: string;
}

export interface HealthResponse {
	status: string;
	ready?: boolean;
	services?: Record<string, string>;
}

export interface NIMChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface NIMChatResponse {
	id: string;
	choices: { message: { role: string; content: string }; finish_reason: string }[];
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface SmartQueryResult {
	response: string;
	source: "ols" | "nim";
	conversation_id?: string;
	references?: ReferencedDocument[];
}

// --- Kubeconfig Token Extraction ---

interface KubeconfigContext {
	name: string;
	context: { cluster: string; user: string; namespace?: string };
}

interface KubeconfigUser {
	name: string;
	user: { token?: string; "client-certificate-data"?: string; "client-key-data"?: string };
}

interface KubeconfigFile {
	"current-context"?: string;
	contexts?: KubeconfigContext[];
	users?: KubeconfigUser[];
}

export function extractTokenFromKubeconfig(kubeconfigPath?: string): string {
	const path = kubeconfigPath || process.env.KUBECONFIG || join(homedir(), ".kube/config");
	if (!existsSync(path)) {
		throw new Error(`Kubeconfig not found at ${path}. Set KUBECONFIG or pass --kubeconfig.`);
	}

	const raw = readFileSync(path, "utf-8");
	const config = yaml.load(raw) as KubeconfigFile;

	if (!config || typeof config !== "object") {
		throw new Error("Invalid kubeconfig: could not parse YAML");
	}

	const currentContext = config["current-context"];
	if (!currentContext) {
		throw new Error("No current-context set in kubeconfig");
	}

	const ctxEntry = config.contexts?.find((c) => c.name === currentContext);
	if (!ctxEntry) {
		throw new Error(`Context "${currentContext}" not found in kubeconfig`);
	}

	const userName = ctxEntry.context.user;
	const userEntry = config.users?.find((u) => u.name === userName);
	if (!userEntry) {
		throw new Error(`User "${userName}" not found in kubeconfig`);
	}

	const token = userEntry.user?.token;
	if (!token) {
		throw new Error("No token found in kubeconfig for current user. Use `oc login` first.");
	}

	return token;
}

// --- TLS Agent for insecureSkipVerify ---

function buildFetchOptions(insecureSkipVerify?: boolean): RequestInit {
	if (!insecureSkipVerify) return {};
	// Node.js 18+ supports custom dispatcher via undici, but for global fetch
	// the simplest approach is setting NODE_TLS_REJECT_UNAUTHORIZED.
	// We set it only for the scope of the request and restore after.
	// This is safe for CLI usage (single-user process).
	return {};
}

function withTlsSkip<T>(insecureSkipVerify: boolean | undefined, fn: () => Promise<T>): Promise<T> {
	if (!insecureSkipVerify) return fn();
	const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	return fn().finally(() => {
		if (prev === undefined) {
			delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		} else {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
		}
	});
}

// --- OLS Client ---

export class OLSClient {
	private config: OLSConfig;
	private token: string;

	constructor(config: OLSConfig) {
		this.config = config;
		this.token = extractTokenFromKubeconfig(config.kubeconfigPath);
	}

	private get baseUrl(): string {
		return this.config.serviceUrl.replace(/\/+$/, "");
	}

	private get headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.token}`,
		};
	}

	private async request<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		return withTlsSkip(this.config.insecureSkipVerify, async () => {
			const resp = await fetch(url, {
				...buildFetchOptions(this.config.insecureSkipVerify),
				method: options.method,
				headers: this.headers,
				body: options.body ? JSON.stringify(options.body) : undefined,
			});

			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(`OLS API error ${resp.status}: ${text}`);
			}

			return resp.json() as Promise<T>;
		});
	}

	/** POST /v1/query — non-streaming query */
	async query(req: OLSQueryRequest): Promise<OLSQueryResponse> {
		return this.request<OLSQueryResponse>("/v1/query", {
			method: "POST",
			body: req,
		});
	}

	/** POST /v1/streaming_query — streaming query via SSE */
	async *streamingQuery(req: OLSQueryRequest): AsyncGenerator<StreamingChunk> {
		const url = `${this.baseUrl}/v1/streaming_query`;
		const resp = await withTlsSkip(this.config.insecureSkipVerify, () =>
			fetch(url, {
				...buildFetchOptions(this.config.insecureSkipVerify),
				method: "POST",
				headers: this.headers,
				body: JSON.stringify(req),
			}),
		);

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`OLS streaming error ${resp.status}: ${text}`);
		}

		if (!resp.body) throw new Error("No response body for streaming query");

		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					try {
						const chunk = JSON.parse(line.slice(6)) as StreamingChunk;
						yield chunk;
					} catch {
						// Skip malformed chunks
					}
				}
			}
		}
	}

	/** GET /v1/conversations — list conversations */
	async listConversations(): Promise<ConversationSummary[]> {
		return this.request<ConversationSummary[]>("/v1/conversations", { method: "GET" });
	}

	/** GET /v1/conversations/:id — get conversation history */
	async getConversation(id: string): Promise<Conversation> {
		return this.request<Conversation>(`/v1/conversations/${id}`, { method: "GET" });
	}

	/** POST /v1/feedback — submit feedback */
	async feedback(req: FeedbackRequest): Promise<void> {
		await this.request("/v1/feedback", { method: "POST", body: req });
	}

	/** GET /health — health check */
	async health(): Promise<HealthResponse> {
		return this.request<HealthResponse>("/health", { method: "GET" });
	}

	/** GET /v1/authorized — check if current token is authorized */
	async isAuthorized(): Promise<boolean> {
		try {
			await this.request("/v1/authorized", { method: "GET" });
			return true;
		} catch {
			return false;
		}
	}
}

// --- NVIDIA NIM Client ---

const DEFAULT_NIM_BASE_URL = "https://integrate.api.nvidia.com";
const DEFAULT_NIM_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";

export class NIMClient {
	private apiKey: string;
	private model: string;
	private baseUrl: string;

	constructor(config: Pick<OLSConfig, "nimApiKey" | "nimModel" | "nimBaseUrl">) {
		if (!config.nimApiKey) {
			throw new Error("NIM API key is required. Set it with: ols config set nimApiKey <key>");
		}
		this.apiKey = config.nimApiKey;
		this.model = config.nimModel || DEFAULT_NIM_MODEL;
		this.baseUrl = (config.nimBaseUrl || DEFAULT_NIM_BASE_URL).replace(/\/+$/, "");
	}

	private get headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`,
		};
	}

	/** Send a chat completion request to NIM (OpenAI-compatible) */
	async chat(messages: NIMChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<NIMChatResponse> {
		const url = `${this.baseUrl}/v1/chat/completions`;
		const body: Record<string, unknown> = {
			model: this.model,
			messages,
		};
		if (options?.temperature !== undefined) body.temperature = options.temperature;
		if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

		const resp = await fetch(url, {
			method: "POST",
			headers: this.headers,
			body: JSON.stringify(body),
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`NIM API error ${resp.status}: ${text}`);
		}

		return resp.json() as Promise<NIMChatResponse>;
	}

	/** Simple query — wraps chat with a single user message */
	async query(question: string, history?: NIMChatMessage[]): Promise<string> {
		const messages: NIMChatMessage[] = [
			{
				role: "system",
				content:
					"You are an OpenShift and Kubernetes expert assistant. " +
					"Answer questions clearly and concisely, with code examples when helpful.",
			},
			...(history || []),
			{ role: "user", content: question },
		];
		const response = await this.chat(messages);
		return response.choices[0]?.message?.content || "";
	}
}

// --- Smart Query (OLS-first with NIM fallback) ---

/**
 * Query using OLS first; if OLS is unavailable or not configured, fall back to NIM.
 * Returns the response with source attribution.
 */
export async function smartQuery(
	question: string,
	config: OLSConfig,
	history?: NIMChatMessage[],
): Promise<SmartQueryResult> {
	// Try OLS first if configured
	if (config.serviceUrl) {
		try {
			const client = new OLSClient(config);
			const result = await client.query({
				query: question,
				conversation_id: config._conversationId,
			});
			return {
				response: result.response,
				source: "ols",
				conversation_id: result.conversation_id,
				references: result.referenced_documents,
			};
		} catch {
			// OLS failed, fall through to NIM
		}
	}

	// Fall back to NIM
	if (config.nimApiKey) {
		const nim = new NIMClient(config);
		const response = await nim.query(question, history);
		return {
			response,
			source: "nim",
		};
	}

	throw new Error(
		"No backend available. Configure OLS (ols config set serviceUrl <url>) " +
			"or NIM (ols config set nimApiKey <key>).",
	);
}

// --- Config Loading ---

export function loadOLSConfig(): OLSConfig {
	const configDir = join(homedir(), ".ols");
	const configPath = join(configDir, "config.json");

	if (existsSync(configPath)) {
		const raw = readFileSync(configPath, "utf-8");
		return JSON.parse(raw) as OLSConfig;
	}

	// Auto-detect from env or use empty defaults
	const serviceUrl = process.env.OLS_SERVICE_URL || "";
	return { serviceUrl };
}

export function saveOLSConfig(config: OLSConfig): void {
	const configDir = join(homedir(), ".ols");
	mkdirSync(configDir, { recursive: true });
	const configPath = join(configDir, "config.json");
	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
	chmodSync(configPath, 0o600);
}
