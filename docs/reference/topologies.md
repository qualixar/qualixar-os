---
title: "Execution Topologies"
description: "All 13 execution topologies for multi-agent workflows"
category: "reference"
tags: ["topologies", "execution", "multi-agent", "workflow", "reference"]
last_updated: "2026-04-13"
---

# Execution Topologies

Qualixar OS supports 13 execution topologies that define how agents communicate and process work. These are registered in the swarm engine from four topology modules: basic (4), advanced (4), experimental (4), and hybrid (1).

## Topology Quick Reference

| # | Topology | Module | Agents | Pattern | Best For |
|---|----------|--------|--------|---------|----------|
| 1 | `sequential` | basic | 2+ | Chain | Multi-step processing |
| 2 | `parallel` | basic | 2+ | Concurrent | Independent subtasks |
| 3 | `hierarchical` | basic | 3+ | Manager + workers | Complex projects |
| 4 | `dag` | basic | 2+ | Directed acyclic graph | Custom dependencies |
| 5 | `mixture_of_agents` | advanced | 3+ | Ensemble + synthesizer | Best-of-N synthesis |
| 6 | `debate` | advanced | 3 | Argue + judge | Creative decisions |
| 7 | `mesh` | advanced | 3+ | All-to-all | Collaborative reasoning |
| 8 | `star` | advanced | 3+ | Hub-and-spoke | Centralized coordination |
| 9 | `circular` | experimental | 3+ | Ring passing | Iterative refinement |
| 10 | `grid` | experimental | 4+ | 2D grid neighbors | Spatial/parallel reasoning |
| 11 | `forest` | experimental | 4+ | Multiple tree roots | Parallel hierarchies |
| 12 | `maker` | experimental | 2+ | Build-test cycle | Code generation |
| 13 | `hybrid` | hybrid | 3+ | Local + cloud routing | Cost-optimized execution |

## Detailed Descriptions

### Sequential (basic)
Agents execute in order. Each agent's output becomes the next agent's input.

```
Agent A --> Agent B --> Agent C --> Result
```

Use when tasks have clear sequential stages (research, write, review).

### Parallel (basic)
All agents execute simultaneously on the same prompt. Results are collected independently.

Use for independent subtasks or getting multiple perspectives.

### Hierarchical (basic)
A manager agent decomposes the task and assigns subtasks to worker agents. Workers report back to the manager, who assembles the final result.

### DAG (basic)
Define a custom directed acyclic graph of agent dependencies. Each node executes when all its dependencies complete.

```json
{ "topology": "dag", "topologyConfig": { "edges": [["research", "write"], ["research", "diagram"]] } }
```

### Mixture of Agents (advanced)
Multiple agents independently produce outputs. A synthesizer agent merges the best elements into a final result. Similar to voting but with intelligent synthesis rather than simple majority.

### Debate (advanced)
Two agents argue opposing positions across multiple rounds. A third agent (judge) evaluates and decides.

### Mesh (advanced)
Every agent can communicate with every other agent. Messages pass around until the group converges on a result. Use for collaborative reasoning.

### Star (advanced)
A central hub agent communicates with all spoke agents. Spokes do not communicate with each other. The hub coordinates and aggregates results.

### Circular (experimental)
Agents are arranged in a ring. Each agent processes and passes output to the next in the circle. Multiple rounds refine the result iteratively.

### Grid (experimental)
Agents are arranged in a 2D grid. Each agent communicates with its neighbors (up, down, left, right). Use for spatial reasoning or parallel processing patterns.

### Forest (experimental)
Multiple independent tree hierarchies execute in parallel. Each tree has its own root and workers. Results from all trees are merged.

### Maker (experimental)
A builder agent generates output (typically code), then a tester agent validates it. Failed tests trigger another build-test cycle. Use for code generation with automated verification.

### Hybrid (hybrid)
Routes agents between local and cloud execution based on cost, latency, and capability requirements. The 13th topology, designed for cost-optimized mixed-provider workflows.

Emits `hybrid:route_assigned`, `hybrid:cloud_fallback`, and `hybrid:cost_reconciled` events.

## Mode Gating

Not all topologies are available in all modes. The `ModeEngine` enforces topology access:
- **Companion mode**: Simpler topologies allowed
- **Power mode**: All 13 topologies available

Check available topologies via: `GET /api/swarm/topologies`

## Choosing a Topology

| Question | Recommended |
|----------|-------------|
| Simple, one-step task? | `sequential` (1 agent) |
| Clear sequential stages? | `sequential` |
| Independent subtasks? | `parallel` |
| Need best-of-N? | `mixture_of_agents` |
| Complex dependencies? | `dag` |
| Exploring trade-offs? | `debate` |
| Code generation? | `maker` |
| Cost-sensitive multi-provider? | `hybrid` |

## Related

- [Builder Tab](../dashboard/builder.md) -- Visual workflow builder
- [Forge Tab](../dashboard/forge.md) -- Auto-design teams with topology selection
- [First Multi-Agent Task](../guides/first-multi-agent-task.md) -- Hands-on guide
