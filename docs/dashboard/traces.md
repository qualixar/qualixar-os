---
title: "Traces Tab"
description: "Distributed tracing with waterfall visualization, span details, and error tracking"
category: "dashboard"
tags: ["dashboard", "traces", "observability", "spans", "latency", "errors"]
last_updated: "2026-04-13"
---

# Traces Tab

The Traces tab is your observability window into what happens inside every request. It shows distributed traces --- end-to-end records of how a request flows through authentication, pipeline resolution, tool invocation, judging, and response serialization --- with precise timing for every step.

## Metric Cards

Four summary cards appear at the top and are always visible:

| Metric | Description |
|--------|-------------|
| **Total Traces** | Number of traces recorded across all time |
| **Avg Duration** | Mean latency across all traces |
| **p95 Latency** | 95th percentile latency --- the duration that 95% of traces complete within |
| **Error Rate** | Percentage of traces that ended with an error |

If the system has recorded traces, these metrics are calculated from real data. If the backend provides pre-computed metrics, those are used directly.

## Error Rate and Volume Chart

Below the metrics, a combined chart shows the last 24 hours of activity:

- **Gray bars** represent the number of requests per hour (left Y-axis)
- **Red line** tracks the error rate percentage per hour (right Y-axis)

This chart helps you correlate error spikes with traffic volume. A spike in errors during low traffic is more concerning than one during peak load.

## Trace List

The main table lists all recorded traces with these columns:

| Column | Description |
|--------|-------------|
| **Trace ID** | Unique identifier (monospaced, truncated to 16 characters) |
| **Operation** | The root operation name (e.g., `HTTP POST /api/execute`) |
| **Duration** | Total trace duration --- green for under 500ms, amber for over |
| **Spans** | Number of spans (individual operations) in the trace |
| **Status** | OK (green) or Error (red) |
| **Time** | When the trace started |

Click any row to drill into that trace's waterfall view.

## Trace Waterfall

When you select a trace, the view switches to a waterfall visualization showing every span in the trace. This is the most detailed view available.

### How to Read the Waterfall

The waterfall is an SVG diagram with two sections:

- **Left column** --- Operation names, indented by depth to show parent-child relationships
- **Right timeline** --- Horizontal bars showing when each span started and how long it lasted

Bars are colored by status:
- **Green** --- The span completed successfully
- **Red** --- The span encountered an error

Tick marks along the top show time intervals, making it easy to see which spans consumed the most time.

### Example Span Hierarchy

A typical trace for a task execution might look like:

```
HTTP POST /api/execute           [=====================================]  320ms
  auth.validateToken             [==]                                      18ms
  pipeline.resolve                  [========================]            140ms
    tool.invoke:web-search            [=================]                  95ms
    tool.invoke:summarize                                [====]            30ms
  judge.evaluate                                            [==========]  90ms
    llm.generate                                             [=========]  78ms
  response.serialize                                                  [===] 50ms
```

Indentation shows nesting. `pipeline.resolve` contains `tool.invoke:web-search` and `tool.invoke:summarize` as child spans.

### Navigating the Waterfall

- **Click a span** to open the span detail panel on the right
- **Click "Back to traces"** to return to the trace list
- The waterfall scrolls horizontally for wide traces and vertically for traces with many spans

## Span Detail Panel

When you click a span in the waterfall, a detail panel slides in from the right showing:

### Summary Fields

| Field | Description |
|-------|-------------|
| **Operation** | Full operation name |
| **Span ID** | Unique span identifier |
| **Duration** | How long the span took |
| **Status** | OK or Error badge |
| **Parent Span** | ID of the parent span (if any) |
| **Depth** | Nesting level in the span tree |
| **Start** | Millisecond offset from the trace start |

### Attributes Table

Every span carries key-value attributes that provide context. Examples:

| Key | Example Value | What It Tells You |
|-----|---------------|-------------------|
| `http.method` | POST | The HTTP method used |
| `http.status_code` | 200 | The response status |
| `tool.name` | web-search | Which tool was invoked |
| `llm.model` | sonnet-4 | Which LLM model ran |
| `llm.tokens` | 1240 | Token count for the LLM call |
| `judge.verdict` | pass | The judge's decision |

Click **Close** to dismiss the panel.

## Error Tracking

Traces with errors are flagged in the trace list with a red "error" badge. Inside the waterfall, the specific span that failed is shown with a red bar. Click that span to see its attributes, which often contain the error details.

To find error traces quickly, scan the Status column in the trace list for red badges.

## Tips

- **Start with the metrics cards** to understand overall system health before drilling in.
- **Use the error rate chart** to identify when problems started --- this narrows your investigation window.
- **Sort mentally by duration** in the trace list to find your slowest requests.
- **In the waterfall, look for the widest bars** --- those are your bottleneck spans.
- **Check span attributes** for `llm.tokens` and `llm.model` to correlate cost and latency with specific model calls.

## Related

- [Pipelines Tab](pipelines.md) --- High-level stage view of task progression
- [Judges Tab](judges.md) --- Judge evaluation details (visible as spans in traces)
- [Cost Tab](cost.md) --- Financial impact of the operations you see in traces
- [Overview](overview.md) --- System-wide health summary
