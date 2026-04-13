---
title: "Forge Tab — Team Designer"
description: "Visual agent team designer for multi-agent workflows"
category: "dashboard"
tags: ["forge", "team", "designer", "multi-agent", "dashboard"]
last_updated: "2026-04-05"
---

# Forge Tab — Team Designer

The Forge tab is Qualixar OS's visual team designer. It lets you compose multi-agent teams by defining agent roles, selecting topologies, and configuring how agents communicate.

## What is Forge?

Forge takes a high-level task description and designs an agent team to execute it. You can:

- Describe a task in natural language
- Let Forge auto-design the team (roles, topology, tools)
- Manually adjust roles, models, and parameters
- Save team configurations as reusable blueprints

## Designing a Team

### Via Dashboard

1. Navigate to the **Forge** tab
2. Enter your task description (e.g., "Research and write a technical blog post about vector databases")
3. Click **Design Team**
4. Forge proposes: agent roles, topology, tools per agent, model assignments
5. Adjust as needed and click **Deploy**

### Via API

Forge designs are retrieved via the read-only API. Submit a task via `POST /api/tasks` with a topology, and Forge handles the team design internally.

```bash
# List all Forge designs
curl http://localhost:3000/api/forge/designs

# Get Forge recommendation for a specific task type
curl http://localhost:3000/api/forge/designs/research
```

## Team Composition

A Forge team consists of:

| Component | Description |
|-----------|-------------|
| **Lead Agent** | Coordinates the team, makes final decisions |
| **Worker Agents** | Execute specific subtasks |
| **Topology** | How agents communicate (pipeline, parallel, debate, etc.) |
| **Tools** | What each agent can use |
| **Budget** | Per-agent and total cost limits |

## Topology Selection

Forge recommends a topology based on the task type:

| Task Type | Recommended Topology |
|-----------|---------------------|
| Sequential processing | `sequential` |
| Independent subtasks | `parallel` |
| Creative/opinion tasks | `debate` or `mixture_of_agents` |
| Research tasks | `dag` |
| Complex workflows | `dag` or `hybrid` |
| Engineering workflows | `maker` |

See [Topologies Reference](../reference/topologies.md) for all 13 options.

## Saving Blueprints

After designing a team, click **Save as Blueprint** to reuse the configuration. Blueprints appear in the **Blueprints** tab and can be:
- Cloned and modified
- Shared via export/import
- Published to the marketplace

## Related

- [Builder Tab](builder.md) — Visual workflow builder
- [Agents Tab](agents.md) — Individual agent management
- [Topologies Reference](../reference/topologies.md) — All 13 topologies explained
