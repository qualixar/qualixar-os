---
title: "Vectors Tab"
description: "Browse, search, and inspect your vector store"
category: "dashboard"
tags: ["dashboard", "vectors", "embeddings", "semantic-search", "rag"]
last_updated: "2026-04-13"
---

# Vectors Tab

The Vectors tab is a browser for your vector store and a semantic search playground. It shows store-level statistics, lets you search vectors by meaning (not just keywords), and provides a detail view for inspecting individual entries with their content, metadata, and embedding dimensions.

## Getting There

Open the dashboard and click **Vectors** in the sidebar under **Data & Memory**.

## Store Statistics

Four stat cards appear at the top of the page:

| Card | What It Shows |
|------|---------------|
| **Total Vectors** | Number of vector entries indexed in the store |
| **Dimensions** | Embedding dimensionality (e.g., 384 for MiniLM) |
| **Index Type** | The index algorithm in use (e.g., HNSW) |
| **Store Size** | Disk space consumed by the vector index |

If no live backend is connected, the tab displays demo data with a yellow banner at the top. Once you connect a real backend or index vectors, the stats reflect your actual store.

## Semantic Search Playground

Below the stats is the **Semantic Search Playground** card. Type a natural language query and click **Search**. The system converts your query into an embedding and finds the closest vectors by cosine similarity.

### How to Search

1. Enter a query in the text field (e.g., "retry logic with exponential backoff").
2. Click **Search** (or press Enter).
3. Results appear below, ranked by similarity score.

The search field accepts any plain-text query. It works by meaning, so "how does the agent router work" will match code and docs about routing even if they do not contain the exact words.

## Search Results

Each result row displays:

- **Similarity bar** -- A color-coded progress bar showing how closely the vector matches your query. Green (above 80%) is a strong match, amber (50-80%) is moderate, and red (below 50%) is weak.
- **Content preview** -- The first 200 characters of the stored text, rendered in a monospace font so code snippets stay readable.
- **Source** -- The file or session the vector was ingested from (e.g., `code/utils.ts`, `docs/architecture.md`).
- **Metadata toggle** -- Click "Show metadata" on any row to expand a JSON view of the entry's metadata (language, section, version, or any custom fields you attached during ingestion).

Click anywhere on a result row to open the detail panel.

## Vector Detail Panel

The detail panel is a modal that shows everything about a single vector:

| Field | Description |
|-------|-------------|
| **ID** | The unique vector identifier |
| **Source** | Origin file or session |
| **Similarity** | Score bar (only present when opened from a search) |
| **Content** | Full text, scrollable, monospace |
| **Metadata** | Complete JSON metadata |
| **Embedding Preview** | First 8 dimensions of the raw embedding vector, plus total dimension count |
| **Created** | Timestamp of when the vector was indexed |

Press **Escape** or click outside the modal to close it.

## Understanding Similarity Scores

The similarity bar uses a three-tier color system:

| Score Range | Color | Meaning |
|-------------|-------|---------|
| **80-100%** | Green | Strong semantic match -- highly relevant to your query |
| **50-79%** | Amber | Moderate match -- related content, worth reviewing |
| **0-49%** | Red | Weak match -- tangentially related or noise |

Scores are based on cosine similarity between your query's embedding and each stored vector. A 95% score means the content is almost semantically identical to your query. A 25% score means the content shares only loose thematic overlap.

## Supported Content Types

The vector store indexes content from multiple source types. The **Source** field on each entry tells you where it came from:

- **Code files** (e.g., `code/utils.ts`) -- Functions, classes, and code blocks.
- **Documentation** (e.g., `docs/architecture.md`) -- Prose from markdown and text files.
- **Chat sessions** (e.g., `chat/session-42`) -- Conversation turns from agent interactions.
- **SQL migrations** (e.g., `migrations/003_vectors.sql`) -- Schema definitions and queries.

Metadata attached to each vector provides additional context such as the programming language, document section, or conversation turn count.

## Demo Mode

When the vector store is empty or the backend is unreachable, the tab automatically falls back to demo data (10 sample vectors across code, docs, and chat sources). A yellow warning banner indicates demo mode. Index real content or connect a live backend to see your own data.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close the vector detail modal |
| `Enter` | Submit a search query (when the search field is focused) |

## Tips

- **Use specific queries** -- "WebSocket authentication flow" returns better results than "auth."
- **Check the similarity score** -- Anything above 80% is highly relevant. Below 50% is likely noise.
- **Inspect metadata** -- Metadata can tell you the language, document section, or version so you know exactly where the content came from.
- **Embedding preview** -- Use the dimension preview in the detail panel to verify that embeddings are being generated correctly (non-zero values, expected dimensionality).

## Related

- [Memory Tab](memory.md) -- RAG memory store and search
- [Dashboard Overview](overview.md) -- All 24 tabs at a glance
