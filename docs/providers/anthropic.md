---
title: "Anthropic Provider"
description: "Connect Qualixar OS to Anthropic's Claude models"
category: "providers"
tags: ["anthropic", "claude", "provider", "api-key"]
last_updated: "2026-04-05"
---

# Anthropic Provider

Anthropic provides the Claude family of models. Qualixar OS supports all Claude models including Claude Opus 4, Claude Sonnet 4, and Claude Haiku 4.

## Setup

### 1. Get an API Key

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an API key.

### 2. Set the Environment Variable

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

Add this to your shell profile (`~/.zshrc` or `~/.bashrc`) for persistence.

### 3. Configure the Provider

```yaml
# ~/.qualixar-os/config.yaml
providers:
  anthropic:
    type: anthropic
    api_key_env: ANTHROPIC_API_KEY
```

### 4. Set as Primary Model

```yaml
models:
  primary: claude-sonnet-4-6
  fallback: claude-haiku-4-5
```

## Available Models

| Model | Best For | Context Window |
|-------|----------|----------------|
| `claude-opus-4-6` | Complex reasoning, research | 1M tokens |
| `claude-sonnet-4-6` | Balanced coding and analysis | 200K tokens |
| `claude-haiku-4-5` | Fast tasks, worker agents | 200K tokens |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |

## Troubleshooting

**"Authentication failed"**
- Verify your API key is set: `echo $ANTHROPIC_API_KEY`
- Ensure the key starts with `sk-ant-`

**"Rate limited"**
- Anthropic enforces rate limits per tier. Check your usage tier at console.anthropic.com
- Qualixar OS automatically retries with exponential backoff

**"Model not found"**
- Ensure you are using a valid model identifier (e.g., `claude-sonnet-4-6`, not a legacy name)
- Check the Models tab in the dashboard for the full list of available models

## Cost Estimates

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |

Prices are approximate. Check [anthropic.com/pricing](https://anthropic.com/pricing) for current rates.
