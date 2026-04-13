---
title: "Custom & Self-Hosted Providers"
description: "Connect Qualixar OS to llama.cpp, vLLM, HuggingFace TGI, or any OpenAI-compatible endpoint"
category: "providers"
tags: ["custom", "vllm", "llamacpp", "huggingface-tgi", "self-hosted", "provider"]
last_updated: "2026-04-05"
---

# Custom & Self-Hosted Providers

Qualixar OS supports three additional local inference backends beyond Ollama and LM Studio: **llama.cpp**, **vLLM**, and **HuggingFace TGI**. You can also connect any service that exposes an OpenAI-compatible API.

## llama.cpp

[llama.cpp](https://github.com/ggerganov/llama.cpp) is a lightweight C++ inference engine. Run its server and point Qualixar OS at it.

```bash
# Start llama.cpp server
./llama-server -m model.gguf --port 8080
```

```yaml
providers:
  llamacpp:
    type: llamacpp
    endpoint: http://localhost:8080
```

## vLLM

[vLLM](https://github.com/vllm-project/vllm) is a high-throughput inference engine optimized for GPU serving. It provides an OpenAI-compatible API out of the box.

```bash
# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.3-70B \
  --port 8000
```

```yaml
providers:
  vllm:
    type: vllm
    endpoint: http://localhost:8000
```

## HuggingFace Text Generation Inference (TGI)

[TGI](https://github.com/huggingface/text-generation-inference) is HuggingFace's production inference server.

```bash
# Start TGI with Docker
docker run --gpus all -p 8080:80 \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id meta-llama/Llama-3.3-70B
```

```yaml
providers:
  huggingface-tgi:
    type: huggingface-tgi
    endpoint: http://localhost:8080
```

## Generic OpenAI-Compatible Endpoint

Any service exposing an OpenAI-compatible API works with the `openai` type and a custom endpoint:

```yaml
providers:
  my-custom:
    type: openai
    endpoint: https://my-inference-server.example.com/v1
    api_key_env: CUSTOM_API_KEY  # if auth is required
```

This works with services like Together AI, Anyscale, Fireworks, Groq, and others.

## Environment Variables

Local providers (llama.cpp, vLLM, TGI) typically need no API key. For cloud-hosted custom endpoints, set the key in an env var and reference it with `api_key_env`.

## Choosing a Backend

| Backend | Best For | GPU Required |
|---------|----------|-------------|
| llama.cpp | CPU inference, small models, edge | No (but faster with GPU) |
| vLLM | High-throughput GPU serving | Yes |
| HuggingFace TGI | Production HF model serving | Yes |
| Ollama | Easy local setup | No |
| LM Studio | GUI-based exploration | No |

## Troubleshooting

**"Connection refused"**
- Verify the server is running and the port matches your config
- Test with `curl http://localhost:<port>/v1/models`

**"Model not loaded"**
- Ensure the model file or HuggingFace model ID is correct
- Check server logs for download or loading errors

**"Out of memory"**
- Use quantized models (GGUF Q4) for llama.cpp
- Reduce `--max-model-len` for vLLM
- Use tensor parallelism across multiple GPUs if available
