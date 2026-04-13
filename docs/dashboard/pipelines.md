---
title: "Pipelines Tab"
description: "Track tasks as they flow through the seven-stage execution pipeline"
category: "dashboard"
tags: ["dashboard", "pipelines", "stages", "task-flow", "monitoring"]
last_updated: "2026-04-13"
---

# Pipelines Tab

The Pipelines tab gives you a visual overview of where every task sits in the execution pipeline. Each task progresses through seven stages from submission to final output, and this tab shows that progression at a glance.

## The Seven Pipeline Stages

Every task flows through these stages in order:

| Stage | Color | What Happens |
|-------|-------|--------------|
| **Init** | Gray | Task is received, validated, and queued for processing |
| **Memory** | Purple | Relevant context is retrieved from the memory store |
| **Forge** | Amber | The agent team is assembled based on task requirements |
| **Simulate** | Cyan | A dry-run simulation checks feasibility before execution |
| **Run** | Green | Agents execute the task using the selected topology |
| **Judge** | Indigo | Judge models evaluate the output for quality |
| **Output** | Pink | Results are finalized and returned |

## Pipeline Stage Distribution

The distribution chart at the top shows how many tasks are currently at each stage. A horizontal bar per stage indicates volume --- longer bars mean more tasks at that stage. This helps you spot bottlenecks. For example, if many tasks are stuck at the Run stage, your agents may be overloaded.

## Active Task Pipelines

The main section shows each task as a pipeline row. Every row displays:

- **Task ID** --- First 12 characters of the task identifier
- **Status badge** --- Running (blue), completed (green), or failed (red)
- **Progress percentage** --- How far through the pipeline the task has progressed
- **Heartbeat indicator** --- A small colored dot showing task health

### Stage Indicators

Each row shows all seven stages as labeled boxes connected by lines:

- **Active stage** --- Filled with the stage color and white text. This is where the task is right now.
- **Completed stages** --- Shown in a lighter tint of the stage color. The task has already passed through these.
- **Future stages** --- Grayed out. The task has not reached these yet.
- **Connectors** --- Lines between stages are colored for completed transitions and gray for upcoming ones.

### Heartbeat

The heartbeat dot next to the progress percentage indicates real-time task health:

| Color | Meaning |
|-------|---------|
| Green (pulsing) | Healthy --- task is actively processing |
| Yellow | Warning --- task may be slow or stalling |
| Red | Stale --- no heartbeat received recently |
| Gray | Unknown --- no heartbeat data available |

Hover over the dot to see the heartbeat status and how many seconds since the last heartbeat was received.

## Reading the Pipeline View

Here is what a typical pipeline row looks like for a task in the Run stage:

```
[task-abc123]  [Running]  50%  [*]

 Init -> Memory -> Forge -> Simulate -> [Run] -> Judge -> Output
  (done)  (done)   (done)   (done)     (active)  (next)  (next)
```

Completed tasks show all seven stages lit up with 100% progress. Failed tasks stop at the stage where the failure occurred with 0% progress.

## Monitoring Workflow

1. Submit one or more tasks from the Tasks or Chat tab
2. Open the Pipelines tab to see each task appear
3. Watch tasks move through stages in real time
4. Use the distribution chart to identify bottlenecks
5. Check heartbeat dots for any stalled tasks

## Tips

- **The distribution chart is your early warning system.** If tasks pile up at one stage, investigate that component.
- **Heartbeat colors are your first signal** that something is wrong --- a red dot means the task process may have died.
- **Completed tasks stay visible** so you can verify they passed through all stages successfully.
- **Failed tasks stop at the failure point**, making it easy to see which stage caused the problem.

## Related

- [Judges Tab](judges.md) --- Detailed view of what happens at the Judge stage
- [Swarms Tab](swarms.md) --- See agent topology during the Run stage
- [Traces Tab](traces.md) --- Drill into timing for each pipeline stage
- [Overview](overview.md) --- System-wide status and quick stats
