---
title: "Azure OpenAI Provider"
description: "Connect Qualixar OS to Azure OpenAI Service for enterprise deployments"
category: "providers"
tags: ["azure", "openai", "enterprise", "provider"]
last_updated: "2026-04-13"
---

# Azure OpenAI Provider

> **Note:** Azure OpenAI is designed for enterprise environments that require Azure's security, compliance, and regional deployment features. For most users, [Ollama](ollama.md) (free, local), [OpenRouter](openrouter.md) (100+ models), or direct [OpenAI](openai.md)/[Anthropic](anthropic.md) APIs are simpler to set up. Use Azure when your organization mandates it.

Azure OpenAI Service provides access to OpenAI models (GPT-4.1, o3, o4-mini) and Claude models via Azure AI Foundry. Qualixar OS supports Azure's deployment-based model routing, including automatic detection from environment variables.

## Setup via Dashboard

1. Open `qos dashboard`
2. Go to **Settings > Providers**
3. Click **Azure OpenAI** from the provider catalog
4. Enter your **Endpoint URL** and **API Key**
5. Optionally set the **API Version** (defaults to `2024-10-21`)
6. Click **Test Connection**

## Setup via Environment Variables

If you set the following environment variables, Qualixar OS auto-detects your Azure provider on startup -- no manual configuration needed:

```bash
export AZURE_AI_API_KEY=your-azure-key-here
export AZURE_AI_ENDPOINT=https://my-resource.openai.azure.com
```

This is useful for Docker containers and CI/CD environments.

## Deployment Mapping

Azure uses deployment names, not model names. Map your deployments in the dashboard under **Settings > Providers > Azure OpenAI**, or via config:

```yaml
providers:
  my-azure:
    type: azure-openai
    endpoint: https://my-resource.openai.azure.com
    api_key_env: AZURE_AI_API_KEY
    api_version: 2024-10-21
```

## Claude on Azure

Qualixar OS supports Claude models deployed via Azure AI Foundry. The system automatically detects Claude model names and routes them through the Anthropic SDK with the correct Azure endpoint:

```
https://<resource>.openai.azure.com/anthropic
```

No extra configuration needed -- just deploy a Claude model in Azure AI Foundry and it works.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_AI_API_KEY` | Yes | Azure AI API key |
| `AZURE_AI_ENDPOINT` | Yes | Azure resource endpoint URL |

Legacy variables (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`) are also supported as fallbacks.

## Embedding Models

Azure supports embedding deployments:

| Model | Dimensions | Max Tokens |
|-------|-----------|------------|
| `text-embedding-3-large` | 3072 | 8191 |
| `text-embedding-ada-002` | 1536 | 8191 |

Configure in **Settings > Models > Embedding**.

## Troubleshooting

**"Resource not found"**
- Verify the endpoint URL matches your Azure resource exactly
- Ensure the API version is correct (`2024-10-21` or later)

**"Deployment not found"**
- Check that your deployment name matches the Azure portal exactly
- Deployment names are case-sensitive

**"AuthenticationFailed"**
- Verify the API key: `echo $AZURE_AI_API_KEY`
- Ensure the key is from the correct resource

**Regional considerations**
- Model availability varies by Azure region. Check [Azure OpenAI model availability](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models) for your region.
