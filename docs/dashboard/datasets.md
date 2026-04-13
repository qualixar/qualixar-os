---
title: "Datasets Tab"
description: "Upload, browse, preview, and manage evaluation datasets"
category: "dashboard"
tags: ["dashboard", "datasets", "evaluation", "benchmarking", "data"]
last_updated: "2026-04-13"
---

# Datasets Tab

The Datasets tab lets you manage test and evaluation datasets used for agent benchmarking. You can upload data files, browse what is loaded, preview row-level content, and delete datasets you no longer need.

## What Are Datasets For?

Datasets in Qualixar OS serve as input for evaluation and benchmarking workflows. Typical uses include:

- **Evaluation prompts** -- Test inputs to measure agent response quality
- **Response corpora** -- Collected agent outputs with human ratings
- **Tool call traces** -- Logged tool invocations for fidelity analysis
- **Judge scores** -- Multi-judge consensus scoring results

## Layout

The tab is organized top to bottom:

1. **Stats cards** -- Three summary metrics
2. **Main grid** -- Dataset list (left) and upload form (right)
3. **Preview modal** -- Opens when you click a dataset

## Stats Cards

Three cards summarize your data:

| Card | What It Shows |
|------|---------------|
| **Total Datasets** | Number of datasets loaded |
| **Total Rows** | Combined row count across all datasets |
| **Total Size** | Combined file size (displayed in human-readable format: KB, MB, GB) |

## Dataset List

The main table shows all loaded datasets with these columns:

| Column | Description |
|--------|-------------|
| **Name** | File name of the dataset |
| **Format** | Color-coded badge: CSV (green), JSON (blue), JSONL (amber) |
| **Rows** | Number of rows in the dataset |
| **Columns** | Number of columns |
| **Size** | File size in human-readable format |
| **Created** | When the dataset was uploaded |

Click any row to open the preview panel.

## Supported Formats

Three file formats are supported:

| Format | Extension | Typical Use |
|--------|-----------|-------------|
| **CSV** | `.csv` | Tabular data with headers -- evaluation scores, survey results |
| **JSON** | `.json` | Structured objects -- configuration, nested data |
| **JSONL** | `.jsonl` | One JSON object per line -- streaming data, log records |

## Uploading a Dataset

The upload form on the right side of the tab has four fields:

1. **Name** -- A label for the dataset. If you select a file first, the name auto-fills from the filename.
2. **Description** -- A brief note about what this dataset contains (optional but recommended).
3. **Format** -- Choose CSV, JSON, or JSONL from the dropdown.
4. **File** -- Click to browse and select a `.csv`, `.json`, or `.jsonl` file.

Click **Upload** to submit. The form validates that both a name and file are provided before uploading. On success, the form clears and the dataset list refreshes.

If the upload fails, an error message appears below the form explaining what went wrong.

## Previewing a Dataset

Click any dataset row to open the preview modal. The modal shows:

### Metadata Cards

Five metadata cards across the top:

- **Format** -- File type badge
- **Rows** -- Total row count
- **Columns** -- Column count
- **Size** -- File size
- **Created** -- Upload timestamp

### Description

If a description was provided during upload, it appears below the dataset name.

### Row Preview

A table showing the first 10 rows of the dataset. Columns are detected from the data. Cell values that are too long are truncated with ellipsis.

If preview data is not available (the API does not have row-level data loaded), a message indicates this.

## Deleting a Dataset

From the preview modal, click **Delete Dataset** at the bottom right. A confirmation prompt appears before deletion proceeds. This action is permanent.

## Tips

- Use descriptive names and descriptions so team members can identify datasets without opening them.
- JSONL format works well for agent execution traces since each line is a self-contained record.
- The row preview shows the first 10 rows -- enough to verify the data structure without loading the full dataset.
- Monitor the Total Size stat to keep storage usage in check.

## Related

- [Memory Tab](memory.md) -- RAG memory for knowledge storage
- [Vectors Tab](overview.md) -- Vector store management
- [Overview](overview.md) -- Dashboard tab directory
