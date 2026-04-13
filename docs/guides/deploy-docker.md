---
title: "Deploy with Docker"
description: "Run Qualixar OS in a Docker container for production deployment"
category: "guides"
tags: ["docker", "deployment", "production", "container"]
last_updated: "2026-04-05"
---

# Deploy with Docker

Qualixar OS ships with a Dockerfile and docker-compose.yml for containerized deployment. This is the recommended approach for production environments.

## Quick Start

```bash
# Clone or navigate to the project
cd qualixar-os

# Build and run with docker-compose
docker-compose up -d
```

The dashboard is available at `http://localhost:3000`.

## Using the Dockerfile

Build the image manually:

```bash
docker build -t qualixar-os .
```

Run the container:

```bash
docker run -d \
  --name qualixar-os \
  -p 3000:3000 \
  -v ~/.qualixar-os:/root/.qualixar-os \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  qualixar-os
```

## Docker Compose

The included `docker-compose.yml` provides a production-ready configuration:

```yaml
version: '3.8'
services:
  qualixar-os:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - qos-data:/root/.qualixar-os
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AZURE_AI_API_KEY=${AZURE_AI_API_KEY}
    restart: unless-stopped

volumes:
  qos-data:
```

## Environment Variables

Pass API keys via environment variables. Create a `.env` file (never commit this):

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
AZURE_AI_API_KEY=...
QOS_DASHBOARD_PASSWORD=secure-password
```

Docker Compose reads `.env` automatically.

## Persistent Data

Mount the data directory to preserve configuration and database across container restarts:

```bash
-v ~/.qualixar-os:/root/.qualixar-os
```

This ensures your config, database (`qos.db`), logs, and plugins persist.

## Connecting to Local Models

If you run Ollama on the host machine, use `host.docker.internal` as the endpoint:

```yaml
# config.yaml inside the container
providers:
  ollama:
    type: ollama
    endpoint: http://host.docker.internal:11434
```

On Linux, add `--network host` or configure Docker networking to reach the host.

## Health Check

```bash
curl http://localhost:3000/api/config
```

A 200 response means the server is healthy.

## Production Tips

- Use a reverse proxy (nginx, Caddy) for TLS termination
- Enable [dashboard authentication](security-setup.md)
- Set resource limits in docker-compose (memory, CPU)
- Monitor container logs: `docker logs qualixar-os`

## Related

- [Security Setup](security-setup.md) — Production security configuration
- [Getting Started](../getting-started.md) — Non-Docker setup
- [Settings Tab](../dashboard/settings.md) — Configure via dashboard
