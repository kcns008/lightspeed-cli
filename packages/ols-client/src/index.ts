/**
 * OpenShift Lightspeed Service — REST API Client
 *
 * Wraps the OLS REST API for use from the CLI.
 * Handles auth (K8S bearer token), query, streaming, conversations, feedback.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

// --- Kubeconfig Token Extraction ---

function extractTokenFromKubeconfig(kubeconfigPath?: string): string {
	const path = kubeconfigPath || process.env.KUBECONFIG || join(homedir(), ".kube/config");
	if (!existsSync(path)) {
		throw new Error(`Kubeconfig not found at ${path}. Set KUBECONFIG or pass --kubeconfig.`);
	}
	const raw = readFileSync(path, "utf-8");
	// Simple YAML parsing for current-context → user → token
	// Full YAML parse avoided to skip dependency in this initial version
	const lines = raw.split("\n");
	let currentContext = "";
	let inContext = false;
	let inUser = false;
	let userToken = "";
	let userName = "";

	// Find current context
	for (const line of lines) {
		if (line.startsWith("current-context:")) {
			currentContext = line.split(":")[1].trim().replace(/"/g, "");
			break;
		}
	}

	if (!currentContext) throw new Error("No current-context set in kubeconfig");

	// Find the context that matches
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.match(/^- context:/)) {
			inContext = false;
		}
		if (inContext && line.includes("user:")) {
			userName = line.split("user:")[1].trim().replace(/"/g, "");
			inContext = false;
		}
		if (line.includes(`name: ${currentContext}`) && lines[i - 2]?.includes("context:")) {
			inContext = true;
		}
	}

	// Find the user's token
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.match(/^- user:/)) {
			inUser = false;
		}
		if (inUser && line.includes("token:")) {
			userToken = line.split("token:")[1].trim().replace(/"/g, "");
			break;
		}
		if (line.includes(`name: ${userName}`) && lines[i - 2]?.includes("user:")) {
			inUser = true;
		}
	}

	if (!userToken) throw new Error("No token found in kubeconfig for current user. Use `oc login` first.");
	return userToken;
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
		const resp = await fetch(url, {
			method: options.method,
			headers: this.headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`OLS API error ${resp.status}: ${text}`);
		}

		return resp.json() as Promise<T>;
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
		const resp = await fetch(url, {
			method: "POST",
			headers: this.headers,
			body: JSON.stringify(req),
		});

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

// --- Config Loading ---

export function loadOLSConfig(): OLSConfig {
	const configDir = join(homedir(), ".ols");
	const configPath = join(configDir, "config.json");

	if (existsSync(configPath)) {
		const raw = readFileSync(configPath, "utf-8");
		return JSON.parse(raw) as OLSConfig;
	}

	// Auto-detect from kubeconfig context
	const serviceUrl = process.env.OLS_SERVICE_URL || "https://lightspeed-service.openshift-operators.svc:8443";
	return { serviceUrl };
}

export function saveOLSConfig(config: OLSConfig): void {
	const { mkdirSync, writeFileSync, chmodSync } = require("fs");
	const configDir = join(homedir(), ".ols");
	mkdirSync(configDir, { recursive: true });
	const configPath = join(configDir, "config.json");
	writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
	chmodSync(configPath, 0o600);
}
