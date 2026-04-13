---
title: "CLI Native Bridge"
description: "How the Claude Code plugin combines MCP tools and native CLI commands for full Qualixar OS coverage"
category: "claude-cli"
tags: ["claude-code", "cli", "mcp", "bridge", "native", "plugin"]
last_updated: "2026-04-13"
---

# CLI Native Bridge

The `qos-claude-code` plugin (v2.1.1) connects Claude Code to Qualixar OS through two channels: **MCP tools** for structured LLM interaction, and **native CLI commands** via Bash for operations that MCP does not cover. This dual approach gives Claude Code complete access to every QOS capability.

## Two Channels, One System

### Channel 1: MCP Tools (Automatic)

The plugin declares an MCP server in `plugin.json`:

```json
{
  "mcp": {
    "command": "npx",
    "args": ["qualixar-os", "--mcp"]
  }
}
```

Claude Code connects to this server on startup. The MCP server exposes domain-grouped tools (`qos_task`, `qos_system`, `qos_agents`, `qos_context`, `qos_quality`, `qos_workspace`, `qos_workflow_create`) plus the legacy 25 individual tools. These are called as native tool invocations during conversation.

### Channel 2: CLI via Bash (Agent + Skills)

The plugin's `qos-orchestrator` agent has access to `Bash`, `Read`, `Write`, `Grep`, and `Glob` tools. It runs QOS CLI commands directly:

```bash
# The orchestrator agent runs these via Bash tool
qos run "your task prompt" -t code -m power
qos status abc-123
qos output abc-123
qos forge code
qos agents abc-123
qos cost abc-123
```

The plugin's skills (`qos-task-orchestrator`) and commands (`/qos-task`, `/qos-workspace`) also use curl against the HTTP API or direct filesystem access to `~/.qualixar-os/workspaces/`.

## What Uses Which Channel

| Operation | Channel | Why |
|-----------|---------|-----|
| Submit a task | MCP (`qos_task` action=run) | Structured input/output for LLM |
| Poll task status | MCP (`qos_task` action=status) | Fast, no shell overhead |
| Steer a running task | MCP (`qos_task` action=steer) | Not available as direct CLI command |
| Browse Forge designs | MCP (`qos_agents` action=forge_design) | JSON response for LLM reasoning |
| Search memory | MCP (`qos_quality` action=memory_search) | Structured results |
| Browse workspace files | CLI (`ls ~/.qualixar-os/workspaces/<id>/`) | Filesystem operation |
| Read agent logs | CLI (`cat .../.qos-log/team.jsonl`) | File content, not an MCP tool |
| Export an agent | CLI (`qos export <id> -f soul-md`) | CLI-only command |
| Initial setup | CLI (`qos init`) | Interactive, CLI-only |
| Health check | CLI (`qos doctor`) | CLI-only |
| Start server | CLI (`qos serve --dashboard`) | Server lifecycle, CLI-only |
| Change config | Either | CLI for persistence, MCP for runtime |

## How the Plugin Commands Work

### /qos-task

Submits a task via HTTP POST to the running QOS server:

```bash
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Review auth module", "mode": "power"}'
```

The server routes through the same orchestrator pipeline as `qos run`.

### /qos-status

Hits the health and task list endpoints:

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/tasks
```

### /qos-workspace

Directly reads the filesystem:

```bash
ls -la ~/.qualixar-os/workspaces/<taskId>/
cat ~/.qualixar-os/workspaces/<taskId>/.qos-log/team.jsonl
```

Also available via API:

```bash
curl -s http://localhost:3000/api/tasks/<taskId>/logs
```

### /qos-forge

Activates the Forge design skill, which internally calls the MCP `qos_agents` tool with `action=forge_design`.

### /qos-marketplace

Browses the skill store via the marketplace API or MCP tools.

## Example: Combined Workflow

A typical Claude Code session might use both channels in sequence:

```
User: "Set up QOS and run a code review on my auth module"

Claude Code:
1. [Bash] qos doctor                          # CLI: check health
2. [Bash] qos serve --dashboard -p 3000 &     # CLI: start server
3. [MCP]  qos_task action=run                  # MCP: submit task
         prompt="Review src/auth/ for vulnerabilities"
         type="code" mode="power"
4. [MCP]  qos_task action=status               # MCP: poll until complete
         taskId="abc-123"
5. [Bash] ls ~/.qualixar-os/workspaces/abc-123/ # CLI: browse output
6. [Read] ~/.qualixar-os/workspaces/abc-123/review.md  # Read: show results
7. [MCP]  qos_system action=cost_summary       # MCP: check cost
         taskId="abc-123"
```

Steps 1-2 use CLI (server lifecycle). Steps 3-4 and 7 use MCP (structured tool calls). Steps 5-6 use filesystem access (workspace browsing).

## Example: Agent Export + Re-Import

```
User: "Export the reviewer agent as SOUL.md, then re-import it"

Claude Code:
1. [MCP]  qos_agents action=list               # MCP: find the agent ID
2. [Bash] qos export abc-agent -f soul-md \    # CLI: export (CLI-only)
          -o ./reviewer-SOUL.md
3. [Read] ./reviewer-SOUL.md                    # Read: show the export
4. [Bash] qos import ./reviewer-SOUL.md        # CLI: re-import
```

Export is CLI-only. Import works via both CLI and MCP (`qos_workspace` action=import_agent).

## When to Prefer CLI Over MCP

1. **Server lifecycle** -- `qos serve`, `qos dashboard`, `qos mcp` are inherently CLI operations.
2. **Initial setup** -- `qos init` is interactive and CLI-only.
3. **Diagnostics** -- `qos doctor` runs connectivity and config validation checks.
4. **File export** -- `qos export` writes to files, which MCP tools cannot do.
5. **Batch scripting** -- Chaining multiple `qos run` calls in a shell loop is simpler than repeated MCP calls.
6. **Workspace browsing** -- `ls` and `cat` on workspace directories is more flexible than API endpoints.

## When to Prefer MCP Over CLI

1. **During conversation** -- MCP tools return structured JSON that Claude can reason about directly.
2. **Task steering** -- `qos_task` action=steer redirects a running task mid-execution, not available as a direct CLI command.
3. **Token efficiency** -- The UCP adapter groups 25 commands into 7 tools, keeping the tool list compact.
4. **Context management** -- `qos_context` tools (add, scan, list) are UCP-only, not exposed as top-level CLI commands.
5. **Memory storage** -- `qos_quality` action=memory_store writes to memory, while the CLI `qos memory` command only reads.

## Configuration

The plugin auto-discovers the QOS server at `http://localhost:3000`. To change the port:

```bash
qos config server.port 3000
```

The MCP server is started automatically by Claude Code when the plugin is installed. No manual `qos mcp` invocation is needed.
