/**
 * OpenShift CLI Tools — Run oc/kubectl commands via the agent.
 *
 * These tools let the agent interact with the OpenShift cluster directly,
 * complementing the OLS query tool with real cluster data.
 */

import type { AgentTool, ToolResult } from "@mariozechner/pi-agent-core";

async function runCommand(cmd: string, timeout = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const { exec } = await import("child_process");
	return new Promise((resolve) => {
		exec(cmd, { timeout }, (error, stdout, stderr) => {
			resolve({
				stdout: stdout || "",
				stderr: stderr || "",
				exitCode: error ? error.code || 1 : 0,
			});
		});
	});
}

function truncate(output: string, maxLen = 10000): string {
	if (output.length <= maxLen) return output;
	return output.slice(0, maxLen) + `\n... (truncated, ${output.length} total chars)`;
}

export const ocGetTool: AgentTool = {
	name: "oc_get",
	description:
		"Run 'oc get' to retrieve OpenShift/Kubernetes resources. " +
		"Examples: 'pods -n myns', 'deployments --all-namespaces', 'nodes'.",
	parameters: {
		type: "object",
		properties: {
			resource: { type: "string", description: "Resource type and name (e.g., 'pods', 'deploy/my-app')" },
			namespace: { type: "string", description: "Namespace (omit for --all-namespaces)" },
			all_namespaces: { type: "boolean", description: "List across all namespaces" },
			output: { type: "string", description: "Output format: wide, yaml, json" },
			selector: { type: "string", description: "Label selector (e.g., 'app=my-app')" },
		},
		required: ["resource"],
	},
	async execute(args: any): Promise<ToolResult> {
		const parts = ["oc get", args.resource];
		if (args.namespace) parts.push(`-n ${args.namespace}`);
		if (args.all_namespaces) parts.push("--all-namespaces");
		if (args.output) parts.push(`-o ${args.output}`);
		if (args.selector) parts.push(`-l ${args.selector}`);

		const result = await runCommand(parts.join(" "));
		if (result.exitCode !== 0) {
			return { output: truncate(result.stderr), error: true };
		}
		return { output: truncate(result.stdout) };
	},
};

export const ocDescribeTool: AgentTool = {
	name: "oc_describe",
	description: "Run 'oc describe' to get detailed info about an OpenShift resource.",
	parameters: {
		type: "object",
		properties: {
			resource: { type: "string", description: "Resource type/name (e.g., 'pod/my-pod', 'dc/my-app')" },
			namespace: { type: "string", description: "Namespace" },
		},
		required: ["resource"],
	},
	async execute(args: any): Promise<ToolResult> {
		const parts = ["oc describe", args.resource];
		if (args.namespace) parts.push(`-n ${args.namespace}`);

		const result = await runCommand(parts.join(" "));
		if (result.exitCode !== 0) {
			return { output: truncate(result.stderr), error: true };
		}
		return { output: truncate(result.stdout) };
	},
};

export const ocLogsTool: AgentTool = {
	name: "oc_logs",
	description: "Run 'oc logs' to fetch pod logs from OpenShift.",
	parameters: {
		type: "object",
		properties: {
			pod: { type: "string", description: "Pod name" },
			namespace: { type: "string", description: "Namespace" },
			container: { type: "string", description: "Container name (for multi-container pods)" },
			tail: { type: "number", description: "Number of lines to fetch (default 100)" },
			previous: { type: "boolean", description: "Fetch previous (crashed) container logs" },
		},
		required: ["pod"],
	},
	async execute(args: any): Promise<ToolResult> {
		const parts = ["oc logs", args.pod];
		if (args.namespace) parts.push(`-n ${args.namespace}`);
		if (args.container) parts.push(`-c ${args.container}`);
		if (args.tail) parts.push(`--tail=${args.tail}`);
		else parts.push("--tail=100");
		if (args.previous) parts.push("--previous");

		const result = await runCommand(parts.join(" "));
		if (result.exitCode !== 0) {
			return { output: truncate(result.stderr), error: true };
		}
		return { output: truncate(result.stdout) };
	},
};

export const ocExecTool: AgentTool = {
	name: "oc_exec",
	description: "Run 'oc exec' to execute a command in a pod. Use for debugging.",
	parameters: {
		type: "object",
		properties: {
			pod: { type: "string", description: "Pod name" },
			namespace: { type: "string", description: "Namespace" },
			container: { type: "string", description: "Container name" },
			command: { type: "string", description: "Command to run inside the pod" },
		},
		required: ["pod", "command"],
	},
	async execute(args: any): Promise<ToolResult> {
		const parts = ["oc exec", args.pod];
		if (args.namespace) parts.push(`-n ${args.namespace}`);
		if (args.container) parts.push(`-c ${args.container}`);
		parts.push("--", args.command);

		const result = await runCommand(parts.join(" "));
		if (result.exitCode !== 0) {
			return { output: truncate(result.stderr), error: true };
		}
		return { output: truncate(result.stdout) };
	},
};

export const clusterStatusTool: AgentTool = {
	name: "cluster_status",
	description: "Get a quick overview of the OpenShift cluster: nodes, pods, deployments, events.",
	parameters: {
		type: "object",
		properties: {
			namespace: { type: "string", description: "Focus namespace (omit for cluster-wide)" },
		},
	},
	async execute(args: any): Promise<ToolResult> {
		const ns = args.namespace ? `-n ${args.namespace}` : "--all-namespaces";
		const sections: string[] = [];

		// Node status
		const nodes = await runCommand("oc get nodes -o wide 2>&1");
		sections.push("## Nodes\n```\n" + truncate(nodes.stdout || nodes.stderr, 3000) + "\n```");

		// Pod status
		const pods = await runCommand(`oc get pods ${ns} -o wide 2>&1`);
		sections.push("## Pods\n```\n" + truncate(pods.stdout || pods.stderr, 3000) + "\n```");

		// Recent events
		const events = await runCommand(`oc get events ${ns} --sort-by='.lastTimestamp' 2>&1`);
		sections.push("## Recent Events\n```\n" + truncate(events.stdout || events.stderr, 2000) + "\n```");

		// Top (if available)
		const top = await runCommand("oc top nodes 2>&1");
		if (top.exitCode === 0) {
			sections.push("## Resource Usage\n```\n" + truncate(top.stdout, 2000) + "\n```");
		}

		return { output: sections.join("\n\n") };
	},
};
