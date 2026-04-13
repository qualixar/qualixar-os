---
title: "Connectors Tab"
description: "Manage external service integrations -- MCP servers, APIs, and webhooks"
category: "dashboard"
tags: ["dashboard", "connectors", "mcp", "api", "webhook", "integrations"]
last_updated: "2026-04-13"
---

# Connectors Tab

The Connectors tab is where you manage all external service integrations that Qualixar OS communicates with. This includes MCP (Model Context Protocol) servers, REST APIs, and webhooks. Each connector exposes a set of tools that agents can use during task execution.

## What Is a Connector?

A connector is a registered external service that Qualixar OS can call. There are three types:

| Type | Description | Example |
|------|-------------|---------|
| **MCP** | A Model Context Protocol server that exposes tools via stdio or HTTP | GitHub MCP, Filesystem MCP, SQLite MCP |
| **API** | A REST API endpoint that agents can invoke | OpenAI API, custom internal services |
| **Webhook** | An outbound notification endpoint | Slack webhook, PagerDuty alert |

Each connector type is displayed with a color-coded badge (purple for MCP, blue for API, amber for webhook).

## Summary Cards

At the top of the tab, four stat cards provide an at-a-glance view:

- **Total Connectors** -- How many connectors are registered
- **Connected** -- How many are currently online
- **Disconnected** -- How many are offline
- **Total Tools** -- The combined tool count across all connectors

## Connector Registry

Below the stats, the registry table lists all connectors with these columns:

| Column | What It Shows |
|--------|---------------|
| **Name** | The connector's display name |
| **Type** | MCP, API, or Webhook (color-coded badge) |
| **Status** | Connected (green), Disconnected (gray), or Error (red) |
| **Tools** | Number of tools the connector exposes |
| **URL** | The connection endpoint (truncated for long URLs) |
| **Last Seen** | When the connector last communicated (relative time like "2m ago") |

Click any row to open the detail panel.

## Adding a Connector

The **Add Connector** form on the right side has three fields:

1. **Name** -- A descriptive label (required). Example: "GitHub MCP"
2. **Type** -- Select MCP Server, API, or Webhook from the dropdown
3. **URL** -- The connection endpoint. For MCP servers, use `stdio://server-name`. For APIs and webhooks, use the full `https://` URL.

Click **Add Connector** to register it. The connector list refreshes automatically.

## Inspecting a Connector

Click any connector row to open a detail modal. The modal shows:

- **ID** -- Unique identifier
- **Type** -- Connection type with color coding
- **Status** -- Current connection state with status badge
- **URL** -- Full endpoint (not truncated)
- **Tools** -- Total tool count
- **Last Seen** -- When the connector was last active
- **Available Tools** -- A scrollable list of every tool the connector exposes, displayed as monospace tags

## Testing a Connection

From the detail modal, click **Test Connection**. The system sends a test request to the connector's endpoint and reports either:

- **Connection successful** (green banner)
- **Connection failed** (red banner)

Use this after adding a new connector or when troubleshooting a disconnected one.

## Removing a Connector

From the detail modal, click **Remove**. You will see a confirmation prompt before the connector is deleted. This action cannot be undone.

## Demo Mode

When no real connectors are detected (no running Qualixar OS instance connected), the tab shows demo data with a yellow banner: "Showing demo data." This lets you explore the interface without a live backend. Demo connectors include GitHub MCP, Filesystem MCP, Slack Notifications, OpenAI Fallback, and SQLite MCP.

## Connector Status Guide

| Status | Meaning | What to Do |
|--------|---------|------------|
| **Connected** (green) | Connector is online and responding | No action needed |
| **Disconnected** (gray) | Connector is registered but not responding | Check that the server is running, then use Test Connection |
| **Error** (red) | Connector encountered a failure | Inspect the URL and server logs, then re-test |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close the detail modal |

## Related

- [Tools Tab](tools.md) -- Manage tools across all categories
- [Settings Tab](settings.md) -- System configuration
- [Overview](overview.md) -- Dashboard tab directory
