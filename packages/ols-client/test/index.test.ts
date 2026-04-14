import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

// --- Test Helpers ---

function tmpDir(): string {
	const dir = join(tmpdir(), `ols-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeKubeconfig(dir: string, content: string): string {
	const path = join(dir, "kubeconfig");
	writeFileSync(path, content);
	return path;
}

function makeKubeconfig(opts: { token?: string; context?: string; user?: string } = {}): string {
	const token = opts.token || "sha256~test-token-abc123";
	const context = opts.context || "mycontext";
	const user = opts.user || "admin";
	return `apiVersion: v1
kind: Config
current-context: ${context}
clusters:
- cluster:
    server: https://api.example.com:6443
  name: mycluster
contexts:
- context:
    cluster: mycluster
    user: ${user}
  name: ${context}
users:
- name: ${user}
  user:
    token: ${token}
`;
}

// --- Tests ---

describe("extractTokenFromKubeconfig", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = tmpDir();
	});

	afterEach(() => {
		if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true });
	});

	it("extracts token from a valid kubeconfig", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		const path = writeKubeconfig(tmp, makeKubeconfig({ token: "sha256~my-secret-token" }));
		const token = extractTokenFromKubeconfig(path);
		expect(token).toBe("sha256~my-secret-token");
	});

	it("throws when kubeconfig file does not exist", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		expect(() => extractTokenFromKubeconfig("/nonexistent/path/kubeconfig")).toThrow("Kubeconfig not found");
	});

	it("throws when no current-context is set", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		const path = writeKubeconfig(
			tmp,
			`apiVersion: v1
kind: Config
clusters: []
contexts: []
users: []
`,
		);
		expect(() => extractTokenFromKubeconfig(path)).toThrow("No current-context");
	});

	it("throws when context references unknown user", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		const path = writeKubeconfig(
			tmp,
			`apiVersion: v1
kind: Config
current-context: myctx
contexts:
- context:
    cluster: c1
    user: ghost-user
  name: myctx
users:
- name: other-user
  user:
    token: abc
`,
		);
		expect(() => extractTokenFromKubeconfig(path)).toThrow('User "ghost-user" not found');
	});

	it("throws when user has no token", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		const path = writeKubeconfig(
			tmp,
			`apiVersion: v1
kind: Config
current-context: myctx
contexts:
- context:
    cluster: c1
    user: admin
  name: myctx
users:
- name: admin
  user:
    client-certificate-data: abc
`,
		);
		expect(() => extractTokenFromKubeconfig(path)).toThrow("No token found");
	});

	it("handles kubeconfig with multiple contexts", async () => {
		const { extractTokenFromKubeconfig } = await import("../src/index.js");
		const path = writeKubeconfig(
			tmp,
			`apiVersion: v1
kind: Config
current-context: prod
contexts:
- context:
    cluster: dev-cluster
    user: dev-user
  name: dev
- context:
    cluster: prod-cluster
    user: prod-user
  name: prod
users:
- name: dev-user
  user:
    token: dev-token-123
- name: prod-user
  user:
    token: prod-token-456
`,
		);
		const token = extractTokenFromKubeconfig(path);
		expect(token).toBe("prod-token-456");
	});
});

describe("NIMClient", () => {
	it("throws if no API key provided", async () => {
		const { NIMClient } = await import("../src/index.js");
		expect(() => new NIMClient({ nimApiKey: "" })).toThrow("NIM API key is required");
		expect(() => new NIMClient({})).toThrow("NIM API key is required");
	});

	it("constructs with valid config", async () => {
		const { NIMClient } = await import("../src/index.js");
		const client = new NIMClient({
			nimApiKey: "nvapi-test-key",
			nimModel: "meta/llama-3.1-405b-instruct",
			nimBaseUrl: "https://custom.api.example.com",
		});
		expect(client).toBeDefined();
	});

	it("uses default model and base URL when not specified", async () => {
		const { NIMClient } = await import("../src/index.js");
		const client = new NIMClient({ nimApiKey: "nvapi-test-key" });
		expect(client).toBeDefined();
	});

	it("chat sends correct request to NIM API", async () => {
		const { NIMClient } = await import("../src/index.js");
		const mockResponse = {
			id: "chatcmpl-123",
			choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		};

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(mockResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const client = new NIMClient({ nimApiKey: "nvapi-test-key", nimModel: "test-model" });
		const result = await client.chat([{ role: "user", content: "Hello" }]);

		expect(result.choices[0].message.content).toBe("Hello!");
		expect(fetchSpy).toHaveBeenCalledOnce();

		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
		expect(opts.method).toBe("POST");

		const body = JSON.parse(opts.body);
		expect(body.model).toBe("test-model");
		expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);

		fetchSpy.mockRestore();
	});

	it("chat throws on API error", async () => {
		const { NIMClient } = await import("../src/index.js");

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Unauthorized", { status: 401 }),
		);

		const client = new NIMClient({ nimApiKey: "nvapi-bad-key" });
		await expect(client.chat([{ role: "user", content: "test" }])).rejects.toThrow("NIM API error 401");

		fetchSpy.mockRestore();
	});

	it("query wraps chat with system prompt and history", async () => {
		const { NIMClient } = await import("../src/index.js");
		const mockResponse = {
			id: "chatcmpl-456",
			choices: [{ message: { role: "assistant", content: "Use oc scale dc/myapp --replicas=3" }, finish_reason: "stop" }],
		};

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(mockResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const history = [
			{ role: "user" as const, content: "what is openshift?" },
			{ role: "assistant" as const, content: "OpenShift is a container platform." },
		];

		const client = new NIMClient({ nimApiKey: "nvapi-test" });
		const result = await client.query("how do I scale?", history);

		expect(result).toBe("Use oc scale dc/myapp --replicas=3");

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
		// System prompt + 2 history + 1 user = 4 messages
		expect(body.messages).toHaveLength(4);
		expect(body.messages[0].role).toBe("system");
		expect(body.messages[3].content).toBe("how do I scale?");

		fetchSpy.mockRestore();
	});
});

describe("smartQuery", () => {
	it("returns NIM result when OLS is not configured", async () => {
		const { smartQuery } = await import("../src/index.js");
		const mockResponse = {
			id: "chatcmpl-789",
			choices: [{ message: { role: "assistant", content: "NIM answer" }, finish_reason: "stop" }],
		};

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(mockResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const result = await smartQuery("test question", { serviceUrl: "", nimApiKey: "nvapi-key" });
		expect(result.source).toBe("nim");
		expect(result.response).toBe("NIM answer");

		fetchSpy.mockRestore();
	});

	it("throws when no backends are configured", async () => {
		const { smartQuery } = await import("../src/index.js");
		await expect(smartQuery("test", { serviceUrl: "" })).rejects.toThrow("No backend available");
	});
});

describe("loadOLSConfig / saveOLSConfig", () => {
	let tmp: string;
	let origHome: string;

	beforeEach(() => {
		tmp = tmpDir();
		origHome = process.env.HOME || "";
		// Override HOME so config goes to temp dir
		process.env.HOME = tmp;
	});

	afterEach(() => {
		process.env.HOME = origHome;
		if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true });
	});

	it("loadOLSConfig returns defaults when no config file exists", async () => {
		const { loadOLSConfig } = await import("../src/index.js");
		const cfg = loadOLSConfig();
		expect(cfg.serviceUrl).toBeDefined();
	});

	it("saveOLSConfig creates config file and loadOLSConfig reads it", async () => {
		const { loadOLSConfig, saveOLSConfig } = await import("../src/index.js");

		const cfg = {
			serviceUrl: "https://ols.example.com:8443",
			nimApiKey: "nvapi-test",
			nimModel: "test-model",
		};
		saveOLSConfig(cfg);

		// Verify file exists
		const configPath = join(tmp, ".ols", "config.json");
		expect(existsSync(configPath)).toBe(true);

		// Verify we can read it back
		const loaded = loadOLSConfig();
		expect(loaded.serviceUrl).toBe("https://ols.example.com:8443");
		expect(loaded.nimApiKey).toBe("nvapi-test");
		expect(loaded.nimModel).toBe("test-model");
	});

	it("loadOLSConfig respects OLS_SERVICE_URL env var", async () => {
		const { loadOLSConfig } = await import("../src/index.js");
		const prev = process.env.OLS_SERVICE_URL;
		process.env.OLS_SERVICE_URL = "https://env-ols.example.com:8443";
		try {
			const cfg = loadOLSConfig();
			expect(cfg.serviceUrl).toBe("https://env-ols.example.com:8443");
		} finally {
			if (prev === undefined) delete process.env.OLS_SERVICE_URL;
			else process.env.OLS_SERVICE_URL = prev;
		}
	});
});

describe("OLSConfig type", () => {
	it("includes NIM fields", async () => {
		const { loadOLSConfig, saveOLSConfig } = await import("../src/index.js");
		// Verify the type allows NIM config
		const cfg = {
			serviceUrl: "",
			nimApiKey: "nvapi-xxx",
			nimModel: "meta/llama-3.1",
			nimBaseUrl: "https://custom.nvidia.com",
			insecureSkipVerify: true,
		};
		// Should not throw
		expect(cfg.insecureSkipVerify).toBe(true);
		expect(cfg.nimApiKey).toBe("nvapi-xxx");
	});
});
