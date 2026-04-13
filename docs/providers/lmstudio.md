---
title: "LM Studio Provider"
description: "Connect Qualixar OS to LM Studio for local model inference"
category: "providers"
tags: ["lmstudio", "local", "provider", "gui"]
last_updated: "2026-04-05"
---

# LM Studio Provider

LM Studio is a desktop application for running local LLMs with a GUI. It exposes an OpenAI-compatible API, making it easy to integrate with Qualixar OS.

## Prerequisites

1. Download LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Open LM Studio and download a model from the built-in model browser
3. Load the model and start the local server (default: port 1234)

## Configuration

```yaml
# ~/.qualixar-os/config.yaml
providers:
  lmstudio:
    type: lmstudio
    endpoint: http://localhost:1234
```

## Usage

Set it as a fallback for free local inference:

```yaml
models:
  primary: claude-sonnet-4-6
  fallback: local-model       # whatever model is loaded in LM Studio
```

LM Studio serves whichever model is currently loaded. Qualixar OS auto-detects the available model via the `/v1/models` endpoint.

## Environment Variables

None required. LM Studio runs locally without authentication.

## Recommended Models

| Model | Size | Use Case |
|-------|------|----------|
| Llama 3.3 70B Q4 | ~40GB | General purpose |
| DeepSeek Coder V2 | ~10GB | Code generation |
| Mistral 7B | ~4GB | Fast lightweight tasks |
| Phi-3 Medium | ~8GB | Balanced performance |

## Troubleshooting

**"Connection refused"**
- Ensure LM Studio's local server is running (check the "Local Server" tab)
- Default port is 1234 — verify it matches your config

**"No model loaded"**
- Load a model in LM Studio before making requests
- The API only works when a model is actively loaded

**Slow inference**
- Use quantized models (Q4_K_M or Q5_K_M) for better speed
- Enable GPU acceleration in LM Studio settings if you have a compatible GPU

## LM Studio vs Ollama

| Feature | LM Studio | Ollama |
|---------|-----------|--------|
| Interface | GUI + API | CLI + API |
| Model management | Visual browser | CLI pull |
| Multi-model | One at a time | Multiple concurrent |
| Best for | Exploration, testing | Production, automation |

Both work well with Qualixar OS. Use LM Studio when you want a visual interface for model experimentation, and Ollama for headless or production environments.
