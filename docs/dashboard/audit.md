---
title: "Audit Tab"
description: "Security audit log viewer with filtering, export, and purge"
category: "dashboard"
tags: ["dashboard", "audit", "security", "enterprise", "compliance", "logging"]
last_updated: "2026-04-13"
---

# Audit Tab

The Audit tab is an enterprise-grade audit log viewer. It records every security-relevant action in the system -- logins, data changes, permission modifications, exports, and more. Use it to investigate incidents, satisfy compliance requirements, or simply understand who did what and when.

## Getting There

Open the dashboard and click **Audit** in the sidebar. This tab is part of the enterprise feature set.

## What Gets Logged

The audit system tracks these event types:

| Event Type | What It Records |
|------------|----------------|
| **login** | User authentication events |
| **logout** | Session termination |
| **create** | New resource creation (tasks, agents, prompts, etc.) |
| **update** | Modifications to existing resources |
| **delete** | Resource deletion |
| **export** | Data export actions |
| **purge** | Bulk data deletion |
| **rotate** | Secret or key rotation events |
| **permission** | Access control changes |

## Viewing the Log

The main area displays audit entries using the built-in log viewer component. Each entry shows the event type, the user who performed the action, the affected resource, and a timestamp. A total entry count is displayed in the page header.

## Filtering

The **Filters** card lets you narrow down the log:

| Filter | What It Does |
|--------|-------------|
| **Event type** | Dropdown to select a specific event type (login, create, delete, etc.) or "All events" |
| **User ID** | Text field to filter by a specific user |
| **Resource** | Text field to filter by resource name or identifier |
| **Date from** | Start date for the time range |
| **Date to** | End date for the time range |
| **Page size** | Number of entries per page (25, 50, or 100) |

After setting your filters, click **Apply Filters** to reload the log. Click **Clear** to reset all filters and show everything.

## Pagination

When the log contains more entries than the page size, pagination controls appear at the bottom:

- **Entry range** -- Shows which entries are currently visible (e.g., "Showing 1-25 of 1,247").
- **Prev / Next buttons** -- Navigate between pages.
- **Page indicator** -- Shows current page and total pages (e.g., "Page 1 / 50").

## Exporting

Two export buttons are available in the header:

- **Export CSV** -- Downloads the filtered audit log as a CSV file.
- **Export JSON** -- Downloads the filtered audit log as a JSON file.

Exports respect your current filters, so you can narrow down to a specific time range or event type before exporting. The export opens in a new browser tab via the `/api/enterprise/audit/export` endpoint.

## Purging Logs

The **Purge Logs** button is only visible to users with admin-level permissions (enforced by a permission gate). Clicking it opens a confirmation dialog:

1. The dialog warns that purging permanently deletes ALL audit log entries.
2. Click **Yes, Purge All** to proceed, or **Cancel** to abort.
3. If the purge fails, an error message appears in the dialog.

Purging is irreversible. It calls `DELETE /api/enterprise/audit` on the backend.

## Error Handling

If the audit log fails to load (network issue, backend down), a red error banner appears above the log viewer with the specific error message. The tab will retry when you click Apply Filters or navigate pages.

## Access Control

The Audit tab uses role-based permission gates:

- **All users** can view audit entries, apply filters, and export data.
- **Admin users only** can see and use the Purge Logs button.

The `currentUserRole` prop controls which actions are available. Non-admin users simply do not see the purge button.

## Tips

- **Date range filtering** is the fastest way to investigate a specific incident -- set the from/to dates around the event in question.
- **Combine filters** for precision -- for example, set event type to "delete" and user ID to a specific account to see everything that user deleted.
- **Export before purge** -- Always export your logs before purging. There is no undo.
- **Page size** -- Use 100/page for faster scanning of large logs, 25/page for careful review.
- **Regular exports** -- For compliance, export logs on a regular schedule (weekly or monthly) and archive them externally.

## Related

- [Settings Tab](settings.md) -- System configuration
- [Dashboard Overview](overview.md) -- All 24 tabs at a glance
