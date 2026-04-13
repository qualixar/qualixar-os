---
title: "OpenAI Provider"
description: "Connect Qualixar OS to OpenAI's GPT and embedding models"
category: "providers"
tags: ["openai", "gpt", "provider", "api-key"]
last_updated: "2026-04-05"
---

# OpenAI Provider

OpenAI provides GPT-4.1, GPT-4o, o3, and embedding models. Qualixar OS supports all OpenAI chat and embedding endpoints.

## Setup

### 1. Get an API Key

Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

### 2. Set the Environment Variable

```bash
export OPENAI_API_KEY=sk-proj-...
```

### 3. Configure the Provider

```yaml
# ~/.qualixar-os/config.yaml
providers:
  openai:
    type: openai
    api_key_env: OPENAI_API_KEY
```

### 4. Set Model Preferences

```yaml
models:
  primary: gpt-4.1
  fallback: gpt-4.1-mini
  embedding: text-embedding-3-small
```

## Available Models

| Model | Best For | Context Window |
|-------|----------|----------------|
| `gpt-4.1` | General purpose, coding | 1M tokens |
| `gpt-4.1-mini` | Fast, cost-effective tasks | 1M tokens |
| `gpt-4o` | Multimodal (text + vision) | 128K tokens |
| `o3` | Advanced reasoning | 200K tokens |
| `o3-mini` | Reasoning, lower cost | 200K tokens |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `OPENAI_ORG_ID` | No | Organization ID for billing |

## Advanced Configuration

Use a custom base URL (useful for proxies or compatible APIs):

```yaml
providers:
  openai-proxy:
    type: openai
    api_key_env: OPENAI_API_KEY
    endpoint: https://my-proxy.example.com/v1
```

## Troubleshooting

**"Insufficient quota"**
- Check your billing at platform.openai.com. Ensure you have credits.

**"Model not available"**
- Some models require tier 3+ access. Check your account tier.

**Embedding errors**
- Ensure you specified a valid embedding model in `models.embedding`
- `text-embedding-3-small` is recommended for cost efficiency
