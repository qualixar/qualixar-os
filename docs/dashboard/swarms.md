---
title: "Swarms Tab"
description: "Visualize multi-agent topologies and monitor swarm execution"
category: "dashboard"
tags: ["dashboard", "swarms", "topology", "multi-agent", "visualization"]
last_updated: "2026-04-13"
---

# Swarms Tab

The Swarms tab provides a live visualization of how your agents are organized and communicating during multi-agent tasks. It shows the active topology, which agents are running, and a log of all swarm events.

## What Are Swarms

A swarm is a group of agents working together on a task using a specific topology --- the pattern that determines how agents connect and pass messages. When you submit a multi-agent task, Qualixar OS selects a topology and coordinates the agents within it.

## Topology Visualization

The main feature of this tab is an interactive force-directed graph that shows the current swarm layout. The graph renders in real time using physics-based positioning:

- **Hub node** (large, indigo) --- The central coordinator, labeled with the topology name in uppercase
- **Agent nodes** (smaller circles) --- Each agent in the swarm, labeled with its role name
- **Directed arrows** --- Show message flow between nodes

**Active agents pulse green** with an animation. When a task is running, agents that have started but not yet completed glow to indicate they are currently processing. When no task is running, all nodes appear in their idle state.

The graph updates automatically. It polls task status every 5 seconds while the tab is visible, so you see transitions from idle to active and back without refreshing.

## Topology Types

The Available Topologies card lists all topologies the system supports. The graph builds its layout based on the topology type:

| Topology | Pattern |
|----------|---------|
| **Sequential** | Agents execute one after another in a chain |
| **Parallel / Star** | All agents connect to the central hub and run simultaneously |
| **Hierarchical** | A lead agent delegates to subordinate agents |
| **Debate** | Two agents argue opposing sides, a third judges |
| **Circular** | Agents pass work around a ring, each building on the previous |
| **Mesh** | Every agent connects to every other agent plus the hub |

Any topology not in the above list defaults to the star pattern in the visualization.

## Swarm Stats

The stats card shows four key numbers:

- **Status** --- LIVE (green) when tasks are running or pending, IDLE (gray) otherwise
- **Total Events** --- Count of all swarm events recorded
- **Completed** --- Swarms that finished successfully
- **Failed** --- Swarms that encountered errors

## Swarm Activity Log

The activity log table records every swarm event with these columns:

| Column | Description |
|--------|-------------|
| **Event** | The event type (e.g., `swarm:started`, `swarm:completed`, `swarm:failed`) |
| **Topology** | Which topology was used |
| **Agents** | Number of agents in the swarm |
| **Status** | Running, completed, or failed (color-coded badge) |
| **Task** | First 12 characters of the associated task ID |
| **Time** | When the event occurred |

If no swarm activity has occurred yet, the table shows an empty state prompting you to submit a multi-agent task.

## How the Graph Builds

The graph is constructed from swarm events in the event stream. When a `swarm:started` event fires, the tab reads the topology type and agent count. It then looks for `agent:spawned` events to get real agent names and roles. If no spawn events are available, it generates placeholder agent labels.

Up to 8 agents are displayed in the graph. For larger swarms, the visualization shows the first 8 agents.

## Monitoring a Running Swarm

1. Submit a multi-agent task from the Tasks or Chat tab
2. Open the Swarms tab
3. The status flips to **LIVE** and agent nodes begin pulsing green
4. Watch the topology graph to see which agents are active
5. When the task completes, nodes return to idle and the activity log updates

## Tips

- **Use this tab during development** to verify your chosen topology matches your intent. If you configured a debate topology but see a star pattern, check your task configuration.
- **Check the activity log** to quickly find failed swarms and their associated task IDs for debugging.
- **The LIVE/IDLE indicator** is based on real task polling, not just events, so it accurately reflects system state even if events are delayed.

## Related

- [Pipelines Tab](pipelines.md) --- See tasks flowing through pipeline stages
- [Traces Tab](traces.md) --- Detailed timing for individual agent spans
- [Forge Tab](forge.md) --- Visually design agent teams and topologies
