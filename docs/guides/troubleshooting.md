---
title: "Troubleshooting"
description: "Common issues and solutions for Qualixar OS"
category: "guides"
tags: ["troubleshooting", "errors", "debugging", "faq", "ollama"]
last_updated: "2026-04-13"
---

# Troubleshooting

Common issues and how to resolve them.

## Installation Issues

### "command not found: qos"

The global npm bin directory is not in your PATH.

```bash
npm config get prefix
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "EACCES: permission denied"

Do not use `sudo npm install -g`. Fix npm permissions: `npm config set prefix '~/.npm-global'` and add `~/.npm-global/bin` to your PATH.

## Ollama Issues

### "Connection refused" to Ollama

Ollama is not running or listening on the expected port.

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama if not running
ollama serve

# If using a custom port, update config.yaml
# providers.local.endpoint: http://localhost:YOUR_PORT
```

### "Model not found" with Ollama

The model has not been pulled yet.

```bash
# List available models
ollama list

# Pull a model
ollama pull llama3
```

### Ollama is slow or runs out of memory

Use smaller models: `llama3` (8B, 8 GB RAM), `phi3` (3.8B, 4 GB), or `mistral` (7B, 8 GB).

## Provider Configuration Errors

### "No providers configured"

No API keys or local models are detected. Fix by configuring at least one provider:

1. **Dashboard**: Go to Settings tab and add a provider
2. **Config file**: Edit `~/.qualixar-os/config.yaml` and add a providers section
3. **Environment**: Set `OLLAMA_HOST=http://localhost:11434` for auto-detection

### "Authentication failed" (cloud providers)

- Verify the environment variable is set: `echo $OPENROUTER_API_KEY`
- Ensure `api_key_env` in config matches the env var name exactly
- Check for trailing whitespace or newlines in the key
- Test the key directly with curl against the provider's API

### Provider test fails in Settings

Common: timeout (endpoint unreachable), 401/403 (invalid key), or rate limited (wait and retry).

## Model Routing Failures

### Chat returns "Model routing error"

The model router could not find any available model. This happens when:
- No providers are configured
- All configured providers have invalid API keys
- Ollama is not running and no cloud providers are set up

**Fix**: Check `/api/setup/status` to see which providers are detected, then configure at least one working provider.

### Agent uses wrong model

Forge assigns models based on the `routing` strategy (`quality`, `balanced`, `cost`). Override by setting `models.primary` in config.

### Degradation fallback activated

If a topology fails, the degradation engine retries with simpler topologies (`degradation:tier_changed` events). This is automatic recovery, not an error.

## Task Issues

### Task stuck in "Running" state

- Check the Events tab or SSE stream for error events
- The model may be slow (especially large local models)
- Budget may have been exhausted -- check the Cost tab
- Use `POST /api/tasks/:id/cancel` to cancel a stuck task

### "Budget exceeded"

Increase limits in config or per-task:

```yaml
budget:
  max_usd: 100
  per_task_max: 5.0
```

### Task output is empty

Check the workspace (`GET /api/tasks/:id/workspace`) and agent logs (`GET /api/tasks/:id/logs`). Qualixar OS extracts file writes from text responses automatically (Universal Type-C), but very short responses may not contain extractable files.

## Database Issues

### "Database locked"

Ensure only one Qualixar OS instance is running. Back up and reset: `cp ~/.qualixar-os/qos.db ~/.qualixar-os/qos.db.backup && qos db reset`.

## Server Issues

### "Port already in use"

Use `qos serve --port 3002 --dashboard` or find the process: `lsof -i :3000`.

### Dashboard shows blank page

Clear browser cache (Cmd+Shift+R), verify the server is running (`curl http://localhost:3000/api/health`), or rebuild the dashboard.

## Getting Help

Check the **Events** tab, review structured logs (`GET /api/logs`), or file issues on GitHub.

## Related

- [Getting Started](../getting-started.md) -- Setup guide
- [Provider Overview](../providers/overview.md) -- Provider configuration
- [Security Setup](security-setup.md) -- Auth and access issues
