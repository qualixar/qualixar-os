---
title: "Tools Tab"
description: "Manage agent tools across 6 categories"
category: "dashboard"
tags: ["tools", "functions", "capabilities", "mcp", "dashboard"]
last_updated: "2026-04-05"
---

# Tools Tab

The Tools tab manages all tools available to agents. Tools are organized into 6 categories and can be enabled, disabled, or configured per agent or globally.

## Tool Categories

Qualixar OS organizes tools into 6 categories:

| Category | Examples |
|----------|----------|
| **web-data** | Web search, URL fetch, scraping, API calls |
| **code-dev** | Code execution, file operations, git, linting |
| **communication** | Email, Slack, notifications, webhooks |
| **knowledge** | RAG search, document parsing, embeddings |
| **creative** | Image generation, text-to-speech, summarization |
| **enterprise** | Database queries, CRM, ERP, reporting |

See [Tool Categories Reference](../reference/tool-categories.md) for the full list.

## Tool Management

### Viewing Tools

The Tools tab shows all registered tools with:
- Name and description
- Category
- Status (enabled/disabled)
- Usage count
- Source (built-in, plugin, MCP)

### Enabling/Disabling

Toggle tools on or off globally. Disabled tools are hidden from all agents.

### Per-Agent Tool Assignment

When configuring an agent (via Forge or the Agents tab), you can specify which tool categories or individual tools the agent may use:

```yaml
# In a task or agent config
tools:
  - web-data      # entire category
  - code-dev
  - knowledge
```

Or specific tools:

```yaml
tools:
  - web-search
  - code-execute
  - memory-search
```

## MCP Tools

Tools from MCP (Model Context Protocol) servers appear automatically once the MCP server is connected. See [MCP Integration Guide](../guides/mcp-integration.md).

## Built-in Tools

Qualixar OS ships with core tools in each category. These are always available and do not require external dependencies.

## API Access

```bash
# List all tools
curl http://localhost:3000/api/tools

# Get tools by category
curl http://localhost:3000/api/tools?category=web-data
```

## Related

- [Tool Categories Reference](../reference/tool-categories.md) — Complete tool listing
- [MCP Integration Guide](../guides/mcp-integration.md) — Add external tools via MCP
- [Marketplace Tab](marketplace.md) — Install additional tools
