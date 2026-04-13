---
title: "Builder Tab — Workflow Builder"
description: "Visual drag-and-drop workflow builder for agent pipelines"
category: "dashboard"
tags: ["builder", "workflow", "visual", "dag", "dashboard"]
last_updated: "2026-04-05"
---

# Builder Tab — Workflow Builder

The Builder tab provides a visual drag-and-drop interface for constructing agent workflows. Unlike Forge (which auto-designs teams), Builder gives you full manual control over every node and connection.

## Interface

The Builder canvas shows:
- **Nodes** — each representing an agent, tool, or decision point
- **Edges** — connections showing data flow between nodes
- **Properties panel** — configure the selected node
- **Topology selector** — apply a preset layout

## Creating a Workflow

### Step 1: Add Nodes

Drag nodes from the sidebar onto the canvas:

| Node Type | Description |
|-----------|-------------|
| **Agent** | An LLM agent with a role and model |
| **Tool** | A tool invocation (web search, code execution, etc.) |
| **Router** | Conditional branching based on output |
| **Aggregator** | Combines outputs from parallel branches |
| **Input** | Workflow entry point |
| **Output** | Workflow result |

### Step 2: Connect Nodes

Click and drag from one node's output port to another's input port. Each connection defines data flow.

### Step 3: Configure Nodes

Click a node to open the properties panel:
- **Agent nodes**: Set role, model, system prompt, temperature, tools
- **Router nodes**: Define conditions (if/else, regex, score threshold)
- **Aggregator nodes**: Choose merge strategy (concat, vote, best-of)

### Step 4: Save and Run

Click **Save Workflow** to persist, then **Run** to execute.

## API Access

```bash
# List workflows
curl http://localhost:3000/api/workflows

# Create a workflow
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "Research Pipeline", "nodes": [...], "edges": [...]}'
```

## Preset Topologies

The topology selector applies pre-built layouts:

- **Pipeline** — linear chain of agents
- **Fan-out/Fan-in** — parallel execution with aggregation
- **Debate** — two agents argue, judge decides
- **Tournament** — bracket-style elimination

See [Topologies Reference](../reference/topologies.md) for all 12 options.

## Exporting Workflows

Workflows can be exported as JSON for version control or sharing:

```bash
curl http://localhost:3000/api/workflows/<id>/export
```

## Related

- [Forge Tab](forge.md) — Auto-design teams from task descriptions
- [Topologies Reference](../reference/topologies.md) — Topology details
- [First Multi-Agent Task](../guides/first-multi-agent-task.md) — Step-by-step guide
