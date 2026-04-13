---
title: "MCP Integration Guide"
description: "Connect external tools and services to Qualixar OS via the Model Context Protocol"
category: "guides"
tags: ["mcp", "integration", "tools", "protocol", "connectors"]
last_updated: "2026-04-13"
---

# MCP Integration Guide

Qualixar OS supports the Model Context Protocol (MCP) natively. Any MCP server can be connected to provide tools, resources, and prompts to your agents.

## What is MCP?

MCP is a JSON-RPC protocol that lets AI applications discover and call tools exposed by external servers. An MCP server exposes:

- **Tools** -- Functions agents can call (e.g., search, calculate, query database)
- **Resources** -- Data agents can read (e.g., files, database records)
- **Prompts** -- Reusable prompt templates

## Qualixar OS MCP Server

Qualixar OS itself is an MCP server (defined in `server.json`). When installed via npm, it exposes these tools to any MCP client:

| Tool | Category | Description |
|------|----------|-------------|
| `run_task` | execution | Submit a task to the orchestrator |
| `get_status` | monitoring | Get task status |
| `list_tasks` | monitoring | List all tasks |
| `pause_task` | control | Pause a running task |
| `resume_task` | control | Resume a paused task |
| `cancel_task` | control | Cancel a task |
| `redirect_task` | control | Change task prompt mid-execution |
| `list_agents` | monitoring | List active agents |
| `get_cost` | monitoring | Get cost summary |
| `get_judge_results` | quality | Get judge verdicts |
| `get_forge_designs` | agents | Get Forge team designs |
| `search_memory` | memory | Search memory (SLM-Lite) |
| `list_topologies` | agents | List available topologies |
| `get_rl_stats` | learning | Get strategy scoring stats |
| `get_system_config` | system | Get system configuration |

## Connecting External MCP Servers

### Via Dashboard (Recommended)

1. Navigate to the **Connectors** tab in the dashboard
2. Click **Add MCP Server**
3. Enter the server command or URL
4. Test the connection
5. The server's tools appear in the Tools tab

### Via Config

Add tool connectors to `~/.qualixar-os/config.yaml`:

```yaml
toolConnectors:
  - id: my-github
    name: github
    transport: stdio
    command: npx
    args: ["@modelcontextprotocol/server-github"]

  - id: my-remote
    name: remote-tools
    transport: streamable-http
    url: http://localhost:9000/mcp
```

### Via API

```bash
curl -X POST http://localhost:3000/api/tool-connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-sqlite",
    "transport": "stdio",
    "command": "npx",
    "args": ["@modelcontextprotocol/server-sqlite", "--db", "./data.db"]
  }'
```

### Transport Types

| Transport | Config Key | Use Case |
|-----------|-----------|----------|
| `stdio` | `command` + `args` | Local processes (default) |
| `streamable-http` | `url` | Remote servers |

## Managing Tool Connectors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tool-connectors` | List all config-persisted connectors |
| POST | `/api/tool-connectors` | Add a new connector |
| DELETE | `/api/tool-connectors/:id` | Remove a connector |
| POST | `/api/tool-connectors/:id/refresh` | Refresh tool discovery |

## Using MCP Tools in Tasks

Once connected, MCP tools are available to agents through the tool registry:

```bash
curl http://localhost:3000/api/tools
```

Agents are automatically assigned relevant tools by Forge based on the task type.

## Popular MCP Servers

| Server | Tools Provided |
|--------|---------------|
| `@modelcontextprotocol/server-github` | GitHub issues, PRs, code search |
| `@modelcontextprotocol/server-sqlite` | SQL queries on local databases |
| `@modelcontextprotocol/server-filesystem` | File read/write operations |

Find more at [MCP server directory](https://github.com/modelcontextprotocol/servers).

## Troubleshooting

**"Server failed to start"** -- Check that the command exists (`which npx`) and the MCP server package is installed.

**"Tool not found"** -- Verify the server is listed in the Connectors tab. Use the test endpoint: `POST /api/connectors/:id/test`.

## Related

- [Tools Tab](../dashboard/tools.md) -- View and manage all tools
- [Connectors Tab](../dashboard/connectors.md) -- Manage MCP connections
- [Skill Manifest](../reference/skill-manifest.md) -- Define skills that wrap MCP tools
