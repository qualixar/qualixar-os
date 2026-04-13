---
title: "Flows Tab"
description: "Visual flow editor for designing and running multi-agent execution flows"
category: "dashboard"
tags: ["dashboard", "flows", "editor", "topology", "agents"]
last_updated: "2026-04-13"
---

# Flows Tab

The Flows tab is a visual editor for designing multi-agent execution flows. You define which agents participate, how they connect, and which topology governs their communication -- then run the entire flow from the dashboard.

## Layout

The tab has two main areas:

- **Saved Flows (left)** -- A table listing all previously saved flows. Click any row to load it into the editor.
- **Flow Editor (right)** -- The active workspace where you name, design, and run a flow.

## Creating a New Flow

1. Click **+ New Flow** in the toolbar. This generates a default 3-node sequential flow.
2. Enter a name in the text field at the top of the editor (replaces "Untitled Flow").
3. Choose a topology from the **Topology** dropdown (see below).
4. Add or remove nodes as needed.
5. Click **Save** to persist the flow.

## The Visual Canvas

The editor displays an interactive SVG canvas powered by a force-directed layout. Nodes (agents) appear as circles, and edges (connections) appear as directed arrows.

- **Click a node** to select it and open the Node Config panel.
- **Click empty canvas** to deselect.
- Nodes are color-coded by state:
  - Gray = idle
  - Green = running or completed
  - Red = error
- Running nodes pulse with an animation so you can spot active agents at a glance.
- The canvas is responsive -- it resizes to fill the available width.

## Configuring a Node

When you click a node, a config panel appears to the right of the canvas. Each node has three settings:

| Setting | What It Does |
|---------|-------------|
| **Role** | The agent's role label (e.g., "researcher", "reviewer", "summarizer") |
| **Model** | Which LLM the agent uses. Options include Claude Opus/Sonnet/Haiku, GPT-4o, GPT-4o-mini, Gemini 2.5 Pro/Flash |
| **System Prompt** | The instructions this agent receives |

Click **Save Config** to persist node changes. Click **Delete** to remove the node from the flow.

## Connecting Nodes

To manually draw an edge between two nodes:

1. Click the **Connect** button in the toolbar. It highlights to indicate connect mode is active.
2. Click the **source node** (the sender).
3. Click the **target node** (the receiver).
4. The edge is created. Connect mode deactivates automatically.

To cancel connect mode, click the same node twice or click **Connect** again.

Duplicate and self-referencing edges are automatically prevented.

## Topologies

The Topology dropdown auto-generates node arrangements and connections. Selecting a new topology regenerates the canvas layout. Available topologies:

| Topology | Pattern |
|----------|---------|
| **sequential** / **pipeline** | A -> B -> C (chain) |
| **parallel** / **star** / **broadcast** | Hub sends to all spokes |
| **hierarchical** / **tree** | Binary tree structure |
| **debate** | Two nodes argue; judges observe both |
| **circular** | Ring where each node passes to the next |
| **mesh** | Every node connects to every other node |
| **reduce** | All nodes feed into a single aggregator |
| **custom** | Empty canvas -- you draw all connections manually |

## Running a Flow

1. Save the flow first (the **Run** button is disabled for unsaved flows).
2. Click **Run**. A status banner appears showing the run state: "running", "submitted", or "error".
3. Run status clears automatically after a few seconds.

## Deleting a Flow

Click **Delete** in the toolbar to remove the currently loaded flow. This also removes it from the Saved Flows list.

## Stats Bar

Below the canvas, a summary line shows:
- Number of nodes
- Number of edges
- Current topology

## Toolbar Reference

| Button | Action |
|--------|--------|
| **+ New Flow** | Create a blank 3-node sequential flow |
| **Save** | Persist the current flow (disabled when no changes) |
| **Run** | Execute the saved flow |
| **Delete** | Remove the flow permanently |
| **Topology** dropdown | Switch the connection pattern |
| **+ Node** | Add a new agent node |
| **Connect** | Enter edge-drawing mode |

## Related

- [Builder Tab](builder.md) -- Workflow builder with topology visualization
- [Forge Tab](forge.md) -- Visual team designer for agent teams
- [Overview](overview.md) -- Dashboard tab directory
