#!/usr/bin/env node
/**
 * OLS config command — configure lightspeed-cli
 * Usage: ols config set <key> <value>
 *        ols config get <key>
 *        ols config show
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".ols");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface Config {
	serviceUrl?: string;
	namespace?: string;
	kubeconfigPath?: string;
	insecureSkipVerify?: boolean;
}

function loadConfig(): Config {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
	} catch {
		return {};
	}
}

function saveConfig(config: Config): void {
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log("Usage: ols config <command>");
		console.log("");
		console.log("Commands:");
		console.log("  set <key> <value>  Set a config value");
		console.log("  get <key>          Get a config value");
		console.log("  show               Show full config");
		console.log("  init               Interactive setup wizard");
		console.log("");
		console.log("Keys: serviceUrl, namespace, kubeconfigPath, insecureSkipVerify");
		return;
	}

	const cmd = args[0];

	switch (cmd) {
		case "show": {
			const config = loadConfig();
			console.log(JSON.stringify(config, null, 2));
			break;
		}
		case "get": {
			const key = args[1];
			if (!key) {
				console.error("Usage: ols config get <key>");
				process.exit(1);
			}
			const config = loadConfig();
			const value = (config as any)[key];
			if (value === undefined) {
				console.log(`(not set)`);
			} else {
				console.log(value);
			}
			break;
		}
		case "set": {
			const key = args[1];
			const value = args[2];
			if (!key || value === undefined) {
				console.error("Usage: ols config set <key> <value>");
				process.exit(1);
			}
			const config = loadConfig();
			(config as any)[key] = value === "true" ? true : value === "false" ? false : value;
			saveConfig(config);
			console.log(`Set ${key} = ${value}`);
			break;
		}
		case "init": {
			console.log("OpenShift Lightspeed CLI Configuration\n");
			console.log("Default OLS service URL: https://lightspeed-service.openshift-operators.svc:8443");
			console.log("For remote clusters, use the route URL instead.\n");
			console.log("Example:");
			console.log("  ols config set serviceUrl https://lightspeed-my-cluster.example.com");
			console.log("  ols config set namespace openshift-operators");
			console.log("\nAuth comes from your kubeconfig — just run: oc login");
			break;
		}
		default:
			console.error(`Unknown command: ${cmd}`);
			process.exit(1);
	}
}

main();
