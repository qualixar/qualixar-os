---
title: "Ollama Provider"
description: "Run local models with Ollama and Qualixar OS -- free, private, no API key"
category: "providers"
tags: ["ollama", "local", "provider", "self-hosted", "free"]
last_updated: "2026-04-13"
---

# Ollama Provider

Ollama runs open-weight models locally on your machine. No API key required, no data leaves your device, zero cost. This is the recommended starting point for new users.

## Install Ollama

Download from [ollama.com](https://ollama.com) or use your package manager:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Pull a model and start the server:

```bash
ollama pull llama3.3
ollama serve
```

The server runs on `http://localhost:11434` by default.

## Configure in Qualixar OS

**Via Dashboard (recommended):**

1. Open `qos dashboard`
2. Go to **Settings > Providers**
3. Click **Ollama (Local)** from the provider catalog
4. The endpoint defaults to `http://localhost:11434` -- adjust if needed
5. Click **Test Connection**

**Via `qos init`:**

When you run `qos init`, select "Ollama (Local)" as your primary provider. No API key step is needed.

**Via CLI:**

```bash
qos config models.primary ollama/llama3.3
```

## Embedding with Ollama

Ollama supports local embedding models for memory and RAG features. The recommended model is `nomic-embed-text`:

```bash
ollama pull nomic-embed-text
```

Configure it in **Settings > Models > Embedding** or:

```bash
qos config models.embedding nomic-embed-text
```

Available embedding models:

| Model | Dimensions | Max Tokens | Best For |
|-------|-----------|------------|----------|
| `nomic-embed-text` | 768 | 8192 | General purpose (recommended) |
| `mxbai-embed-large` | 1024 | 512 | Higher quality, shorter texts |
| `all-minilm` | 384 | 256 | Lightweight, fast |

## Recommended Models

| Model | Size | Best For |
|-------|------|----------|
| `llama3.3` | 70B | General purpose, strong reasoning |
| `qwen3-coder` | 32B | Code generation |
| `mistral` | 7B | Fast, lightweight tasks |
| `mixtral` | 8x7B | Mixture of experts |
| `deepseek-coder-v2` | 16B | Code-focused tasks |
| `qwen2.5` | 72B | Multilingual |

List your installed models:

```bash
ollama list
```

Installed models appear automatically in the Qualixar OS chat dropdown.

## Ollama Cloud

Ollama also offers a cloud-hosted service with 36+ models. This uses the same Ollama protocol but with an API key and remote endpoint. See [Ollama Cloud](ollama-cloud.md) for setup.

## Custom Endpoint

If Ollama runs on a different host (e.g., a GPU server on your network):

1. Go to **Settings > Providers > Ollama**
2. Change the endpoint URL to `http://192.168.1.100:11434`
3. Click **Test Connection**

You can also set the `OLLAMA_HOST` environment variable:

```bash
export OLLAMA_HOST=http://192.168.1.100:11434
```

## Troubleshooting

**"Connection refused"**
- Ensure Ollama is running: `ollama serve`
- Verify the endpoint: `curl http://localhost:11434/api/tags`

**"Model not found"**
- Pull the model first: `ollama pull <model-name>`
- Check installed models: `ollama list`

**Slow responses**
- Large models (70B+) need 48GB+ RAM
- Use quantized variants (Q4_K_M) on limited hardware
- Use 7B-13B models for worker agents, larger models for leads

## Cost

Ollama is completely free. No API costs -- only your electricity. This makes it ideal for development, testing, privacy-sensitive work, and getting started with Qualixar OS at zero cost.
