---
title: "Installing the QOS Claude Code Plugin"
description: "Step-by-step installation of the Qualixar OS plugin for Claude Code CLI — commands, agents, skills"
category: "claude-cli"
tags: ["install", "plugin", "claude-code", "commands", "agents"]
last_updated: "2026-04-13"
---

# Installing the QOS Claude Code Plugin

The `qos-claude-code` plugin (v2.1.1) adds slash commands, an orchestrator agent, and a task management skill to Claude Code.

## Prerequisites

- Claude Code CLI v1.0.0 or later
- Node.js 18+
- Qualixar OS installed: `npm install -g qualixar-os`

## Installation

```bash
npm install -g qos-claude-code
```

After installing, restart Claude Code to load the plugin.

## What Gets Installed

### Slash Commands

Five commands become available in Claude Code:

#### `/qos-task <prompt>`

Submit a task to the running QOS server. Forge designs an agent team and executes it.

```
/qos-task Review the authentication module for security vulnerabilities
/qos-task Write unit tests for src/utils/parser.ts with 90% coverage
```

What happens behind the scenes:
1. Connects to QOS at `http://localhost:3000`
2. Posts the task to `POST /api/tasks`
3. Forge auto-designs the team (topology, roles, tools)
4. Agents execute and return results
5. Displays task ID, status, and output

#### `/qos-forge <description>`

Design a multi-agent team without executing it. Forge analyzes your description and returns a team configuration.

```
/qos-forge Build a code review pipeline for my TypeScript project
```

Returns the topology, agent roles, model assignments, and tool allocations.

#### `/qos-status`

Check the health of your QOS instance. Shows:
- Server health (up/down)
- Running tasks count
- Active agents
- Total cost and budget remaining

```
/qos-status
```

#### `/qos-workspace <taskId>`

Browse output files from a completed task. Looks up the workspace at `~/.qualixar-os/workspaces/<taskId>/` and shows:
- Output files (code, documents, artifacts)
- Agent logs from `.qos-log/` directory
- Team execution timeline

```
/qos-workspace abc123
/qos-workspace abc123 --logs
```

#### `/qos-marketplace`

Browse and search the skill marketplace. Find tools, skills, and plugins to extend your agent teams.

```
/qos-marketplace search github
/qos-marketplace list installed
```

### Orchestrator Agent

The plugin registers the `qos-orchestrator` agent, which runs on the Sonnet model with access to Bash, Read, Write, Grep, and Glob tools.

The orchestrator handles:
- Submitting tasks via the QOS API
- Polling task status until completion or failure
- Browsing workspace directories for results
- Summarizing active/completed/failed task counts and costs

Claude Code invokes this agent automatically when you interact with QOS through natural language rather than slash commands.

### Task Orchestrator Skill

The `qos-task-orchestrator` skill provides structured task management:

1. **Submit** — POST to `/api/tasks` with prompt and mode
2. **Poll** — Check `/api/tasks/:id` until status is `completed` or `failed`
3. **Review** — Read workspace output and agent logs
4. **Iterate** — Submit follow-up tasks referencing previous workspaces

The skill knows the full QOS API surface and can handle error recovery (starting the server if it is down, checking logs on failure).

## Verifying the Installation

Start a Claude Code session and try:

```
/qos-status
```

If the server is not running, start it first:

```bash
qos serve --dashboard --port 3000
```

Then retry `/qos-status` in Claude Code.

## Server Requirements

The slash commands and agent connect to a running QOS server via HTTP. The default URL is `http://localhost:3000`. Start the server with:

```bash
qos serve --dashboard --port 3000
```

The `--dashboard` flag enables the web dashboard at `http://localhost:3000/dashboard` for visual monitoring alongside CLI usage.

## Related

- [Overview](./overview.md) — What QOS brings to Claude Code
- [MCP Setup](./mcp-setup.md) — Connect QOS as an MCP server
- [Skills Guide](./skills-guide.md) — Using QOS skills
- [Power User Guide](./power-user.md) — Advanced workflows
