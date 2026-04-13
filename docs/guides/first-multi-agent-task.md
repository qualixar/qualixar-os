---
title: "Your First Multi-Agent Task"
description: "Step-by-step guide to running a multi-agent task with different topologies"
category: "guides"
tags: ["multi-agent", "tutorial", "topology", "pipeline", "parallel"]
last_updated: "2026-04-13"
---

# Your First Multi-Agent Task

This guide walks you through creating and running a multi-agent task. The orchestrator runs a 12-step pipeline: init, memory recall, Forge team design, simulation (optional), security validation, swarm execution, judge assessment, redesign loop, RL learning, behavior capture, output formatting, and finalize.

## Prerequisites

- Qualixar OS installed and running (`qos serve --port 3000 --dashboard`)
- At least one provider configured (Ollama recommended for local-first, or OpenRouter for cloud)

## Step 1: Configure a Provider

Open the **Settings** tab in the dashboard and add a provider. For Ollama (free, local):

```yaml
# ~/.qualixar-os/config.yaml
providers:
  local:
    type: ollama
    endpoint: http://localhost:11434

models:
  primary: ollama/llama3
  fallback: ollama/llama3
```

Or use OpenRouter for cloud models:

```yaml
providers:
  openrouter:
    type: openrouter
    api_key_env: OPENROUTER_API_KEY
```

## Step 2: Create the Task

Submit a task via the API. Forge auto-designs the agent team, selects a topology, and runs the full pipeline:

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Research the latest AI agent framework trends, write a 500-word summary, and review for accuracy",
    "type": "research",
    "topology": "sequential",
    "budget_usd": 1.0
  }'
```

The server returns `202 Accepted` with a `taskId` immediately. The orchestrator runs asynchronously.

## Step 3: Monitor Execution

Watch the task in the dashboard **Tasks** tab, or subscribe to Server-Sent Events:

```bash
curl -N http://localhost:3000/api/sse
```

Events stream in real-time as each pipeline step completes. Key events to watch: `task:created`, `forge:designed`, `swarm:started`, `judge:verdict`, `task:completed`.

## Step 4: Get Results

```bash
curl http://localhost:3000/api/tasks/<task-id>
```

For full detail including judge verdicts, agent outputs, and cost breakdown:

```bash
curl http://localhost:3000/api/tasks/<task-id>/detail
```

## Pipeline Stages

Each task passes through these stages (visible via events):

| Step | Stage | What Happens |
|------|-------|-------------|
| 1 | Init | Budget check, task record creation |
| 2 | Memory | SLM-Lite auto-invokes to recall relevant context |
| 3 | Forge | AI designs the agent team and picks a topology |
| 4 | Simulate | (Optional) Dry-run the team design |
| 5 | Security | Filesystem sandbox + command validation |
| 6 | Run | Swarm engine executes the topology |
| 7 | Judge | Quality assessment with configurable profiles |
| 8 | Redesign | If rejected, Forge redesigns (up to 5 times) |
| 9 | RL | Reinforcement learning records the outcome |
| 10 | Behavior | Agent behavior captured for future learning |
| 11 | Output | Result formatted and written to workspace |
| 12 | Finalize | DB updated, checkpoints cleared, cleanup |

## Try Different Topologies

Qualixar OS supports 13 topologies. Here are common choices:

### Parallel -- Agents work simultaneously

```json
{ "prompt": "Compare React vs Vue vs Svelte", "topology": "parallel" }
```

### Debate -- Two agents argue, a judge decides

```json
{ "prompt": "Should we use microservices or monolith?", "topology": "debate" }
```

### Hierarchical -- Manager delegates to workers

```json
{ "prompt": "Build a full REST API with tests", "topology": "hierarchical" }
```

### Hybrid -- Mixed local and cloud execution

```json
{ "prompt": "Analyze this dataset", "topology": "hybrid" }
```

See [Topologies Reference](../reference/topologies.md) for all 13 options.

## Workspace Output

Each task gets a workspace directory at `~/.qualixar-os/workspaces/<task-id>/` with subdirectories: `src/`, `docs/`, `artifacts/`, and `.qos-log/`. Browse files via the API:

```bash
curl http://localhost:3000/api/tasks/<task-id>/workspace
```

## Related

- [Topologies Reference](../reference/topologies.md) -- All 13 topology details
- [Cost Optimization](cost-optimization.md) -- Control spending
- [Forge Tab](../dashboard/forge.md) -- Visual team designer
