---
title: "MCP Setup for Claude Code"
description: "Connect Qualixar OS as an MCP server to Claude Code CLI — registration, verification, available tools, and troubleshooting"
category: "claude-cli"
tags: ["mcp", "setup", "claude-code", "tools", "stdio"]
last_updated: "2026-04-13"
---

# MCP Setup for Claude Code

Qualixar OS exposes its full API as an MCP (Model Context Protocol) server. This lets Claude Code call QOS tools directly — run tasks, design teams, manage agents, and more — all through the standard MCP protocol over stdio transport.

## Step 1: Register QOS as an MCP Server

Run this command in your terminal:

```bash
claude mcp add qualixar-os -- npx qualixar-os --mcp
```

This registers QOS in your Claude Code MCP configuration. The `--mcp` flag starts QOS in MCP mode (stdio transport), which Claude Code connects to automatically.

### Alternative: Manual Configuration

Add this to your `~/.claude.json` under the `mcpServers` section:

```json
{
  "mcpServers": {
    "qualixar-os": {
      "command": "npx",
      "args": ["qualixar-os", "--mcp"]
    }
  }
}
```

## Step 2: Verify the Connection

Start a new Claude Code session and check that QOS tools are available:

```
> What MCP tools do you have from qualixar-os?
```

Claude should list the QOS tools. You can also verify from the terminal:

```bash
claude mcp list
```

Look for `qualixar-os` in the output.

## Available MCP Tools

QOS exposes 25 tools via MCP. The core tools you will use most:

### Task Management

| Tool | Description |
|------|-------------|
| `run_task` | Run a new task. Accepts `prompt`, `type`, `mode`, `budget_usd`, `topology`, `simulate`. |
| `get_status` | Get task status by `taskId`. |
| `list_tasks` | List recent tasks (up to 50). |
| `pause_task` | Pause a running task. |
| `resume_task` | Resume a paused task. |
| `cancel_task` | Cancel a task. |
| `redirect_task` | Redirect a task with a new prompt mid-execution. |

### Agents and Forge

| Tool | Description |
|------|-------------|
| `list_agents` | List all registered agents. |
| `get_forge_designs` | Get Forge team designs, optionally filtered by task type. |
| `list_topologies` | List available execution topologies. |

### System and Cost

| Tool | Description |
|------|-------------|
| `get_system_config` | Get current system configuration. |
| `get_cost` | Get cost summary (overall or per task). |

### Quality and Memory

| Tool | Description |
|------|-------------|
| `get_judge_results` | Get judge evaluation results for a task. |
| `search_memory` | Search QOS memory (SLM-Lite). Accepts `query`, `layer`, `limit`. |
| `search_vectors` | Search the vector store. |

### Data and Connectors

| Tool | Description |
|------|-------------|
| `list_connectors` | List configured connectors. |
| `test_connector` | Test a connector by ID. |
| `list_datasets` | List available datasets. |
| `preview_dataset` | Preview rows from a dataset. |

### Blueprints and Prompts

| Tool | Description |
|------|-------------|
| `list_blueprints` | List agent blueprints. |
| `deploy_blueprint` | Deploy a blueprint by ID. |
| `list_prompts` | List prompt templates. |
| `create_prompt` | Create a new prompt template. |

### Chat

| Tool | Description |
|------|-------------|
| `send_chat_message` | Send a message in a QOS conversation. |

## Tool Tiers

QOS supports tiered tool exposure to control token budget. Set the `QOS_TIER` environment variable:

| Tier | Tools | Token Budget |
|------|-------|-------------|
| `core` | `qos_task`, `qos_system` | ~800 tokens |
| `extended` | + `qos_agents`, `qos_context` | ~1,600 tokens |
| `full` (default) | All 6 domain tools | ~2,400 tokens |

The domain-grouped tools (`qos_task`, `qos_agents`, etc.) use discriminated unions on the `action` parameter to keep the tool count low while covering all operations.

## Troubleshooting

### "Tool not found" or no QOS tools listed

1. Verify QOS is installed: `npx qualixar-os --version`
2. Re-register: `claude mcp add qualixar-os -- npx qualixar-os --mcp`
3. Restart Claude Code to pick up the new MCP server

### "Connection refused" or timeouts

The MCP server runs over stdio, not HTTP. It starts a fresh QOS process each time Claude Code launches. If you see connection errors:

1. Check that `npx qualixar-os --mcp` runs without errors in a standalone terminal
2. Verify Node.js is available: `node --version` (requires Node 18+)
3. Check for port conflicts if you also have `qos serve` running

### High token usage from tool descriptions

Switch to a smaller tier: set `QOS_TIER=core` in your environment before launching Claude Code. This reduces tool descriptions from ~2,400 tokens to ~800 tokens.

### Authentication

If you have `QOS_API_KEY` set, the MCP server uses the same key. The stdio transport handles this internally. For the HTTP API (used by slash commands), set the key in your environment:

```bash
export QOS_API_KEY=your-key-here
```

## Related

- [Plugin Installation](./plugin-install.md) — Install the full Claude Code plugin
- [MCP Protocol Details](../ide-integration/mcp-protocol.md) — How QOS implements MCP
- [MCP Integration Guide](../guides/mcp-integration.md) — Connecting external MCP servers to QOS
