---
title: "Qualixar OS for Claude Code CLI"
description: "What Qualixar OS brings to Claude Code — multi-agent orchestration, Forge team design, skill marketplace, and task management inside your terminal"
category: "claude-cli"
tags: ["claude-code", "plugin", "overview", "qos", "orchestration"]
last_updated: "2026-04-13"
---

# Qualixar OS for Claude Code CLI

Qualixar OS integrates directly with Claude Code CLI through a native plugin (`qos-claude-code` v2.1.1). This gives you multi-agent orchestration, automatic team design, a skill marketplace, and full task lifecycle management without leaving your terminal.

## What the Plugin Adds

The plugin connects Claude Code to a running Qualixar OS instance via its HTTP API (default `http://localhost:3000`). Once connected, you get:

- **5 slash commands** for direct interaction (`/qos-task`, `/qos-forge`, `/qos-status`, `/qos-workspace`, `/qos-marketplace`)
- **1 dedicated agent** (`qos-orchestrator`) that manages tasks on your behalf
- **1 skill** (`qos-task-orchestrator`) for structured task submission and monitoring
- **MCP server bridge** so Claude Code can call QOS tools natively

## How It Enhances Claude Code

### From Single Agent to Multi-Agent

Without QOS, Claude Code operates as a single agent. With the plugin, you can dispatch tasks to teams of agents running different models, executing in 13 different topologies (pipeline, parallel, debate, map-reduce, and more).

### Forge: Automatic Team Design

Type `/qos-forge Build a code review pipeline for my TypeScript project` and Forge analyzes your task, picks a topology, assigns roles, selects models, and allocates tools. No manual agent configuration needed.

### Task Lifecycle Management

Submit tasks, monitor progress, pause/resume/cancel running work, steer agents mid-execution, and browse output workspaces. All from slash commands or the orchestrator agent.

### Skill Marketplace

Browse, search, and install skills from the QOS marketplace directly in Claude Code with `/qos-marketplace`. Skills add specialized tools and capabilities to your agent teams.

### Cost Tracking

Every task tracks token usage and cost per agent. Check your budget with `/qos-status` at any time.

## Feature List

| Feature | How to Access | Description |
|---------|--------------|-------------|
| Submit task | `/qos-task <prompt>` | Send a task through the full QOS pipeline |
| Design team | `/qos-forge <description>` | Forge auto-designs an agent team |
| Check status | `/qos-status` | Server health, running tasks, costs |
| Browse output | `/qos-workspace <taskId>` | View agent-generated files and logs |
| Marketplace | `/qos-marketplace` | Search and install skills |
| Orchestrator agent | Automatic | Manages task submission and monitoring |
| MCP tools | Automatic | 25 tools available via MCP protocol |

## Architecture

```
Claude Code CLI
  |
  +-- qos-claude-code plugin
  |     |-- /qos-task -----> POST /api/tasks
  |     |-- /qos-forge ----> POST /api/forge/design
  |     |-- /qos-status ---> GET /api/health + /api/tasks
  |     |-- /qos-workspace -> GET ~/.qualixar-os/workspaces/<id>/
  |     |-- /qos-marketplace -> GET /api/skill-store/browse
  |     +-- qos-orchestrator agent (Sonnet model)
  |
  +-- MCP bridge (stdio transport)
        |-- run_task, get_status, list_tasks, ...
        +-- 25 tools total
```

## CLI Native Access

The plugin uses **both** MCP tools and native CLI commands for full coverage. MCP tools handle structured interactions during conversation (task submission, status polling, memory search, Forge design). Native CLI commands via Bash handle operations that MCP cannot: server lifecycle (`qos serve`), health checks (`qos doctor`), workspace file browsing (`ls ~/.qualixar-os/workspaces/`), agent export (`qos export`), and initial setup (`qos init`).

The `qos-orchestrator` agent has Bash access and can run any `qos` command directly. The plugin's slash commands use a mix of HTTP API calls and filesystem access depending on the operation.

Key CLI commands available to the orchestrator agent:

```bash
qos run "task prompt" -t code -m power    # submit a task
qos status <taskId>                        # check progress
qos output <taskId>                        # get results
qos forge [taskType]                       # browse Forge designs
qos agents [taskId]                        # list agents
qos cost [taskId]                          # check spend
qos export <agentId> -f soul-md            # export agent (CLI-only)
qos doctor                                 # health check (CLI-only)
```

For the complete guide on when to use CLI vs MCP, and how they combine in practice, see [CLI Native Bridge](./cli-native-bridge.md).

## Requirements

- Qualixar OS installed: `npm install -g qualixar-os`
- QOS server running: `qos serve --dashboard --port 3000`
- Claude Code CLI v1.0.0 or later

## Next Steps

- [Install the Plugin](./plugin-install.md)
- [Set Up MCP Connection](./mcp-setup.md)
- [CLI Native Bridge](./cli-native-bridge.md)
- [Use Skills in Claude Code](./skills-guide.md)
- [Advanced Workflows](./power-user.md)

## Related

- [CLI Reference](../cli/overview.md)
- [CLI vs MCP Comparison](../cli/cli-vs-mcp.md)
- [Your First Multi-Agent Task](../guides/first-multi-agent-task.md)
- [Topologies Reference](../reference/topologies.md)
- [IDE Integration Overview](../ide-integration/overview.md)
