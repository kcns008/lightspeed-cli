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
npm install -g @ols-cli/lightspeed
```

## Quick Start

```bash
# Configure OLS endpoint
ols config set serviceUrl https://lightspeed-service.openshift-operators.svc:8443

# Interactive mode
ols

# One-shot query
ols "how do I scale my deployment?"

# Health check
ols health

# List conversations
ols conversations
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

## Tools

| Tool | Description |
|------|-------------|
| `ols_query` | Query OLS for OpenShift knowledge (RAG-powered) |
| `ols_stream` | Streaming query to OLS |
| `ols_health` | Check OLS service health |
| `ols_conversations` | List past conversations |
| `ols_feedback` | Submit response feedback |
| `oc_get` | Get OpenShift resources |
| `oc_describe` | Describe resources in detail |
| `oc_logs` | Fetch pod logs |
| `oc_exec` | Execute commands in pods |
| `cluster_status` | Quick cluster health overview |

## Skills

| Skill | When to Use |
|-------|-------------|
| `troubleshoot-pod` | Pod is CrashLooping, failing, or not ready |
| `deploy-app` | Deploying a new application |
| `security-audit` | Security posture review |
| `cluster-health` | Overall cluster health check |

## Architecture

```
lightspeed-cli/
├── packages/
│   ├── ai/            — Unified LLM API (from pi-mono)
│   ├── agent/         — Agent runtime with tool calling (from pi-mono)
│   ├── tui/           — Terminal UI library (from pi-mono)
│   ├── ols-client/    — OLS REST API client (new)
│   └── ols-cli/       — CLI entry point + TUI (from pi-mono coding-agent)
│       └── src/core/tools/ols/  — OLS + OpenShift tools
├── skills/            — OpenShift-specific agent skills
├── scripts/oc-lightspeed — oc plugin wrapper
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
