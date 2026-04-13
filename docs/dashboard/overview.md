---
title: "Dashboard Overview"
description: "Overview of the Qualixar OS dashboard and its 24 tabs"
category: "dashboard"
tags: ["dashboard", "ui", "overview", "tabs"]
last_updated: "2026-04-05"
---

# Dashboard Overview

The Qualixar OS dashboard is a browser-based control center at `http://localhost:3000`. It provides 24 tabs that cover every aspect of agent orchestration, from task management to cost tracking.

## Starting the Dashboard

```bash
qos serve --port 3000 --dashboard
```

The dashboard opens automatically. If not, navigate to [http://localhost:3000](http://localhost:3000).

## Tab Directory

### Core Operations

| Tab | Purpose |
|-----|---------|
| **Overview** | System status, active tasks, provider health, quick stats |
| **Tasks** | Create, monitor, and manage agent tasks |
| **Agents** | View and configure individual agents |
| **Chat** | Interactive conversation interface with streaming |
| **Models** | Available models across all providers |
| **Settings** | System configuration and preferences |

### Agent Design

| Tab | Purpose |
|-----|---------|
| **[Forge](forge.md)** | Visual team designer — drag-and-drop agent teams |
| **[Builder](builder.md)** | Workflow builder with topology visualization |
| **Blueprints** | Reusable agent configurations and templates |
| **Prompts** | Prompt library and template management |
| **Topology** | Visualize and select from 13 execution topologies |

### Data & Memory

| Tab | Purpose |
|-----|---------|
| **[Memory](memory.md)** | RAG memory — store, search, and manage knowledge |
| **Vectors** | Vector store management and embedding inspection |
| **Datasets** | Training and evaluation datasets |

### Monitoring

| Tab | Purpose |
|-----|---------|
| **[Cost](cost.md)** | Spending breakdown by provider, model, and task |
| **Events** | Real-time event stream (SSE) with 203 event types |
| **Logs** | Structured log viewer with filtering |
| **[Traces](traces.md)** | Distributed tracing for multi-agent workflows |
| **Flows** | Execution flow visualization |
| **[Lab](lab.md)** | A/B testing and experiment tracking |
| **[Judges](judges.md)** | Quality verdicts, scoring, and judge feedback |
| **[Swarms](swarms.md)** | Multi-agent topology visualization and monitoring |
| **[Pipelines](pipelines.md)** | Seven-stage task pipeline tracking |
| **Reviews** | Task output review and quality assessment |

### Ecosystem

| Tab | Purpose |
|-----|---------|
| **[Marketplace](marketplace.md)** | Browse and install plugins and skills |
| **[Tools](tools.md)** | Manage tools across 6 categories |
| **Connectors** | External service integrations (MCP, APIs) |

## Navigation

The sidebar provides tab navigation. Each tab has:
- **Search/filter** bar at the top
- **Action buttons** for creating or managing items
- **Detail panels** that slide in when you click an item
- **Real-time updates** via Server-Sent Events (SSE)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Global search |
| `Ctrl+N` | New task |
| `Ctrl+Shift+F` | Toggle full screen |
| `Escape` | Close detail panel |

## Related

- [Chat Tab](chat.md) — Interactive conversation interface
- [Forge Tab](forge.md) — Visual team designer
- [Builder Tab](builder.md) — Workflow builder
- [Judges Tab](judges.md) — Quality verdicts and judge feedback
- [Swarms Tab](swarms.md) — Multi-agent topology visualization
- [Pipelines Tab](pipelines.md) — Seven-stage task pipeline
- [Lab Tab](lab.md) — A/B experiment comparison
- [Traces Tab](traces.md) — Distributed tracing and span analysis
- [Settings Tab](settings.md) — Configuration UI
