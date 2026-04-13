---
title: "Cost Optimization Guide"
description: "Strategies to reduce LLM spending while maintaining quality"
category: "guides"
tags: ["cost", "optimization", "budget", "local-models", "fallback"]
last_updated: "2026-04-13"
---

# Cost Optimization Guide

LLM API costs can add up quickly in multi-agent workflows. This guide covers practical strategies to minimize spending without sacrificing output quality.

## How Cost Tracking Works

The orchestrator tracks cost per task via `CostTracker`. The `BudgetChecker` enforces limits at two levels: a per-task budget (default $1) and a global budget (from `config.yaml`). The `BudgetOptimizer` uses linear programming (integer LP via `javascript-lp-solver`) to assign optimal models to subtasks under a budget constraint while maximizing quality.

## Strategy 1: Local Models First (Cost: $0)

Use Ollama for worker agents. Local inference is free.

```yaml
# ~/.qualixar-os/config.yaml
providers:
  local:
    type: ollama
    endpoint: http://localhost:11434

models:
  primary: ollama/llama3      # free, runs locally
  fallback: ollama/llama3
```

For tasks requiring stronger reasoning, mix local and cloud:

```yaml
models:
  primary: ollama/llama3      # most agents use this (free)
  fallback: ollama/llama3
  judge: claude-sonnet-4-6    # only the judge uses cloud
```

## Strategy 2: Tiered Model Assignment

Use expensive models only where reasoning quality matters.

| Agent Role | Recommended Model | Cost |
|------------|-------------------|------|
| Lead / Orchestrator | Sonnet or GPT-4.1 | $$$ |
| Researcher | Sonnet or Llama 3 | $-$$ |
| Worker / Executor | Llama 3 or Haiku | $0-$ |
| Reviewer / Judge | Haiku or Sonnet | $-$$ |

## Strategy 3: Set Budget Limits

Prevent runaway costs with hard limits in config:

```yaml
budget:
  max_usd: 50          # global hard limit
  warn_pct: 0.8        # warning at 80% usage
  per_task_max: 2.0     # optional per-task cap
```

Per-task override via API:

```json
{ "prompt": "...", "budget_usd": 1.0 }
```

The orchestrator checks budget at init (Step 1), mid-run after swarm execution (Step 6), and enforces a 3x cap during redesign loops.

## Strategy 4: Use the Budget Optimizer

The LP-based budget optimizer solves for the cheapest model assignment that meets a minimum quality threshold. It runs inside Forge when designing teams. You control it via the `routing` config:

```yaml
routing: cost        # cheapest models that meet quality minimum
# or
routing: balanced    # quality/cost ratio (default)
# or
routing: quality     # best models regardless of cost
```

## Strategy 5: OpenRouter for Cloud Fallback

OpenRouter aggregates many providers at competitive prices. Use it as your cloud fallback instead of direct API keys:

```yaml
providers:
  openrouter:
    type: openrouter
    api_key_env: OPENROUTER_API_KEY
```

## Strategy 6: Optimize Token Usage

- **Shorter system prompts** -- every token in the system prompt is charged on every call
- **Set max_output_tokens** -- cap output length (configurable in Settings, default 16384)
- **Use the execution config** to control agent token budgets:

```yaml
execution:
  max_output_tokens: 8192    # lower = cheaper per call
  agent_quality: balanced    # balanced | high | maximum
```

## Strategy 7: Degradation Engine

When swarm execution fails, the degradation engine automatically retries with simpler topologies (e.g., falling back from `mesh` to `sequential`). This avoids wasting budget on failing complex topologies. Up to 3 degradation attempts are made before failing the task.

## Monitoring

Use the **Cost** tab in the dashboard or the API:

```bash
curl http://localhost:3000/api/cost           # summary + budget
curl http://localhost:3000/api/cost/history    # per-call history
```

## Related

- [Cost Management Tab](../dashboard/cost.md) -- Dashboard cost tracking
- [Provider Overview](../providers/overview.md) -- Provider pricing
- [Ollama Provider](../providers/ollama.md) -- Free local inference
