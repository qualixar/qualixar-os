---
title: "Provider Overview"
description: "How Qualixar OS connects to 15+ cloud and local LLM providers"
category: "providers"
tags: ["providers", "models", "llm", "configuration"]
last_updated: "2026-04-13"
---

# Provider Overview

Qualixar OS supports 15+ LLM providers out of the box. You configure them through the **Settings > Providers** tab in the dashboard -- no YAML editing required. The system handles routing, failover, circuit breaking, and cost tracking automatically.

## Recommended Starting Points

| Provider | Why | Cost |
|----------|-----|------|
| **Ollama (Local)** | Free, private, no API key needed | $0 |
| **OpenRouter** | 100+ models via one API key, free tier available | Pay-per-use |
| **OpenAI** | GPT-4.1, o3, o4-mini -- strong general-purpose | Pay-per-use |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4.5 -- top reasoning | Pay-per-use |

If you want to start for free, use **Ollama**. If you want access to many models without multiple accounts, use **OpenRouter**.

## Full Provider Catalog

The table below lists all 15 providers in the catalog. Providers marked **Full** have complete routing and SDK integration in `model-call.ts`. Providers marked **Catalog** are defined in the provider catalog (appear in Settings UI, can be configured) but route through the OpenAI-compatible fallback or are pending dedicated SDK integration.

| Provider | Type Key | Local/Cloud | Auth | Embeddings | Routing Status |
|----------|----------|-------------|------|------------|----------------|
| Ollama | `ollama` | Local | None | nomic-embed-text, mxbai-embed-large | Full |
| OpenRouter | `openrouter` | Cloud | API key | No | Full |
| OpenAI | `openai` | Cloud | API key | text-embedding-3-large/small | Full |
| Anthropic | `anthropic` | Cloud | API key | No | Full |
| Google AI | `google` | Cloud | API key | text-embedding-004 | Full |
| Groq | `groq` | Cloud | API key | No | Full |
| DeepSeek | `deepseek` | Cloud | API key | No | Full |
| Together AI | `together` | Cloud | API key | M2-BERT | Full |
| Azure OpenAI | `azure-openai` | Cloud | API key + endpoint | text-embedding-3-large | Full |
| AWS Bedrock | `bedrock` | Cloud | AWS credentials | Titan Embed v2 | Full |
| Mistral AI | `mistral` | Cloud | API key | mistral-embed | Catalog |
| Fireworks AI | `fireworks` | Cloud | API key | nomic-embed-v1.5 | Catalog |
| Cerebras | `cerebras` | Cloud | API key | No | Catalog |
| Cohere | `cohere` | Cloud | API key | embed-english-v3, multilingual-v3 | Catalog |
| Custom Endpoint | `custom` | Either | Optional | User-specified | Catalog |

**Note:** Catalog-only providers can be configured in the dashboard but do not yet have dedicated routing logic in the model router. They will fall through to the default handler. Full routing integration for these providers is planned.

## Setup via Dashboard (Recommended)

1. Open the dashboard: `qos dashboard`
2. Go to **Settings > Providers**
3. Click **Add Provider** and select from the catalog
4. Enter your API key (stored securely, never written to plaintext)
5. Click **Test Connection** to verify
6. Your provider's models appear automatically in the Chat tab

## Model Routing

Qualixar OS routes requests based on your primary and fallback model settings. Configure these in **Settings > Models** or via the CLI:

```bash
qos config models.primary claude-sonnet-4-6
qos config models.fallback ollama/llama3
```

The system resolves which provider serves each model. If the primary fails or exceeds budget, it falls back automatically.

## Embeddings

Providers that support embeddings (marked above) can be used for memory, RAG, and semantic search. Configure your embedding model in **Settings > Models > Embedding**. Popular choices:

- **Ollama**: `nomic-embed-text` (free, local, 768 dimensions)
- **OpenAI**: `text-embedding-3-small` (1536 dimensions)
- **Cohere**: `embed-english-v3.0` (1024 dimensions)

## Cost Tracking

Every API call is logged with token counts and estimated cost. Set spending limits in **Settings > Budget** or via config:

```bash
qos config budget.max_usd 50
qos config budget.warn_pct 0.8
```

See [Cost Management](../dashboard/cost.md) for the dashboard view.

## Provider-Specific Guides

- [Ollama (Local)](ollama.md) -- Free, private, no API key
- [Ollama Cloud](ollama-cloud.md) -- 36+ hosted models with API key
- [OpenRouter](openrouter.md) -- 100+ models via single key
- [Anthropic](anthropic.md) -- Claude models
- [OpenAI](openai.md) -- GPT and o-series models
- [Azure OpenAI](azure.md) -- Enterprise deployments
- [LM Studio](lmstudio.md) -- Local GUI-based inference
- [Custom / Self-Hosted](custom.md) -- Any OpenAI-compatible endpoint
