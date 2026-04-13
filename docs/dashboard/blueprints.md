---
title: "Blueprints Tab"
description: "Create, browse, and deploy reusable agent templates"
category: "dashboard"
tags: ["dashboard", "blueprints", "templates", "agents", "topologies", "workflows", "pipelines"]
last_updated: "2026-04-13"
---

# Blueprints Tab

The Blueprints tab is a gallery of reusable templates. Instead of configuring agents, topologies, workflows, or pipelines from scratch every time, you save them as blueprints and deploy them with one click.

## Getting There

Open the dashboard and click **Blueprints** in the sidebar under **Agent Design**.

## Blueprint Types

Every blueprint belongs to one of four types, each color-coded throughout the UI:

| Type | What It Represents | Example |
|------|--------------------|---------|
| **Agent** | A single agent or multi-agent team configuration | Code Review Team (3 agents) |
| **Topology** | An execution topology defining how agents collaborate | Debate Ring, Fan-Out |
| **Workflow** | A multi-step process with defined stages | CI/CD: lint, test, build, deploy |
| **Pipeline** | An end-to-end data processing chain | Research: search, extract, summarize |

Type summary badges at the top of the page show how many blueprints exist for each type.

## Browsing Blueprints

Blueprints are displayed in a responsive card grid. Each card shows:

- **Type badge** -- Color-coded chip indicating agent, topology, workflow, or pipeline.
- **Name** -- The blueprint title.
- **Description** -- A two-line summary of what it does.
- **Tags** -- Keyword labels for quick identification.
- **Usage count** -- How many times this blueprint has been deployed.
- **Agent count** -- Number of agents (for agent and topology types).
- **Deploy button** -- Instantly deploy this blueprint.

### Filtering and Sorting

The filter bar above the gallery provides three controls:

1. **Search** -- Type in the text field to filter by name, description, or tags.
2. **Type chips** -- Click a type chip (Agent, Topology, Workflow, Pipeline) to show only that type. Click "All" to reset. Clicking an active chip deselects it.
3. **Sort dropdown** -- Sort by Name (alphabetical), Most Used (highest deployment count first), or Recently Updated (newest changes first).

## Creating a Blueprint

1. Click **+ New Blueprint** in the filter bar.
2. Fill in the form that appears above the gallery:
   - **Name** -- A short, descriptive name (e.g., "Data Cleaning Agent").
   - **Type** -- Select from agent, topology, workflow, or pipeline.
   - **Description** -- Explain what this blueprint does.
   - **Tags** -- Comma-separated keywords (e.g., "data, cleaning, etl").
3. Click **Save Blueprint**.

The blueprint is saved via `POST /api/blueprints` and the gallery refreshes automatically.

## Viewing Blueprint Details

Click any blueprint card to open the detail modal. The modal shows:

| Section | Content |
|---------|---------|
| **Header** | Type badge and name |
| **Description** | Full description (not truncated) |
| **Metadata grid** | Agent count, usage count, created date, updated date |
| **Topology** | If the blueprint specifies a topology (e.g., "debate-ring" or "fan-out"), it is displayed here |
| **Tags** | All tags as chips |
| **Configuration** | Raw JSON view of the blueprint's configuration (ID, type, topology, agent count, tags) |

Press **Escape** or click outside the modal to close it.

## Deploying a Blueprint

There are two places to deploy:

1. **From the card** -- Click the **Deploy** button on any card in the gallery.
2. **From the detail modal** -- Click **Deploy** at the bottom of the modal.

Deployment creates a deployment record via the deployment API and increments the blueprint's usage counter. The deployment runs with `triggerType: once` by default.

## Deleting a Blueprint

Open the blueprint detail modal and click **Delete**. The blueprint is removed via `DELETE /api/blueprints/:id` and the gallery refreshes. There is no undo, so use this with care.

## Demo Mode

If no blueprints exist in the backend, the tab displays 8 demo blueprints covering all four types (Code Review Team, Research Pipeline, Debate Topology, CI/CD Workflow, and more). A yellow banner indicates demo mode. Create your own blueprints to replace the demos.

## Tips

- **Sort by Most Used** to surface your team's most popular templates.
- **Use tags consistently** across blueprints so search and filtering work well.
- **Topology blueprints** pair with the Topology tab -- design a topology there, then save it as a blueprint for reuse.
- **Agent blueprints** can define multi-agent teams (not just single agents). The agent count on each card tells you how many agents are included.

## Related

- [Forge Tab](forge.md) -- Visual team designer
- [Builder Tab](builder.md) -- Workflow builder with topology visualization
- [Dashboard Overview](overview.md) -- All 24 tabs at a glance
