---
title: "Lab Tab"
description: "Run A/B experiments to compare models, topologies, and prompts side by side"
category: "dashboard"
tags: ["dashboard", "lab", "experiments", "a/b testing", "comparison"]
last_updated: "2026-04-13"
---

# Lab Tab

The Lab tab is your experimentation workspace. It lets you run A/B comparisons between two configurations --- different models, topologies, prompts, or parameter settings --- and see the results side by side with charts and metrics.

## Three Views

The Lab tab has three sub-views, selectable via buttons at the top:

| View | Purpose |
|------|---------|
| **Configure** | Set up a new experiment with two variants |
| **Results** | View comparison metrics, charts, and outputs |
| **History** | Browse all past experiments and their outcomes |

## Configure View

This is where you design your experiment. You fill in three sections:

### Experiment Setup

- **Experiment Name** --- A descriptive name (e.g., "Topology Comparison v2")
- **Description** --- What you are testing and why
- **Task Prompt** --- The prompt or task that both variants will execute

### Variant A and Variant B

Each variant is configured independently with:

| Setting | Description |
|---------|-------------|
| **Topology** | Choose from 13 topologies: sequential, parallel, hierarchical, dag, mixture_of_agents, debate, mesh, star, circular, grid, forest, maker, hybrid |
| **Model** | Select from available models (only models marked as available appear) |
| **System Prompt** | Optional instructions for this variant |
| **Temperature** | Slider from 0.0 to 2.0 (default: 0.7) |
| **Max Tokens** | Maximum output length, from 1 to 128,000 (default: 4,096) |

Variant A is shown in indigo, Variant B in green, so you can always tell them apart.

### Running the Experiment

Click **Run Experiment** when all required fields are filled: experiment name, task prompt, and a model selected for both variants. The button stays disabled until these are provided. While running, it shows "Running..." and prevents duplicate submissions.

## Results View

After an experiment completes, the Results view presents a full comparison.

### Hero Metrics

Four metric cards appear at the top, each showing the value for Variant A and Variant B with a percentage delta:

| Metric | Unit | Lower is Better? |
|--------|------|-------------------|
| **Quality Score** | 0--1 | No |
| **Latency** | ms | Yes |
| **Cost** | USD | Yes |
| **Tokens** | count | Yes |

Each card shows an arrow and percentage indicating whether Variant B improved or regressed relative to Variant A.

### Metric Comparison Chart

A grouped bar chart compares both variants across five quality dimensions: Quality, Accuracy, Fluency, Relevance, and Safety. Bars are color-coded by variant.

### Tradeoff Radar

A radar chart plots six dimensions --- Quality, Latency, Cost, Tokens, Safety, and Coherence --- showing the tradeoff profile of each variant. This makes it easy to see which variant excels in which area.

### Output Comparison

A side-by-side panel shows the actual text output from each variant, so you can qualitatively evaluate the difference beyond numbers.

If no experiments have been completed yet, the Results view shows demo data with a banner indicating it is not real. Run an experiment from the Configure tab to see actual results.

## History View

The history table lists all experiments with these columns:

| Column | Description |
|--------|-------------|
| **Experiment Name** | What you named it |
| **Status** | Draft, running, completed, or failed (color-coded badge) |
| **Date** | When the experiment was created |
| **Winner** | Which variant won (shown in that variant's color) |
| **Quality Delta** | The percentage quality improvement of the winner |

If no experiments exist yet, demo data is shown with a banner indicating it is not real.

## Typical Workflow

1. Open the **Configure** view
2. Name your experiment and write the task prompt
3. Set Variant A to your current configuration (baseline)
4. Set Variant B to the change you want to test
5. Click **Run Experiment**
6. Switch to the **Results** view once the experiment completes
7. Compare metrics, charts, and outputs to decide which variant wins
8. Check the **History** view to track your experimentation over time

## Tips

- **Always change only one variable per experiment.** If you change both the model and topology, you cannot attribute the difference to either one.
- **Use the radar chart** to understand tradeoffs. A variant might win on quality but lose on latency.
- **Read the output comparison** in addition to metrics. Numbers do not capture everything --- sometimes the qualitative difference is what matters.
- **The history table** is your experiment log. Use descriptive names so you can find past results easily.

## Related

- [Judges Tab](judges.md) --- Quality evaluation details for each task
- [Cost Tab](cost.md) --- Spending breakdown by model and provider
- [Traces Tab](traces.md) --- Timing analysis for experiment runs
