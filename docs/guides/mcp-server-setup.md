---
title: "Using Qualixar OS as an MCP Server"
description: "Connect Qualixar OS to Claude Code, VS Code, or Cursor via the Model Context Protocol and use all 25 tools from your IDE."
category: "guides"
tags: ["tutorial", "mcp", "claude-code", "vscode", "cursor", "ide-integration"]
last_updated: "2026-04-14"
---

# Using Qualixar OS as an MCP Server

Qualixar OS exposes its full API as 25 MCP tools. Any MCP-compatible client -- Claude Code, VS Code, Cursor, Windsurf -- can call these tools directly. This turns your IDE into a control plane for multi-agent orchestration.

## Prerequisites

- Qualixar OS installed (`npm install -g qualixar-os`)
- At least one provider configured (`qos doctor` to verify)

## Step 1: Start the MCP Server

The MCP server uses stdio transport (stdin/stdout). You do not start it manually -- the MCP client launches it as a subprocess. But you can test it:

```bash
qos mcp
```

This starts the MCP server on stdio. It will appear to hang (it is waiting for JSON-RPC messages on stdin). Press Ctrl+C to exit.

## Step 2: Configure in Your IDE

### Claude Code

Add this to `~/.claude.json` in the `mcpServers` section:

```json
{
  "mcpServers": {
    "qualixar-os": {
      "command": "qos",
      "args": ["mcp"],
      "type": "stdio"
    }
  }
}
```

Restart Claude Code. The 25 tools appear automatically.

### VS Code / Cursor

The same config shape works for both. For VS Code, add to `settings.json` under `"mcp.servers"`. For Cursor, add to `.cursor/mcp.json` under `"mcpServers"`:

```json
{
  "qualixar-os": {
    "command": "qos",
    "args": ["mcp"]
  }
}
```

If you prefer not to install globally, replace `"command": "qos"` with `"command": "npx"` and set `"args": ["qualixar-os", "mcp"]`.

## Step 3: Available MCP Tools

All 25 tools are available to your IDE once connected:

| Tool | Category | Description |
|------|----------|-------------|
| `run_task` | Execution | Submit a task to the orchestrator |
| `get_status` | Monitoring | Get task status by ID |
| `list_tasks` | Monitoring | List all tasks (50 most recent) |
| `pause_task` | Control | Pause a running task |
| `resume_task` | Control | Resume a paused task |
| `cancel_task` | Control | Cancel a task |
| `redirect_task` | Control | Change a task's prompt mid-execution |
| `list_agents` | Monitoring | List registered agents |
| `get_cost` | Monitoring | Get cost summary (optionally per task) |
| `get_judge_results` | Quality | Get judge evaluation verdicts |
| `get_forge_designs` | Agents | Get Forge team design library |
| `search_memory` | Memory | Search SLM-Lite memory store |
| `list_topologies` | Agents | List available execution topologies |
| `get_rl_stats` | Learning | Get reinforcement learning stats |
| `get_system_config` | System | Get current system configuration |
| `send_chat_message` | Chat | Send a message in a chat conversation |
| `list_connectors` | Connectors | List configured external connectors |
| `test_connector` | Connectors | Test a connector connection |
| `list_datasets` | Datasets | List available datasets |
| `preview_dataset` | Datasets | Preview rows from a dataset |
| `search_vectors` | Vectors | Search the vector store |
| `list_blueprints` | Blueprints | List agent blueprints |
| `deploy_blueprint` | Blueprints | Deploy a saved blueprint |
| `list_prompts` | Prompts | List prompt templates |
| `create_prompt` | Prompts | Create a new prompt template |

## Step 4: Submit a Task via MCP

From Claude Code, you can now ask Claude to use the tools directly. For example, type in your Claude Code session:

> "Use the qualixar-os run_task tool to review this file for security issues using the debate topology"

Claude calls the `run_task` tool with:

```json
{
  "prompt": "Review the code in src/auth.ts for security issues",
  "type": "code",
  "topology": "debate"
}
```

The tool returns the task ID and status.

## Step 5: Check Task Status via MCP

Ask Claude to check on the task:

> "Use qualixar-os get_status to check on that task"

Claude calls `get_status` with the task ID and returns the current pipeline stage, agent progress, and estimated completion.

To see the full results once complete, ask Claude to call `get_judge_results` for the judge verdicts or `get_cost` for the cost breakdown.

## Example Workflow

A typical MCP workflow from Claude Code:

```
You:    "Run a code review on my auth module using qualixar-os"
Claude: [calls run_task] → Task abc123 created, running debate topology

You:    "What's the status?"
Claude: [calls get_status] → Stage: judge evaluation, 2/3 agents complete

You:    "Show me the results"
Claude: [calls get_status] → Completed. 4 findings: 1 critical, 2 high, 1 medium

You:    "What did the judge think?"
Claude: [calls get_judge_results] → Approved, score 0.91

You:    "How much did it cost?"
Claude: [calls get_cost] → $0.003 (1,247 tokens across 3 agents)
```

## Related

- [MCP Integration Guide](mcp-integration.md) -- Connect external MCP servers TO Qualixar OS
- [Claude CLI Integration](../claude-cli/overview.md) -- Full Claude Code integration docs
- [IDE Integration](../ide-integration/overview.md) -- VS Code and Cursor setup details
- [CLI Reference](../cli/overview.md) -- All 25 CLI commands
