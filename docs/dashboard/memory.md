---
title: "Memory Tab"
description: "RAG memory system for storing and retrieving agent knowledge"
category: "dashboard"
tags: ["memory", "rag", "vectors", "knowledge", "dashboard"]
last_updated: "2026-04-05"
---

# Memory Tab

The Memory tab manages Qualixar OS's built-in RAG (Retrieval-Augmented Generation) memory system. Agents can store knowledge during execution and retrieve it in future tasks, enabling persistent context across sessions.

## Features

- **Store** — Save text, documents, or structured data as memory entries
- **Search** — Semantic search across all stored memories
- **Browse** — View and filter all memory entries
- **Delete** — Remove outdated or incorrect memories
- **Tags** — Organize memories with tags for filtered retrieval

## Storing Memories

### Via Dashboard

1. Click **Store Memory** in the Memory tab
2. Enter the content, add tags, and set metadata
3. Click **Save**

### Via API

```bash
curl -X POST http://localhost:3000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "The production database uses PostgreSQL 16 on port 5432",
    "tags": ["infrastructure", "database"],
    "metadata": {"source": "manual", "confidence": 1.0}
  }'
```

## Searching Memories

Semantic search finds relevant memories even when exact keywords do not match:

```bash
curl "http://localhost:3000/api/memory/search?q=what+database+do+we+use&limit=5"
```

The search uses vector embeddings (configured via `models.embedding` in config.yaml) to find semantically similar entries.

## Agent Integration

Agents automatically use memory during task execution:
1. Before generating a response, the agent searches memory for relevant context
2. Retrieved memories are injected into the agent's prompt
3. After completing a task, the agent can store new learnings

This creates a feedback loop where agents get smarter over time.

## Memory Entry Structure

Each memory entry contains:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `content` | The stored text |
| `embedding` | Vector representation (auto-generated) |
| `tags` | User-defined labels |
| `metadata` | Source, confidence, timestamps |
| `created_at` | When the memory was stored |
| `accessed_at` | Last retrieval timestamp |

## Storage

Memories are stored in the local database at `~/.qualixar-os/qos.db` with vector embeddings for fast semantic search.

## Related

- [First Multi-Agent Task](../guides/first-multi-agent-task.md) — See memory in action
- [Provider Overview](../providers/overview.md) — Configure embedding models
- [Config Schema](../reference/config-schema.md) — Memory-related config options
