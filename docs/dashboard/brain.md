---
title: "Brain Tab"
description: "Prompt library with categories, versioning, and judge configuration"
category: "dashboard"
tags: ["dashboard", "brain", "prompts", "prompt-library", "judge", "few-shot"]
last_updated: "2026-04-13"
---

# Brain Tab

The Brain tab is your prompt library. It stores, organizes, and versions every prompt used across the system -- system prompts, task templates, few-shot examples, and judge prompts. It also includes a judge configuration panel for controlling how quality evaluators behave.

## Getting There

Open the dashboard and click **Brain** (listed as "Prompts" in some views) in the sidebar under **Agent Design**.

## Prompt Categories

Every prompt belongs to one of four categories:

| Category | Purpose | Example |
|----------|---------|---------|
| **System** | Agent persona definitions and system-level instructions | "You are a code review agent..." |
| **Task** | Reusable task templates with placeholders | "Summarize the following document..." |
| **Few-Shot** | In-context learning examples for guiding model output | Input/output pairs for classification |
| **Judge** | Prompts used by quality evaluation judges | "Evaluate the output on correctness, safety, relevance..." |

## Statistics

Four stat cards at the top show:

- **Total Prompts** -- Library size
- **System Prompts** -- Number of agent persona prompts
- **Task Templates** -- Number of reusable task prompts
- **Few-Shot Examples** -- Number of in-context learning prompts

## Browsing Prompts

Prompts are displayed in a data table with the following columns:

| Column | Content |
|--------|---------|
| **Name** | Prompt identifier (monospace) |
| **Category** | Color-coded category badge |
| **Version** | Current version number (e.g., v3) |
| **Usage** | How many times this prompt has been used |
| **Tags** | Up to 3 tag chips, with a "+N" indicator if more exist |
| **Updated** | Last modification date |

### Filtering and Sorting

The filter bar provides:

1. **Category chips** -- Click a category (System, Task, Few-Shot, Judge) to filter. Click "All" to show everything. Clicking an active chip deselects it.
2. **Search** -- Free-text search across name, tags, and content.
3. **Sort dropdown** -- Sort by Name (alphabetical), Usage (most used first), or Recent (most recently updated first).

## Creating a Prompt

1. Click **+ New Prompt** in the filter bar (or the button shown in the empty state if no prompts exist yet).
2. A slide-in editor panel opens on the right side of the screen.
3. Fill in:
   - **Name** -- A short identifier for the prompt.
   - **Category** -- Select System, Task, Few-Shot, or Judge.
   - **Content** -- The prompt text. The editor has line numbers and uses a monospace font for readability.
   - **Tags** -- Comma-separated keywords.
4. Click **Create Prompt**.

The prompt is saved via `POST /api/prompts` and the library refreshes.

## Editing a Prompt

1. Click any row in the prompt table.
2. The editor panel opens pre-filled with the prompt's current values.
3. Make your changes and click **Save Changes**.

The update is sent via `PUT /api/prompts/:id`. The version number auto-increments on each save, giving you a built-in version history indicator.

## Copying Prompt Content

In the editor panel, click the **Copy** button in the footer to copy the prompt content to your clipboard. A brief "Copied!" confirmation appears. This is useful for pasting prompts into other tools or sharing them outside the dashboard.

## Judge Configuration

Below the prompt table is the **Judge Configuration** card. This controls how the built-in quality judges evaluate agent outputs.

### Strictness Level

Choose from three levels:

| Level | Behavior |
|-------|----------|
| **Strict** | Zero tolerance -- rejects output on any concern |
| **Balanced** | Flags issues but allows minor deviations |
| **Lenient** | Permissive -- only rejects critical failures |

### Custom Judge Prompt

Optionally override the default judge system prompt with your own text. Leave blank to use the built-in prompt for each judge type. A character counter shows the prompt length.

Click **Save Judge Config** to persist your settings. The configuration is stored in the system config under the `quality` namespace.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close the editor panel |

## Tips

- **Version tracking** is automatic -- every save increments the version number, so you always know which iteration you are on.
- **Use categories** to keep your library organized. System prompts define who the agent is; task templates define what it does; few-shot examples show it how.
- **Tag consistently** -- search covers tags, so good tagging makes prompts easy to find.
- **Judge strictness** matters for production: start with Balanced, tighten to Strict as your agents mature.
- **Empty state** -- If no prompts exist yet, the tab shows a clear call-to-action to create your first prompt.

## Related

- [Forge Tab](forge.md) -- Visual team designer (uses system prompts)
- [Builder Tab](builder.md) -- Workflow builder (uses task templates)
- [Dashboard Overview](overview.md) -- All 24 tabs at a glance
