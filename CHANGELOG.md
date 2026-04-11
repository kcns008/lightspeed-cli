# Changelog

## 0.1.0 (2026-04-10)

### Initial Release

- Forked from [pi-mono](https://github.com/badlogic/pi-mono) (MIT, by Mario Zechner)
- Rebranded as `ols` (OpenShift Lightspeed CLI)
- **OLS Client** (`packages/ols-client/`): Full REST API client for OpenShift Lightspeed Service
  - Query, streaming query, conversations, feedback, health check
  - Kubeconfig token extraction for K8S auth
  - Config from `~/.ols/config.json` or `OLS_SERVICE_URL` env var
- **OLS Tools** (`packages/ols-cli/src/core/tools/ols/`):
  - `ols_query` — Natural language queries with RAG
  - `ols_stream` — Streaming responses
  - `ols_health` — Service health check
  - `ols_conversations` — List past conversations
  - `ols_feedback` — Submit feedback
- **OpenShift Tools** (`packages/ols-cli/src/core/tools/openshift-tools.ts`):
  - `oc_get` — Get resources
  - `oc_describe` — Describe resources
  - `oc_logs` — Fetch pod logs
  - `oc_exec` — Execute commands in pods
  - `cluster_status` — Cluster health overview
- **Skills**: troubleshoot-pod, deploy-app, security-audit, cluster-health
- **oc plugin**: `oc lightspeed` support via `oc-lightspeed` wrapper
- **Claude Code plugin**: `.claude-plugin/plugin.json`
- **OpenClaw skill**: `SKILL.md` (AgentSkills format)
- **Install script**: `install.sh` for quick setup
