---
title: "Gate Tab"
description: "Human review gate for approving, rejecting, or requesting revisions on agent outputs"
category: "dashboard"
tags: ["dashboard", "gate", "review", "approval", "human-in-the-loop"]
last_updated: "2026-04-13"
---

# Gate Tab

The Gate tab is a human-in-the-loop review system. When agents produce outputs that require human sign-off before execution, those outputs appear here as review items. You can approve, reject, or request revisions -- with optional feedback sent back to the agent.

## Why a Review Gate?

Not every agent output should execute automatically. Critical actions -- deployments, external communications, data modifications -- benefit from a human check. The Gate tab ensures these outputs are reviewed before proceeding.

## Layout

The tab is organized top to bottom:

1. **Header** -- Title and description
2. **Stats cards** -- Four summary metrics
3. **Review queue** -- Filterable, sortable table of review items
4. **Review detail modal** -- Opens when you select an item

## Stats Cards

Four cards summarize your review workload:

| Card | What It Shows |
|------|---------------|
| **Pending Reviews** | Items waiting for your decision |
| **Approved** | Items you have approved |
| **Rejected** | Items you have rejected |
| **Avg Review Time** | Average time between item creation and review, in hours |

## The Review Queue

The queue is a table showing all review items with these columns:

| Column | Description |
|--------|-------------|
| **Priority** | Critical (red), High (amber), Medium (yellow), or Low (gray) badge |
| **Task ID** | The task that generated this output |
| **Agent** | Which agent produced the output |
| **Status** | Pending, Approved, Rejected, or Revised badge |
| **Created** | Relative time since the item was created (e.g., "5m ago") |
| **Actions** | A "Review" button to open the detail modal |

### Filtering by Status

Five filter buttons sit above the queue: **All**, **Pending**, **Approved**, **Rejected**, **Revised**. Click one to show only items with that status. "All" is the default.

### Sorting

Click the **Priority** or **Created** column headers to sort. Click again to toggle between ascending and descending order. An arrow indicator shows the current sort direction.

By default, items are sorted by priority (critical first).

## Reviewing an Item

Click any row or the "Review" button to open the review detail modal.

### What You See

The modal displays:

- **Priority badge** and **status badge** at the top
- **Task ID** -- Which task generated this item
- **Agent** -- Which agent produced the output
- **Created** -- When the item was submitted for review
- **Reviewed** -- When it was last reviewed (if applicable)
- **Reviewer** -- Who reviewed it
- **Agent Output** -- The full content the agent produced, displayed in a scrollable panel

### Providing Feedback

A **Feedback** text area lets you write comments for the agent. This is optional but recommended, especially when rejecting or requesting revisions.

### Taking Action

Three action buttons appear at the bottom:

| Action | Color | What Happens |
|--------|-------|-------------|
| **Approve** | Green | Marks the item as approved; the agent can proceed |
| **Reject** | Red | Marks the item as rejected; the agent output is discarded |
| **Request Revision** | Amber | Sends the item back to the agent with your feedback |

Every action requires a confirmation step. After clicking an action button, a confirmation bar appears asking you to confirm or cancel. This prevents accidental approvals or rejections.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close the detail modal (or cancel a pending confirmation) |

## Workflow Example

A typical review workflow:

1. An agent completes a task and submits its output for review.
2. The item appears in the Gate tab with "pending" status.
3. You click the item to open the detail modal.
4. You read the agent's output.
5. You optionally type feedback.
6. You click **Approve**, **Reject**, or **Request Revision**.
7. You confirm the action.
8. The item's status updates immediately (optimistic update).

## Tips

- Sort by priority to address critical items first.
- Use the "Pending" filter during active review sessions to focus on what needs attention.
- Always provide feedback when rejecting or requesting revisions -- it helps agents produce better results on retry.
- The average review time metric helps you track how responsive your review process is.

## Related

- [Tasks Tab](overview.md) -- Create and monitor agent tasks
- [Agents Tab](overview.md) -- View and configure agents
- [Overview](overview.md) -- Dashboard tab directory
