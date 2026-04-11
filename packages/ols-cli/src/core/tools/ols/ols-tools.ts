/**
 * OLS Query Tool — Send natural language queries to OpenShift Lightspeed Service.
 *
 * This is the primary tool. The agent sends user questions to OLS and gets back
 * AI-powered answers with cluster context, RAG from OCP docs, and tool call results.
 */

import type { AgentTool, ToolResult } from "@mariozechner/pi-agent-core";
import { OLSClient, loadOLSConfig } from "@kcns008/ols-client";

let client: OLSClient | null = null;

function getClient(): OLSClient {
	if (!client) {
		const config = loadOLSConfig();
		client = new OLSClient(config);
	}
	return client;
}

export const olsQueryTool: AgentTool = {
	name: "ols_query",
	description:
		"Send a natural language query to OpenShift Lightspeed Service. " +
		"Use this for ANY question about OpenShift, Kubernetes, cluster operations, " +
		"troubleshooting, best practices, or configuration. Returns AI-powered answers " +
		"with references to OpenShift documentation.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "The natural language question about OpenShift/Kubernetes",
			},
			conversation_id: {
				type: "string",
				description: "Optional conversation ID to continue a previous conversation",
			},
		},
		required: ["query"],
	},
	async execute(args: { query: string; conversation_id?: string }): Promise<ToolResult> {
		try {
			const ols = getClient();
			const response = await ols.query({
				query: args.query,
				conversation_id: args.conversation_id,
			});

			let result = response.response;

			if (response.referenced_documents && response.referenced_documents.length > 0) {
				result += "\n\n## References\n";
				for (const doc of response.referenced_documents) {
					result += `- [${doc.title}](${doc.url})\n`;
				}
			}

			if (response.conversation_id) {
				result += `\n\n_Conversation ID: ${response.conversation_id}_`;
			}

			if (response.available_quotas) {
				result += `\n_Tokens: ${response.input_tokens}in / ${response.output_tokens}out_`;
			}

			return { output: result };
		} catch (e: any) {
			return { output: `Error querying OLS: ${e.message}`, error: true };
		}
	},
};

export const olsStreamingTool: AgentTool = {
	name: "ols_stream",
	description:
		"Send a query to OLS with streaming response. Use for interactive queries " +
		"where the user wants to see the answer as it's generated.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "The natural language question",
			},
			conversation_id: {
				type: "string",
				description: "Optional conversation ID to continue",
			},
		},
		required: ["query"],
	},
	async execute(args: { query: string; conversation_id?: string }): Promise<ToolResult> {
		try {
			const ols = getClient();
			const chunks: string[] = [];

			for await (const chunk of ols.streamingQuery({
				query: args.query,
				conversation_id: args.conversation_id,
			})) {
				if (chunk.type === "text" && typeof chunk.data === "string") {
					chunks.push(chunk.data);
				}
			}

			return { output: chunks.join("") || "No response received" };
		} catch (e: any) {
			return { output: `Error streaming from OLS: ${e.message}`, error: true };
		}
	},
};

export const olsHealthTool: AgentTool = {
	name: "ols_health",
	description: "Check the health of the OpenShift Lightspeed Service connection.",
	parameters: { type: "object", properties: {} },
	async execute(): Promise<ToolResult> {
		try {
			const ols = getClient();
			const health = await ols.health();
			return { output: `OLS Status: ${health.status}\n${health.services ? JSON.stringify(health.services, null, 2) : ""}` };
		} catch (e: any) {
			return { output: `OLS Health Check Failed: ${e.message}`, error: true };
		}
	},
};

export const olsConversationsTool: AgentTool = {
	name: "ols_conversations",
	description: "List previous OLS conversations.",
	parameters: {
		type: "object",
		properties: {
			limit: {
				type: "number",
				description: "Max conversations to return (default 10)",
			},
		},
	},
	async execute(args: { limit?: number }): Promise<ToolResult> {
		try {
			const ols = getClient();
			const conversations = await ols.listConversations();
			const limit = args.limit || 10;
			const items = conversations.slice(0, limit);

			if (items.length === 0) return { output: "No conversations found." };

			const lines = items.map(
				(c) =>
					`- **${c.id}** (${new Date(c.created_at).toLocaleDateString()}) ${c.first_query || "No query"} [${c.message_count} messages]`
			);
			return { output: `## Recent Conversations\n${lines.join("\n")}` };
		} catch (e: any) {
			return { output: `Error listing conversations: ${e.message}`, error: true };
		}
	},
};

export const olsFeedbackTool: AgentTool = {
	name: "ols_feedback",
	description: "Submit feedback on an OLS response (rating 1-5).",
	parameters: {
		type: "object",
		properties: {
			conversation_id: { type: "string", description: "Conversation ID" },
			query: { type: "string", description: "Original query" },
			response: { type: "string", description: "Original response" },
			rating: { type: "number", description: "Rating 1-5" },
			feedback_text: { type: "string", description: "Optional feedback text" },
		},
		required: ["conversation_id", "query", "response", "rating"],
	},
	async execute(args: any): Promise<ToolResult> {
		try {
			const ols = getClient();
			await ols.feedback(args);
			return { output: "Feedback submitted. Thank you!" };
		} catch (e: any) {
			return { output: `Error submitting feedback: ${e.message}`, error: true };
		}
	},
};
