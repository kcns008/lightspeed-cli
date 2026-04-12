#!/usr/bin/env node
/**
 * ols — OpenShift Lightspeed CLI
 *
 * Usage:
 *   ols                          Interactive mode
 *   ols "how do I scale?"        One-shot query
 *   ols health                   Check OLS health
 *   ols conversations            List conversations
 *   ols config set <key> <val>   Set config
 *   ols config show              Show config
 */
const { OLSClient, loadOLSConfig, saveOLSConfig } = require("@ols-cli/client");

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
    console.log(JSON.stringify(cfg, null, 2));
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
    console.log("  ols config set serviceUrl https://lightspeed-service.example.com:8443");
    console.log("  ols config set namespace openshift-operators\n");
    console.log("Auth comes from kubeconfig — just run: oc login");
    return;
  }
  console.log("Usage: ols config [show|set|init]");
}

async function healthCmd() {
  try {
    const client = new OLSClient(loadOLSConfig());
    const h = await client.health();
    console.log(`${green}✓${reset} OLS Status: ${h.status}`);
    if (h.services) {
      for (const [name, status] of Object.entries(h.services)) {
        const icon = status === "ok" || status === "ready" ? green : yellow;
        console.log(`  ${icon}●${reset} ${name}: ${status}`);
      }
    }
  } catch (e) {
    console.error(`${red}✗${reset} ${e.message}`);
    process.exit(1);
  }
}

async function conversationsCmd() {
  try {
    const client = new OLSClient(loadOLSConfig());
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
    process.exit(1);
  }
}

async function queryCmd(question) {
  try {
    const client = new OLSClient(loadOLSConfig());
    const resp = await client.query({ query: question });
    console.log(`\n${resp.response}\n`);
    if (resp.referenced_documents && resp.referenced_documents.length) {
      console.log(`${dim}References:${reset}`);
      for (const doc of resp.referenced_documents) {
        console.log(`  ${cyan}→${reset} ${doc.title} ${dim}(${doc.url})${reset}`);
      }
      console.log();
    }
    if (resp.conversation_id) {
      console.log(`${dim}Conversation: ${resp.conversation_id}${reset}`);
    }
  } catch (e) {
    console.error(`${red}✗${reset} ${e.message}`);
    process.exit(1);
  }
}

async function interactiveMode() {
  const readline = require("readline");

  console.log(`\n${bold}${cyan}OpenShift Lightspeed CLI${reset} v0.1.0`);
  console.log(`${dim}Type your question, or 'quit' to exit.${reset}\n`);

  let conversationId;

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

    try {
      const client = new OLSClient(loadOLSConfig());
      const resp = await client.query({ query: input, conversation_id: conversationId });
      conversationId = resp.conversation_id;
      console.log(`\n${resp.response}\n`);
      if (resp.referenced_documents && resp.referenced_documents.length) {
        console.log(`${dim}References:${reset}`);
        for (const doc of resp.referenced_documents) {
          console.log(`  ${cyan}→${reset} ${doc.title}`);
        }
        console.log();
      }
    } catch (e) {
      console.error(`${red}✗${reset} ${e.message}`);
    }
    rl.prompt();
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return interactiveMode();
  }

  const cmd = args[0];

  if (cmd === "config") return configCmd(args.slice(1));
  if (cmd === "health") return await healthCmd();
  if (cmd === "conversations" || cmd === "convos") return await conversationsCmd();
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(`${bold}Usage:${reset}
  ols                          Interactive mode
  ols "your question"          One-shot query
  ols health                   Check OLS service health
  ols conversations            List past conversations
  ols config show              Show configuration
  ols config set <key> <val>   Set config value
  ols config init              Setup help
  ols help                     This help
`);
    return;
  }

  return await queryCmd(args.join(" "));
}

main().catch((e) => {
  console.error(`${red}Fatal:${reset} ${e.message}`);
  process.exit(1);
});
