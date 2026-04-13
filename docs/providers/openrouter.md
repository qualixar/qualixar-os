---
title: "OpenRouter Provider"
description: "Access 100+ LLM models through a single OpenRouter API key"
category: "providers"
tags: ["openrouter", "cloud", "provider", "multi-model"]
last_updated: "2026-04-13"
---

# OpenRouter Provider

OpenRouter gives you access to 100+ models from multiple providers (OpenAI, Anthropic, Google, Meta, Mistral, and more) through a single API key. It is an excellent choice if you want model variety without managing multiple accounts.

## Why OpenRouter

- **One API key** for Claude, GPT-4.1, Gemini, Llama, Mistral, and many others
- **Free models available** -- several open-weight models have zero cost
- **Pay-per-use** -- no monthly subscription, pay only for what you use
- **Automatic fallback** -- OpenRouter can route to alternative providers if one is down

## Sign Up

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create an account (GitHub or email)
3. Navigate to **API Keys** in your dashboard
4. Click **Create Key** and copy it (starts with `sk-or-...`)

## Configure in Qualixar OS

**Via Dashboard (recommended):**

1. Open `qos dashboard`
2. Go to **Settings > Providers**
3. Click **OpenRouter** from the provider catalog
4. Paste your API key
5. Click **Test Connection**

**Via `qos init`:**

Select "OpenRouter" when the wizard asks for your primary provider, then enter your API key.

**Via environment variable:**

```bash
export OPENROUTER_API_KEY=sk-or-v1-abc123...
```

## Using Models

OpenRouter models use the format `provider/model-name`. In Qualixar OS, set your primary model to any OpenRouter model:

```bash
qos config models.primary anthropic/claude-sonnet-4
```

Or select models directly from the Chat tab dropdown in the dashboard.

## Free Models

OpenRouter offers several models at zero cost. These are useful for development and testing:

| Model | Provider | Notes |
|-------|----------|-------|
| `meta-llama/llama-3.3-70b-instruct:free` | Meta | Strong general purpose |
| `mistralai/mistral-7b-instruct:free` | Mistral | Fast, lightweight |
| `google/gemma-2-9b-it:free` | Google | Compact, capable |
| `qwen/qwen-2.5-72b-instruct:free` | Alibaba | Multilingual |

Check [openrouter.ai/models](https://openrouter.ai/models) for the current free model list -- it changes frequently.

## Popular Paid Models

| Model | Approx. Cost (per 1M tokens) |
|-------|------------------------------|
| `anthropic/claude-sonnet-4` | $3 in / $15 out |
| `openai/gpt-4.1` | $2 in / $8 out |
| `google/gemini-2.5-pro` | $2.5 in / $10 out |
| `meta-llama/llama-3.3-70b-instruct` | $0.40 in / $0.40 out |

## How It Works

Qualixar OS sends requests to `https://openrouter.ai/api/v1` using the OpenAI-compatible chat completions format. The system includes circuit breakers and retry logic, so transient OpenRouter errors are handled automatically.

## Embeddings

OpenRouter does not support embedding models. If you need embeddings for memory or RAG, pair OpenRouter with a local embedding provider:

```bash
# Use OpenRouter for chat, Ollama for embeddings
ollama pull nomic-embed-text
qos config models.embedding nomic-embed-text
```

Or use OpenAI's embedding API alongside OpenRouter for chat.

## Troubleshooting

**"Unauthorized"**
- Verify your API key: `echo $OPENROUTER_API_KEY`
- Ensure the key starts with `sk-or-`
- Check your OpenRouter dashboard for key status

**"Model not found"**
- Verify the model ID at [openrouter.ai/models](https://openrouter.ai/models)
- Model IDs are case-sensitive and use the `provider/model` format

**"Rate limited"**
- OpenRouter applies rate limits per key
- Qualixar OS retries automatically on 429 responses with exponential backoff
- Consider upgrading your OpenRouter plan for higher limits

## Cost

OpenRouter is pay-per-use with no minimum. Add credits at [openrouter.ai/credits](https://openrouter.ai/credits). Free models are available for development and testing. Qualixar OS tracks all OpenRouter spending in the [Cost tab](../dashboard/cost.md).
