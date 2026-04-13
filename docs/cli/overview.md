---
title: "CLI Reference"
description: "Complete reference for all Qualixar OS CLI commands — task execution, team design, memory, config, server, and advanced dispatch"
category: "cli"
tags: ["cli", "reference", "commands", "qos"]
last_updated: "2026-04-13"
---

# CLI Reference

Qualixar OS ships a `qos` CLI binary built with Commander.js. It exposes 25 commands across 7 groups, plus access to the full 25-command Universal Command Protocol (UCP) via `qos cmd` and `qos dispatch`.

Config is loaded from `~/.qualixar-os/config.yaml`, with env vars from `~/.qualixar-os/.env`.

## Core Commands (Task Lifecycle)

### run

Run a task through the full orchestrator pipeline (Forge team design, agent execution, judge evaluation).

```bash
qos run <prompt> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Task type: `code`, `research`, `analysis`, `creative`, `custom` | `custom` |
| `-m, --mode <mode>` | Execution mode: `companion`, `power` | `companion` |
| `-b, --budget <usd>` | Budget limit in USD | none |
| `--topology <name>` | Force a specific swarm topology | auto-selected |
| `--simulate` | Dry-run simulation before execution | off |
| `--stream` | Stream output in real-time | off |
| `--template <name>` | Use a named template | none |

```bash
qos run "Review auth module for security vulnerabilities" -t code -m power
qos run "Analyze competitor pricing" -t research --budget 0.50
qos run "Build a REST API" --topology pipeline --stream
```

### status

Show the current status of a task.

```bash
qos status <taskId>
```

### output

Display the output and artifacts of a completed or failed task.

```bash
qos output <taskId>
```

### pause

Pause a running task. Agents stop at their next checkpoint.

```bash
qos pause <taskId>
```

### resume

Resume a previously paused task.

```bash
qos resume <taskId>
```

### cancel

Cancel a task permanently.

```bash
qos cancel <taskId>
```

### cost

Show cost summary (token usage, USD spent) for a specific task or globally.

```bash
qos cost [taskId]
```

## Design Commands (Forge and Agents)

### forge

Show the Forge design library. Forge stores reusable team designs (topology, agents, tools) indexed by task type.

```bash
qos forge [taskType]
```

```bash
qos forge           # list all designs
qos forge code      # list designs for code tasks
```

### agents

List registered agents, or show agents assigned to a specific task.

```bash
qos agents [taskId]
```

```bash
qos agents                  # list all registered agents
qos agents abc-123-def      # show agents for a specific task
```

### judges

Show judge evaluation results for a task, or all recent results.

```bash
qos judges [taskId]
```

Output includes judge model, verdict, and score for each evaluation.

## Memory Command

### memory

Search the SLM-Lite memory system. Returns matching entries with layer and content.

```bash
qos memory <query> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --layer <layer>` | Filter by memory layer | all layers |
| `--limit <n>` | Maximum results | 10 |

```bash
qos memory "authentication patterns" --limit 5
qos memory "API design" -l decisions
```

## Config Commands

### config

Read or write configuration. Values are persisted to `~/.qualixar-os/config.yaml`.

```bash
qos config                          # show full config
qos config <key>                    # read a value (dot notation)
qos config <key> <value>            # set a value (dot notation)
```

```bash
qos config models.primary           # read primary model
qos config models.primary claude-sonnet-4-6  # set primary model
qos config mode power               # switch to power mode
```

### init

Interactive setup wizard. Creates `~/.qualixar-os/` with config, env, and optionally runs a first task.

```bash
qos init [options]
```

| Option | Description |
|--------|-------------|
| `--no-interactive` | Skip prompts, use defaults + flags |
| `--default` | Alias for `--no-interactive` |
| `--provider <name>` | Primary LLM provider |
| `--api-key-env <var>` | Env var name for API key |
| `--model <name>` | Primary model name |
| `--channels <list>` | Comma-separated channels (e.g. `cli,mcp,http`) |
| `--budget <usd>` | Budget limit in USD |
| `--skip-first-task` | Skip the post-install demo task |
| `--dashboard-port <port>` | Dashboard port number |

```bash
qos init
qos init --default --provider azure --model gpt-4o --budget 5
```

### models

List all models in the catalog with provider, quality score, and max tokens.

```bash
qos models
```

### doctor

Run a health check. Validates config, checks connectivity, verifies dependencies.

```bash
qos doctor
```

## Server Commands

### serve

Start the HTTP/WebSocket/A2A server. This is the runtime that plugins and the dashboard connect to.

```bash
qos serve [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Port number | 3000 |
| `--dashboard` | Also serve the dashboard UI | off |

```bash
qos serve --dashboard -p 3000
```

### dashboard

Start a dedicated dashboard server.

```bash
qos dashboard [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Port number | 3333 |

### mcp

Start the MCP server on stdio transport. This is what Claude Code connects to for tool access.

```bash
qos mcp
```

Typically invoked automatically by Claude Code via the plugin config (`npx qualixar-os --mcp`), not run manually.

## Advanced Commands

### cmd

Execute any Universal Command Protocol (UCP) command. The UCP defines 25 commands across 9 categories (task, context, workspace, agents, forge, quality, memory, system, interop) that work identically across all transports.

```bash
qos cmd <command> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON |
| `-i, --input <json>` | JSON input for the command |

```bash
qos cmd run -i '{"prompt":"analyze code","type":"code"}'
qos cmd agents.list --json
qos cmd forge.design -i '{"taskType":"research"}'
qos cmd memory.search -i '{"query":"auth patterns"}'
qos cmd config.get -i '{"key":"mode"}'
```

### cmd-list

List all 25 UCP commands with their category and description.

```bash
qos cmd-list
```

### dispatch

Lower-level UCP dispatcher. Same as `cmd` but always outputs JSON.

```bash
qos dispatch <command> [jsonInput]
```

```bash
qos dispatch context.add '{"paths":["./src"]}'
qos dispatch forge.topologies
```

### import

Import an agent definition from an external format (SOUL.md, OpenClaw, DeerFlow, NemoClaw, GitAgent).

```bash
qos import <path> [options]
```

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Source format (auto-detected if omitted) |

```bash
qos import ./agents/reviewer/SOUL.md
qos import ./agent.json -f openclaw
```

### export

Export an agent to an external format.

```bash
qos export <agentId> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Target format: `soul-md`, `json`, `yaml` | `json` |
| `-o, --output <path>` | Write to file instead of stdout | stdout |

```bash
qos export abc-123 -f soul-md -o ./SOUL.md
qos export abc-123 -f yaml
```

### new

Scaffold a new Qualixar OS project from a template.

```bash
qos new <project>
```

```bash
qos new my-agent-pipeline
```

### version

Show the installed Qualixar OS version.

```bash
qos version
```

## UCP Command Reference (via cmd / dispatch)

All 25 Universal Commands accessible through `qos cmd <name>`:

| Command | Category | Description |
|---------|----------|-------------|
| `run` | task | Run a new task through the orchestrator pipeline |
| `status` | task | Get the current status of a running task |
| `output` | task | Retrieve the output of a completed task |
| `cancel` | task | Cancel a running task |
| `pause` | task | Pause a running task |
| `resume` | task | Resume a paused task |
| `steer` | task | Redirect a running task with a new prompt |
| `list` | task | List tasks with optional status filter and pagination |
| `context.add` | context | Add file paths and URLs as context for a task |
| `context.scan` | context | Scan a directory for context files |
| `context.list` | context | List all context entries for a task |
| `workspace.set` | workspace | Set the working directory for tasks |
| `workspace.files` | workspace | List generated files from a task output directory |
| `agents.list` | agents | List agents, optionally filtered by task or status |
| `agents.inspect` | agents | Inspect a single agent with full details and call history |
| `forge.design` | forge | Design a team for a task type (dry-run if no taskId) |
| `forge.topologies` | forge | List all available swarm topologies |
| `judges.results` | quality | Retrieve judge assessment results for a task |
| `memory.search` | memory | Search memory entries by query with optional layer filter |
| `memory.store` | memory | Store a new memory entry in a specific layer |
| `config.get` | system | Get runtime configuration by dot-notated key path |
| `config.set` | system | Set a runtime configuration value |
| `models.list` | system | List all known LLM models with pricing and quality scores |
| `cost.summary` | system | Get cost summary for a specific task or globally |
| `import` | interop | Import an agent definition from an external format |
