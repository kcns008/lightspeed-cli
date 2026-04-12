#!/usr/bin/env node
/**
 * ols — OpenShift Lightspeed CLI
 * AI-powered assistant with OLS + NVIDIA NIM backends
 */
const { OLSClient, smartQuery, loadOLSConfig, saveOLSConfig } = require("@ols-cli/client");

const cyan = "\x1b[36m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";
const dim = "\x1b[2m";

function configCmd(args) {
  const cmd = args[0];
  if (!cmd || cmd === "show") {
    const cfg = loadOLSConfig();
    // Mask API keys
    const safe = { ...cfg };
    if (safe.nimApiKey) safe.nimApiKey = safe.nimApiKey.slice(0, 8) + "...";
    if (safe._conversationId) delete safe._conversationId;
    console.log(JSON.stringify(safe, null, 2));
    return;
  }
  if (cmd === "set" && args[1] && args[2] !== undefined) {
    const cfg = loadOLSConfig();
    const val = args[2] === "true" ? true : args[2] === "false" ? false : args[2];
    cfg[args[1]] = val;
    saveOLSConfig(cfg);
    console.log(`${green}✓${reset} Set ${args[1]} = ${args[2]}`);
    return;
  }
  if (cmd === "init") {
    console.log(`${cyan}OpenShift Lightspeed CLI Configuration${reset}\n`);
    console.log("  # Option 1: OpenShift Lightspeed Service");
    console.log("  ols config set serviceUrl https://lightspeed-service.example.com:8443");
    console.log("");
    console.log("  # Option 2: NVIDIA NIM (works without OLS)");
    console.log("  ols config set nimApiKey nvapi-xxxxx");
    console.log("  ols config set nimModel nvidia/llama-3.1-nemotron-70b-instruct");
    console.log("");
    console.log("  # Auth from kubeconfig (for OLS): oc login");
    return;
  }
  console.log("Usage: ols config [show|set|init]");
}

async function healthCmd() {
  const cfg = loadOLSConfig();
  console.log(`\n${bold}Health Check${reset}\n`);

  // Check OLS
  if (cfg.serviceUrl) {
    try {
      const client = new OLSClient(cfg);
      const h = await client.health();
      console.log(`  ${green}✓${reset} OLS: ${h.status}`);
    } catch (e) {
      console.log(`  ${red}✗${reset} OLS: ${e.message}`);
    }
  } else {
    console.log(`  ${yellow}○${reset} OLS: not configured`);
  }

  // Check NIM
  if (cfg.nimApiKey) {
    try {
      const { NIMClient } = require("@ols-cli/client");
      const nim = new NIMClient(cfg);
      const resp = await nim.chat([{ role: "user", content: "ping" }]);
      console.log(`  ${green}✓${reset} NIM: connected (${cfg.nimModel || "default model"})`);
    } catch (e) {
      console.log(`  ${red}✗${reset} NIM: ${e.message}`);
    }
  } else {
    console.log(`  ${yellow}○${reset} NIM: not configured (set nimApiKey)`);
  }
  console.log();
}

async function conversationsCmd() {
  const cfg = loadOLSConfig();
  if (!cfg.serviceUrl) {
    console.log(`${yellow}OLS not configured. Set serviceUrl first.${reset}`);
    return;
  }
  try {
    const client = new OLSClient(cfg);
    const convos = await client.listConversations();
    if (convos.length === 0) {
      console.log(`${dim}No conversations found.${reset}`);
      return;
    }
    console.log(`${bold}Recent Conversations${reset}\n`);
    for (const c of convos.slice(0, 20)) {
      const date = new Date(c.created_at).toLocaleDateString();
      console.log(`  ${cyan}${c.id}${reset}  ${dim}${date}${reset}  ${c.first_query || "(no query)"}  [${c.message_count} msgs]`);
    }
  } catch (e) {
    console.error(`${red}✗${reset} ${e.message}`);
  }
}

async function queryCmd(question) {
  try {
    const cfg = loadOLSConfig();
    const result = await smartQuery(question, cfg, []);
    console.log(`\n${result.response}\n`);
    if (result.references && result.references.length) {
      console.log(`${dim}References:${reset}`);
      for (const doc of result.references) {
        console.log(`  ${cyan}→${reset} ${doc.title} ${dim}(${doc.url})${reset}`);
      }
      console.log();
    }
    console.log(`${dim}via ${result.source}${reset}`);
  } catch (e) {
    console.error(`${red}✗${reset} ${e.message}`);
  }
}

async function interactiveMode() {
  const readline = require("readline");
  const cfg = loadOLSConfig();

  const backend = cfg.nimApiKey ? (cfg.serviceUrl ? "OLS + NIM" : "NIM") : "OLS";

  console.log(`\n${bold}${cyan}OpenShift Lightspeed CLI${reset} v0.2.0  ${dim}[${backend}]${reset}`);
  console.log(`${dim}Type your question, or 'quit' to exit.${reset}\n`);

  const history = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${green}ols>${reset} `,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "quit" || input === "exit" || input === "q") {
      console.log(`${dim}Bye!${reset}`);
      process.exit(0);
    }
    if (input === "health") { await healthCmd(); rl.prompt(); return; }
    if (input === "conversations") { await conversationsCmd(); rl.prompt(); return; }
    if (input === "config") { configCmd(["show"]); rl.prompt(); return; }

    try {
      const currentCfg = loadOLSConfig();
      const result = await smartQuery(input, currentCfg, history);
      history.push({ role: "user", content: input });
      history.push({ role: "assistant", content: result.response });
      console.log(`\n${result.response}\n`);
      if (result.references && result.references.length) {
        console.log(`${dim}References:${reset}`);
        for (const doc of result.references) {
          console.log(`  ${cyan}→${reset} ${doc.title}`);
        }
        console.log();
      }
      console.log(`${dim}via ${result.source}${reset}`);
    } catch (e) {
      console.error(`${red}✗${reset} ${e.message}`);
    }
    rl.prompt();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) return interactiveMode();

  const cmd = args[0];
  if (cmd === "config") return configCmd(args.slice(1));
  if (cmd === "health") return await healthCmd();
  if (cmd === "conversations" || cmd === "convos") return await conversationsCmd();
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(`${bold}OpenShift Lightspeed CLI${reset}

${bold}Usage:${reset}
  ols                          Interactive mode
  ols "your question"          One-shot query
  ols health                   Check backends health
  ols conversations            List OLS conversations
  ols config show              Show configuration
  ols config set <key> <val>   Set config value
  ols config init              Setup help
  ols help                     This help

${bold}Config keys:${reset}
  serviceUrl     OLS service URL
  nimApiKey      NVIDIA NIM API key (fallback LLM)
  nimModel       NIM model name
  nimBaseUrl     NIM API base URL

${bold}Backends:${reset}
  1. OLS (OpenShift Lightspeed Service) — primary
  2. NVIDIA NIM (OpenAI-compatible) — fallback
`);
    return;
  }

  return await queryCmd(args.join(" "));
}

main().catch((e) => {
  console.error(`${red}Fatal:${reset} ${e.message}`);
  process.exit(1);
});
