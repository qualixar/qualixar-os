---
title: "Config Schema Reference"
description: "Complete reference for ~/.qualixar-os/config.yaml validated by Zod"
category: "reference"
tags: ["config", "yaml", "schema", "reference", "settings"]
last_updated: "2026-04-13"
---

# Config Schema Reference

Qualixar OS is configured via `~/.qualixar-os/config.yaml`. The schema is defined with Zod in `src/types/common.ts` (`QosConfigSchema`). All fields have defaults; an empty file is valid.

## Minimal Example

```yaml
mode: companion
routing: balanced
providers:
  local:
    type: ollama
    endpoint: http://localhost:11434
models:
  primary: ollama/llama3
  fallback: ollama/llama3
budget:
  max_usd: 100
  warn_pct: 0.8
execution:
  max_output_tokens: 16384
  agent_quality: balanced
  enable_shell: false
```

All fields have defaults; an empty file is valid.

## Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `companion \| power` | `companion` | System mode (affects feature gates) |
| `routing` | `quality \| balanced \| cost` | `balanced` | Model routing strategy |

## `providers.<name>`

Each provider is a named entry with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Provider type: `ollama`, `openrouter`, `anthropic`, `openai`, `azure-openai`, `google`, `lmstudio`, `custom` |
| `api_key_env` | string | No | Env var name holding the API key |
| `endpoint` | string | No | Base URL (resolved from `endpoint_env` if not set) |
| `endpoint_env` | string | No | Env var name holding the endpoint URL |
| `api_version` | string | No | API version (Azure) |
| `deployments` | object | No | Model-to-deployment mapping (Azure) |

## `models`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `primary` | string | `claude-sonnet-4-6` | Default model for tasks |
| `fallback` | string | `gpt-4.1-mini` | Fallback when primary fails |
| `judge` | string | (optional) | Model for judge assessments |
| `local` | string | (optional) | Preferred local model |
| `catalog` | array | `[]` | User-defined model entries |

Each catalog entry: `{ name, provider, deployment?, quality_score (0-1), cost_per_input_token, cost_per_output_token, max_tokens }`.

## `budget`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_usd` | number | `100` | Global hard spending limit |
| `warn_pct` | number | `0.8` | Warning threshold (0-1) |
| `per_task_max` | number | (optional) | Per-task spending cap |

## `security`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `container_isolation` | boolean | `false` | Enable container sandboxing |
| `policy_path` | string | (optional) | Custom security policy file |
| `allowed_paths` | string[] | `["./"]` | Paths agents can access |
| `denied_commands` | string[] | `["rm -rf", "sudo"]` | Additional blocked commands |

## `memory`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable memory system |
| `auto_invoke` | boolean | `true` | Auto-recall before tasks |
| `max_ram_mb` | number | `50` | Memory RAM budget |
| `embedding.provider` | string | `azure` | Embedding provider |
| `embedding.model` | string | `text-embedding-3-large` | Embedding model |
| `embedding.dimensions` | number | `3072` | Vector dimensions |

## `execution`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_output_tokens` | number | `16384` | Max output tokens per agent call (1024-32768) |
| `agent_quality` | `balanced \| high \| maximum` | `balanced` | Agent quality tier |
| `enable_shell` | boolean | `false` | Allow shell command execution |

## `toolConnectors`

Array of MCP tool connector entries:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Display name |
| `transport` | `stdio \| streamable-http` | No | Transport type (default: stdio) |
| `command` | string | No | Command to start (stdio) |
| `args` | string[] | No | Command arguments (stdio) |
| `url` | string | No | Server URL (streamable-http) |

## `workspace`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_dir` | string | (empty) | Custom workspace base directory |

## Other Sections

- `dashboard`: `{ enabled: boolean, port: number }`
- `channels`: `{ mcp, http, telegram, discord, webhook }` -- each with `enabled` toggle
- `observability`: `{ otel_endpoint?, log_level }` -- OpenTelemetry and logging
- `db`: `{ path }` -- SQLite database location

## Hot Reload

Config changes are auto-detected via file watcher. The server emits a `config:changed` event when the file is modified.

## Related

- [Settings Tab](../dashboard/settings.md) -- Edit config via dashboard UI
- [Provider Overview](../providers/overview.md) -- Provider-specific config
- [API Endpoints](api-endpoints.md) -- Read/update config via API
