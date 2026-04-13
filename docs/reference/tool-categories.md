---
title: "Tool Categories"
description: "All 6 tool categories and their included tools"
category: "reference"
tags: ["tools", "categories", "capabilities", "reference"]
last_updated: "2026-04-05"
---

# Tool Categories

Qualixar OS organizes tools into 6 categories. When assigning tools to an agent, you can grant an entire category or individual tools.

## web-data

Tools for accessing and processing web content.

| Tool | Description |
|------|-------------|
| `web-search` | Search the web using configured search providers |
| `url-fetch` | Fetch and parse a URL's content |
| `web-scrape` | Extract structured data from web pages |
| `api-call` | Make HTTP requests to external APIs |
| `rss-feed` | Read and parse RSS/Atom feeds |

**Use for:** Research agents, data gathering, content analysis.

## code-dev

Tools for software development and code manipulation.

| Tool | Description |
|------|-------------|
| `code-execute` | Run code in a sandboxed environment |
| `file-read` | Read file contents |
| `file-write` | Write or modify files |
| `git-ops` | Git operations (status, diff, commit) |
| `lint` | Run linters and formatters |
| `test-run` | Execute test suites |

**Use for:** Coding agents, code review, automation.

## communication

Tools for messaging and notifications.

| Tool | Description |
|------|-------------|
| `email-send` | Send emails |
| `slack-post` | Post to Slack channels |
| `webhook-call` | Trigger webhooks |
| `notification` | Send system notifications |

**Use for:** Reporting agents, alert systems, workflow notifications.

## knowledge

Tools for RAG, document processing, and knowledge management.

| Tool | Description |
|------|-------------|
| `memory-search` | Semantic search over stored memories |
| `memory-store` | Store new knowledge entries |
| `doc-parse` | Parse PDFs, DOCX, and other documents |
| `embedding-create` | Generate vector embeddings |
| `summarize` | Summarize long text or documents |

**Use for:** Research agents, knowledge workers, document processing.

## creative

Tools for content generation and transformation.

| Tool | Description |
|------|-------------|
| `image-generate` | Generate images from text descriptions |
| `text-to-speech` | Convert text to audio |
| `translate` | Translate between languages |
| `rewrite` | Rewrite text in a different style or tone |

**Use for:** Content creation agents, marketing, localization.

## enterprise

Tools for business systems and data operations.

| Tool | Description |
|------|-------------|
| `sql-query` | Execute SQL queries against configured databases |
| `crm-access` | Read/write CRM records |
| `erp-access` | Interface with ERP systems |
| `report-generate` | Create structured reports |
| `data-transform` | Transform data between formats |

**Use for:** Business process agents, analytics, reporting.

## Assigning Tools to Agents

### By Category

```json
{
  "tools": ["web-data", "knowledge"]
}
```

This grants all tools in those categories.

### By Individual Tool

```json
{
  "tools": ["web-search", "memory-search", "file-read"]
}
```

### In config.yaml

```yaml
agents:
  researcher:
    tools:
      - web-data
      - knowledge
  coder:
    tools:
      - code-dev
```

## Related

- [Tools Tab](../dashboard/tools.md) — Manage tools in the dashboard
- [MCP Integration](../guides/mcp-integration.md) — Add custom tools via MCP
- [Agents Tab](../dashboard/agents.md) — Configure agent tool access
