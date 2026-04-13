---
title: "Cost Management Tab"
description: "Track and control LLM spending across providers and tasks"
category: "dashboard"
tags: ["cost", "budget", "spending", "tokens", "dashboard"]
last_updated: "2026-04-05"
---

# Cost Management Tab

The Cost tab gives you full visibility into LLM spending. Every API call is tracked with token counts and estimated cost, broken down by provider, model, task, and agent.

## Dashboard Views

### Summary
- **Total spend** — lifetime and current billing period
- **Budget remaining** — based on your `budget.max_usd` config
- **Burn rate** — daily/weekly cost trend
- **Warning indicator** — turns yellow at `warn_pct`, red at 100%

### By Provider
Cost breakdown per configured provider. Useful for comparing cloud vs. local costs.

### By Model
Which models are consuming the most budget. Helps identify opportunities to switch to cheaper models for certain tasks.

### By Task
Cost per task, including all agent calls within that task. Identifies expensive workflows.

## Budget Configuration

Set spending limits in `~/.qualixar-os/config.yaml`:

```yaml
budget:
  max_usd: 100       # hard limit — stops execution when reached
  warn_pct: 0.8      # warning at 80% of budget
  period: monthly     # reset period: daily, weekly, monthly, or none
```

Per-provider limits:

```yaml
providers:
  openai:
    type: openai
    api_key_env: OPENAI_API_KEY
    budget_usd: 50    # limit this provider to $50
```

## API Access

```bash
# Get cost summary
curl http://localhost:3000/api/cost

# Get cost by date range
curl "http://localhost:3000/api/cost?from=2026-04-01&to=2026-04-05"
```

## Cost Optimization Tips

1. **Use local models for worker agents** — Ollama costs $0. Reserve cloud models for lead agents.
2. **Set per-task budgets** — Prevent runaway costs on long-running workflows.
3. **Use smaller models for simple tasks** — Haiku or GPT-4.1-mini for classification, summarization.
4. **Monitor the By Model view** — Identify if expensive models are being used for cheap tasks.
5. **Enable fallback routing** — Set a cheaper model as fallback.

See [Cost Optimization Guide](../guides/cost-optimization.md) for a detailed strategy.

## Related

- [Cost Optimization Guide](../guides/cost-optimization.md) — Detailed cost reduction strategies
- [Provider Overview](../providers/overview.md) — Provider pricing context
- [Settings Tab](settings.md) — Configure budget limits via UI
