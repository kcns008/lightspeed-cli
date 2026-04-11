# Lightspeed CLI

AI-powered OpenShift assistant from your terminal. Built on [pi-mono](https://github.com/badlogic/pi-mono).

Connects to [OpenShift Lightspeed Service (OLS)](https://github.com/openshift/lightspeed-service) and gives you an interactive AI chat in your terminal — powered by your cluster's OLS instance.

## Features

- 🤖 Interactive AI assistant for OpenShift (TUI)
- 🔄 Streaming responses via SSE
- 💬 Session management with branching
- 🔐 K8S auth from kubeconfig (oc login)
- 🛠️ OpenShift-aware tools (oc-get, oc-describe, oc-logs)
- 📊 Cluster status at a glance
- 🔌 `oc` plugin compatible (`oc lightspeed`)

## Install

```bash
npm install -g lightspeed-cli
```

## Usage

```bash
# Interactive mode
ols

# One-shot query
ols "how do I scale my deployment?"

# Streaming mode
ols --stream "check my pod health"

# As oc plugin
oc lightspeed "what's wrong with my cluster?"
```

## Configuration

```bash
# Configure OLS endpoint
ols config set serviceUrl https://lightspeed-service.openshift-operators.svc:8443

# Or via environment
export OLS_SERVICE_URL=https://lightspeed-service.example.com:8443

# Auth comes from kubeconfig — just oc login
oc login https://api.my-cluster:6443
```

## Architecture

```
lightspeed-cli/
├── packages/
│   ├── ai/            — Unified LLM API (from pi-mono)
│   ├── agent/         — Agent runtime with tool calling (from pi-mono)
│   ├── tui/           — Terminal UI library (from pi-mono)
│   ├── ols-client/    — OLS REST API client (new)
│   └── ols-cli/       — CLI entry point + TUI (from pi-mono coding-agent)
├── skills/            — OpenShift-specific agent skills
├── .claude-plugin/    — Claude Code compatible
├── SKILL.md           — OpenClaw / AgentSkills compatible
└── README.md
```

## Requirements

- Node.js >= 20.6.0
- OpenShift cluster with Lightspeed Service deployed
- `oc` CLI (for auth via kubeconfig)

## License

Apache-2.0 (original pi-mono code is MIT)
