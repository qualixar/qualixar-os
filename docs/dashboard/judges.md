---
title: "Judges Tab"
description: "Monitor quality verdicts, scores, and feedback from judge evaluations"
category: "dashboard"
tags: ["dashboard", "judges", "quality", "verdicts", "scoring"]
last_updated: "2026-04-13"
---

# Judges Tab

The Judges tab shows how your agent outputs are being evaluated. Every time a task completes, one or more judge models review the output and issue a verdict. This tab gives you full visibility into those evaluations --- scores, verdicts, detailed feedback, and identified issues.

## What Judges Do

Judges are LLM-based evaluators that review agent output for quality, correctness, and safety. After a task runs, each configured judge model independently scores the result and delivers one of three verdicts:

| Verdict | Meaning |
|---------|---------|
| **Approve** | Output meets quality standards. Shown in green. |
| **Reject** | Output has significant quality issues. Shown in red. |
| **Revise** | Output needs improvement but is not outright rejected. Shown in amber. |

Each verdict includes a numeric score between 0 and 1. Scores at or above 0.7 are considered strong, 0.4--0.7 are moderate, and below 0.4 indicates poor quality.

## Judge Configuration

At the top of the tab, the **Judge Configuration** card lets you control how judges evaluate output.

**Strictness Level** --- Choose one of three modes:

- **Strict** --- Reject on any quality issue
- **Balanced** --- Allow minor issues, reject significant ones (default)
- **Lenient** --- Approve with minor or moderate issues

**Custom Judge Prompt** --- Optionally override the default evaluation criteria with your own instructions. For example: "Focus on code correctness and security. Ignore styling issues. Require 80% test coverage."

Click **Save Judge Settings** to persist your changes. A green "Saved" confirmation appears briefly.

## Judge Summary

The summary card provides at-a-glance metrics across all verdicts:

- **Total Verdicts** --- How many judge evaluations have been recorded
- **Approved** --- Count of approve verdicts
- **Rejected** --- Count of reject verdicts
- **Revise** --- Count of revise verdicts
- **Avg Score** --- Mean score across all evaluations

## Score Timeline

A line chart plots scores over time, letting you see whether output quality is trending up or down. Each point represents one verdict, plotted in order. This is useful for spotting regressions after prompt changes or model swaps.

## Verdict History

The history table lists every verdict with four columns:

| Column | Description |
|--------|-------------|
| **Judge Model** | Which model performed the evaluation |
| **Verdict** | Approve, reject, or revise (color-coded) |
| **Score** | Numeric quality score (0--1) |
| **Duration** | How long the evaluation took |

**Click any row** to open a detail modal with the full picture.

## Verdict Detail Modal

When you click a verdict row, a modal opens showing:

- **Model** --- The judge model name
- **Verdict** --- Color-coded status badge
- **Score** --- Visual progress bar plus numeric value
- **Duration** --- Evaluation time in seconds
- **Full Feedback** --- The complete text explanation from the judge
- **Issues** --- Each issue listed with its severity level, category, description, and suggested fix

Press `Escape` or click outside the modal to close it.

## Judge Feedback Section

Below the history table, a dedicated feedback section appears whenever judges have provided written feedback. Each entry shows:

- The verdict badge and judge model name
- The score
- Expandable feedback text (click "more" to expand long feedback)
- Any issues flagged, with severity, category, and description

## Tips

- **Use multiple judge models** for consensus. If all judges approve, you have high confidence. Mixed verdicts suggest areas to investigate.
- **Watch the score timeline** after changing prompts or models to catch quality regressions early.
- **Customize the judge prompt** when your use case has domain-specific quality criteria that the default evaluation might miss.
- **Start with Balanced strictness** and tighten to Strict once your pipeline is stable.

## Related

- [Pipelines Tab](pipelines.md) --- See where judging fits in the task pipeline
- [Traces Tab](traces.md) --- View judge evaluation spans in the trace waterfall
- [Settings Tab](settings.md) --- System-wide configuration
