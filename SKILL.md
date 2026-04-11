---
name: lightspeed-cli
description: >
  OpenShift Lightspeed CLI — AI-powered assistant for OpenShift from your terminal.
  Connects to OpenShift Lightspeed Service (OLS) REST API and provides interactive
  chat, streaming responses, cluster-aware tools, and session management.
  Use when working with OpenShift clusters, Kubernetes operations, or needing
  AI-powered cluster assistance from the command line.
metadata:
  author: kcns008
  version: "0.1.0"
compatibility: Requires Node.js >= 20.6.0, OpenShift cluster with Lightspeed Service, oc CLI
---

# Lightspeed CLI — OpenShift AI Assistant

## Overview

An AI-powered CLI that connects to OpenShift Lightspeed Service (OLS) and provides
an interactive assistant in your terminal. Ask questions about your cluster, get
help with OpenShift operations, troubleshoot issues — all from the command line.

## Commands

- `ols` — Start interactive TUI session
- `ols "query"` — One-shot query
- `ols --stream` — Streaming mode
- `ols config` — Configure OLS endpoint
- `ols health` — Check OLS service health
- `ols conversations` — List past conversations

## OLS API Endpoints Used

- `POST /v1/query` — Non-streaming query
- `POST /v1/streaming_query` — Streaming query (SSE)
- `GET /v1/conversations` — List conversations
- `GET /v1/conversations/{id}` — Get conversation
- `POST /v1/feedback` — Submit feedback
- `GET /health` — Health check
- `GET /v1/authorized` — Auth check

## Authentication

Reads K8S bearer token from kubeconfig (`~/.kube/config` or `KUBECONFIG`).
Use `oc login` to authenticate with your OpenShift cluster.

## Configuration

Config stored at `~/.ols/config.json`:
```json
{
  "serviceUrl": "https://lightspeed-service.openshift-operators.svc:8443",
  "namespace": "openshift-operators"
}
```

Or via environment: `OLS_SERVICE_URL`
