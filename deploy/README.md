# Qualixar OS Deployment Guide

## Deployment Options

| Platform | Complexity | Cost | Best For |
|----------|-----------|------|----------|
| [Docker Compose](../docker-compose.yml) | Low | Free (local) | Development, self-hosted |
| [Fly.io](./fly-io.md) | Low | Free tier available | Quick public deploy |
| [Railway](./railway.md) | Lowest | Free tier available | 1-click deploy |
| [Azure Container Apps](./azure-container-apps.md) | Medium | Pay-as-you-go | Enterprise, scaling |
| [Kubernetes](./kubernetes.md) | High | Varies | Large-scale production |

## Quick Start (Docker)

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your API keys

# Production
docker compose up -d qos

# Development (hot reload)
docker compose --profile dev up qos-dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | No | — | OpenAI API key (optional) |
| `GOOGLE_API_KEY` | No | — | Google AI API key (optional) |
| `QOS_MODE` | No | `companion` | Operating mode: `companion` or `power` |
| `QOS_HTTP_PORT` | No | `3000` | HTTP API port |
| `QOS_API_KEY` | No | — | Bearer token for API auth (open if unset) |
| `QOS_LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |

## Health Checks

- **Liveness:** `GET /api/health` — returns 200 if the process is alive
- **Readiness:** `GET /api/ready` — returns 200 only when DB + models are operational

## Ports

| Port | Service |
|------|---------|
| 3000 | HTTP REST API + WebSocket |
| 3333 | Dashboard (web UI) |
