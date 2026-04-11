import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";

/** Default tools for OLS mode (vs coding mode) */
export const OLS_DEFAULT_TOOLS = [
	"ols_query",
	"ols_stream",
	"ols_health",
	"ols_conversations",
	"ols_feedback",
	"oc_get",
	"oc_describe",
	"oc_logs",
	"oc_exec",
	"cluster_status",
	"bash",
	"read",
];
