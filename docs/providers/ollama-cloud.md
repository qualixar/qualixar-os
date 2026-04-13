---
title: "Ollama Cloud Provider"
description: "Use Ollama's cloud-hosted models with Qualixar OS"
category: "providers"
tags: ["ollama", "cloud", "provider", "hosted"]
last_updated: "2026-04-13"
---

# Ollama Cloud

Ollama Cloud provides cloud-hosted inference using the same Ollama API protocol. You get access to 36+ models without running anything locally -- useful when you lack GPU hardware or need models larger than your machine can handle.

## What is Ollama Cloud

Ollama Cloud is a hosted version of the Ollama inference server. It supports the same `/api/chat` and `/api/tags` endpoints as local Ollama, but runs on remote GPU infrastructure. You authenticate with an API key via a Bearer token.

## Available Models

Ollama Cloud offers 36+ models including:

| Model | Parameters | Strengths |
|-------|-----------|-----------|
| `deepseek-v3.1` | 671B MoE | Reasoning, code, math |
| `kimi-k2` | 1T MoE | Long context, multilingual |
| `qwen3-coder` | 32B | Code generation, debugging |
| `llama3.3` | 70B | General purpose |
| `mistral-large` | 123B | Multilingual, enterprise |
| `gemma-3` | 27B | Compact, efficient |
| `phi-4` | 14B | Reasoning, lightweight |
| `command-r-plus` | 104B | RAG, tool use |

Check [ollama.com/cloud](https://ollama.com) for the full current model list.

## Getting an API Key

1. Go to [ollama.com](https://ollama.com) and sign in
2. Navigate to your account settings
3. Generate a cloud API key
4. Copy the key for use below

## Configure in Qualixar OS

Ollama Cloud uses the same provider type as local Ollama, but with a remote endpoint and API key.

**Via Dashboard:**

1. Open `qos dashboard`
2. Go to **Settings > Providers**
3. Click **Add Provider** and select **Custom / Local Endpoint**
4. Set the endpoint to your Ollama Cloud URL (e.g., `https://api.ollama.com`)
5. Enter your API key in the API Key field
6. Name the provider (e.g., "ollama-cloud")
7. Click **Test Connection**

**Via environment variable and config:**

```bash
# Set the API key
export OLLAMA_CLOUD_KEY=your-ollama-cloud-key

# Configure via CLI
qos config providers.ollama-cloud.type ollama
qos config providers.ollama-cloud.endpoint https://api.ollama.com
qos config providers.ollama-cloud.api_key_env OLLAMA_CLOUD_KEY
```

## How Authentication Works

Qualixar OS sends the API key as a Bearer token in the `Authorization` header on every request to the Ollama endpoint. This is handled automatically -- the same code path supports both local (no auth) and cloud (Bearer token) Ollama.

From the source:

```
Authorization: Bearer <your-api-key>
```

Local Ollama skips this header entirely. The system detects which mode to use based on whether an API key is configured.

## Using Models

Once configured, Ollama Cloud models appear in the Chat tab dropdown. Set a cloud model as primary:

```bash
qos config models.primary deepseek-v3.1
```

Or select it from the model dropdown in the dashboard.

## Embeddings

If your Ollama Cloud plan includes embedding models, you can use them the same way as local Ollama embeddings:

```bash
qos config models.embedding nomic-embed-text
```

Otherwise, pair Ollama Cloud with a local embedding provider (local Ollama with `nomic-embed-text` is free and works well).

## Local + Cloud Together

A common setup is to use local Ollama for small/fast models and Ollama Cloud for large models:

- **Primary**: `deepseek-v3.1` via Ollama Cloud (large model, cloud GPU)
- **Fallback**: `llama3.3` via local Ollama (free, offline-capable)
- **Embedding**: `nomic-embed-text` via local Ollama (free)

Configure both providers in **Settings > Providers** and set your routing in **Settings > Models**.

## Troubleshooting

**"Unauthorized" or "401"**
- Verify your API key is set: `echo $OLLAMA_CLOUD_KEY`
- Ensure the key is valid and not expired

**"Model not found"**
- Check which models are available on your Ollama Cloud plan
- Model names must match exactly (case-sensitive)

**Slow responses**
- Cloud latency depends on model size and current load
- Large models (671B+) take longer to generate
- Consider smaller models for interactive use

## Cost

Ollama Cloud pricing is separate from local Ollama (which is free). Check your Ollama account dashboard for current pricing. Qualixar OS tracks all token usage and costs in the [Cost tab](../dashboard/cost.md).
