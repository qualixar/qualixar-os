---
title: "Logs Tab"
description: "Structured log viewer with filtering, search, and terminal-style streaming"
category: "dashboard"
tags: ["dashboard", "logs", "monitoring", "debugging", "filtering"]
last_updated: "2026-04-13"
---

# Logs Tab

The Logs tab is a structured log viewer that displays system activity in a terminal-style stream. You can filter by log level and source, search for specific messages, and click any entry to see its full detail.

## Layout

The tab is organized top to bottom:

1. **Stats row** -- Four summary cards
2. **Filter bar** -- Level toggles, source dropdown, search box
3. **Stream header** -- Entry count and auto-scroll toggle
4. **Log stream** -- The main scrollable log output
5. **Detail modal** -- Opens when you click a log entry

## Stats Cards

Four cards across the top summarize the current log state:

| Card | What It Shows |
|------|---------------|
| **Total Logs** | Total number of log entries loaded |
| **Errors** | Count of entries with `error` level |
| **Warnings** | Count of entries with `warn` level |
| **Sources** | Number of distinct log sources |

## Log Levels

Every log entry has one of four severity levels, each with a distinct color:

| Level | Color | When It Appears |
|-------|-------|-----------------|
| **DEBUG** | Gray | Verbose diagnostic output |
| **INFO** | Blue | Normal operational events |
| **WARN** | Amber | Potential issues that may need attention |
| **ERROR** | Red | Failures that require investigation |

## Filtering Logs

The filter bar provides three ways to narrow down what you see:

### Level Toggles

Four pill-shaped buttons -- one per log level. Click a level to toggle it on or off. Active levels are highlighted with their color; inactive levels are dimmed. All four levels are active by default.

### Source Dropdown

Select a specific source from the dropdown to show only logs from that component. Sources are auto-detected from the loaded log entries. Choose "All Sources" to remove the filter.

### Search Box

Type any text to filter logs by message content or source name. The search is case-insensitive and updates results as you type.

### Clear Filters

Click **Clear Filters** to reset all three filters back to their defaults (all levels on, all sources, empty search).

## The Log Stream

Logs display in a terminal-style monospace view, sorted newest-first. Each line shows four fields:

```
HH:MM:SS.mmm  LEVEL  [source]  message text
```

- **Timestamp** -- Time with millisecond precision
- **Level** -- Color-coded severity badge (left border also matches the level color)
- **Source** -- The component that generated the log (e.g., "orchestrator", "memory", "gateway")
- **Message** -- The log message text (truncated if it overflows)

Hover over any line to highlight it. Click a line to open the detail modal.

## Stream Header

Above the log stream, a summary line shows:

```
Showing 42 of 150 entries
```

This tells you how many entries match your current filters out of the total.

### Auto-Scroll

A checkbox labeled **Auto-scroll** controls whether the stream jumps to the newest entries when new logs arrive. Enabled by default. Disable it when you want to read through older logs without the view jumping.

## Log Detail Modal

Click any log entry to open a full-screen modal with complete information:

| Field | Description |
|-------|-------------|
| **ID** | Unique log entry identifier |
| **Timestamp** | Full ISO timestamp |
| **Level** | Severity badge |
| **Source** | Component name |
| **Message** | Full message text (not truncated) |
| **Task ID** | Associated task, if any (clickable) |
| **Agent ID** | Associated agent, if any (clickable) |
| **Metadata** | JSON block with any additional structured data |

Press `Escape` or click outside the modal to close it.

## Tips

- Use level filters to hide debug noise during normal monitoring. Enable debug only when diagnosing issues.
- Combine source filtering with search to quickly find specific events, such as searching "timeout" in the "gateway" source.
- The metadata section in the detail modal often contains structured data like error stacks, request IDs, and timing information.

## Related

- [Traces Tab](overview.md) -- Distributed tracing for multi-agent workflows
- [Events Tab](overview.md) -- Real-time event stream
- [Overview](overview.md) -- Dashboard tab directory
