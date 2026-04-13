---
title: "CLI vs MCP Access"
description: "Compare CLI native commands with MCP tool access — what's available where, and when to use each"
category: "cli"
tags: ["cli", "mcp", "comparison", "tools", "transport"]
last_updated: "2026-04-13"
---

# CLI vs MCP Access

Qualixar OS exposes its capabilities through multiple transports. The two most relevant for Claude Code users are the **CLI** (direct shell commands) and the **MCP server** (tool calls over stdio). They overlap significantly but are not identical.

## How They Work

**CLI** (`qos <command>`) runs as a shell process. It loads config from `~/.qualixar-os/config.yaml`, initializes the orchestrator, executes the command, and prints formatted output. Best for human operators and Bash-based automation.

**MCP** (`qos mcp`) runs as a persistent stdio server. Claude Code connects to it and calls tools via the Model Context Protocol. Two MCP layers exist:

1. **Legacy MCP server** (`src/channels/mcp-server.ts`) -- 25 individual tools (e.g. `run_task`, `get_status`, `search_memory`). Fine-grained, one tool per action.
2. **UCP MCP adapter** (`src/commands/adapters/mcp-adapter.ts`) -- 7 domain-grouped tools (e.g. `qos_task`, `qos_system`). Each tool accepts an `action` parameter to select the sub-command. Token-efficient: ~2,400 tokens vs ~7,000 for 25 individual tools.

The UCP adapter supports tiering via the `QOS_TIER` env var:
- **core** (2 tools): `qos_task`, `qos_system`
- **extended** (4 tools): adds `qos_agents`, `qos_context`
- **full** (6 tools + `qos_workflow_create`): all commands

## Command Coverage Matrix

| Capability | CLI Command | MCP (Legacy) | MCP (UCP Adapter) | Notes |
|-----------|------------|-------------|-------------------|-------|
| Run a task | `qos run` | `run_task` | `qos_task` action=run | All transports |
| Task status | `qos status` | `get_status` | `qos_task` action=status | All transports |
| Task output | `qos output` | -- | `qos_task` action=output | CLI + UCP only |
| List tasks | -- | `list_tasks` | `qos_task` action=list | MCP + UCP |
| Pause task | `qos pause` | `pause_task` | `qos_task` action=pause | All transports |
| Resume task | `qos resume` | `resume_task` | `qos_task` action=resume | All transports |
| Cancel task | `qos cancel` | `cancel_task` | `qos_task` action=cancel | All transports |
| Steer task | -- | `redirect_task` | `qos_task` action=steer | MCP + UCP |
| List agents | `qos agents` | `list_agents` | `qos_agents` action=list | All transports |
| Inspect agent | -- | -- | `qos_agents` action=inspect | UCP only |
| Forge designs | `qos forge` | `get_forge_designs` | `qos_agents` action=forge_design | All transports |
| Topologies | -- | `list_topologies` | `qos_agents` action=forge_topologies | MCP + UCP |
| Search memory | `qos memory` | `search_memory` | `qos_quality` action=memory_search | All transports |
| Store memory | -- | -- | `qos_quality` action=memory_store | UCP only |
| Judge results | `qos judges` | `get_judge_results` | `qos_quality` action=judge_results | All transports |
| Get config | `qos config` | `get_system_config` | `qos_system` action=config_get | All transports |
| Set config | `qos config k v` | -- | `qos_system` action=config_set | CLI + UCP |
| List models | `qos models` | -- | `qos_system` action=models_list | CLI + UCP |
| Cost summary | `qos cost` | `get_cost` | `qos_system` action=cost_summary | All transports |
| Context add | -- | -- | `qos_context` action=add | UCP only |
| Context scan | -- | -- | `qos_context` action=scan | UCP only |
| Context list | -- | -- | `qos_context` action=list | UCP only |
| Set workspace | -- | -- | `qos_context` action=set_workspace | UCP only |
| Workspace files | -- | -- | `qos_context` action=workspace_files | UCP only |
| Import agent | `qos import` | -- | `qos_workspace` action=import_agent | CLI + UCP |
| Export agent | `qos export` | -- | -- | CLI only |
| RL stats | -- | `get_rl_stats` | -- | Legacy MCP only |
| Send chat | -- | `send_chat_message` | -- | Legacy MCP only |
| Connectors | -- | `list_connectors`, `test_connector` | -- | Legacy MCP only |
| Datasets | -- | `list_datasets`, `preview_dataset` | -- | Legacy MCP only |
| Vector search | -- | `search_vectors` | -- | Legacy MCP only |
| Blueprints | -- | `list_blueprints`, `deploy_blueprint` | -- | Legacy MCP only |
| Prompts | -- | `list_prompts`, `create_prompt` | -- | Legacy MCP only |
| Create workflow | -- | -- | `qos_workflow_create` | UCP adapter only |
| Init setup | `qos init` | -- | -- | CLI only |
| Doctor | `qos doctor` | -- | -- | CLI only |
| New project | `qos new` | -- | -- | CLI only |
| Cmd dispatch | `qos cmd` | -- | -- | CLI only |
| Cmd list | `qos cmd-list` | -- | -- | CLI only |
| Dispatch | `qos dispatch` | -- | -- | CLI only |
| Dashboard | `qos dashboard` | -- | -- | CLI only |
| Serve | `qos serve` | -- | -- | CLI only |
| MCP start | `qos mcp` | -- | -- | CLI only |
| Version | `qos version` | -- | -- | CLI only |

## CLI-Only Commands

These commands have no MCP equivalent and can only be run from the shell:

- **`qos init`** -- Interactive setup wizard (creates config, sets provider, runs first task)
- **`qos doctor`** -- Health check (validates config, checks connectivity)
- **`qos new`** -- Scaffold a new project from template
- **`qos serve`** / **`qos dashboard`** -- Start the HTTP server or dashboard
- **`qos mcp`** -- Start the MCP server itself
- **`qos export`** -- Export agent definitions to SOUL.md/JSON/YAML
- **`qos cmd`** / **`qos cmd-list`** / **`qos dispatch`** -- UCP command dispatch (these are how CLI accesses UCP; MCP accesses UCP through the adapter tools)
- **`qos version`** -- Version info

## When to Use CLI vs MCP

| Scenario | Use CLI | Use MCP |
|----------|---------|---------|
| Setting up QOS for the first time | `qos init` | -- |
| Running health checks | `qos doctor` | -- |
| Starting the server | `qos serve --dashboard` | -- |
| Submitting a task from Claude Code | -- | `qos_task` action=run |
| Polling task status programmatically | -- | `qos_task` action=status |
| Browsing Forge designs in conversation | -- | `qos_agents` action=forge_design |
| Searching memory during a session | -- | `qos_quality` action=memory_search |
| Changing config on the fly | `qos config` | `qos_system` action=config_set |
| Exporting an agent definition | `qos export` | -- |
| Importing an external agent | `qos import` | `qos_workspace` action=import_agent |
| Batch scripting multiple tasks | `qos run` in a loop | -- |
| Interactive Claude Code session | -- | MCP tools |

## Practical Guidance

**Use MCP when Claude Code is the operator.** The MCP tools are designed for LLM consumption -- structured JSON input, structured JSON output, domain-grouped to minimize token overhead.

**Use CLI when a human or shell script is the operator.** The CLI provides formatted output, interactive prompts (init), and server lifecycle commands that MCP cannot handle.

**Combine both for full coverage.** The Claude Code plugin uses MCP for real-time tool calls during conversation, and its `qos-orchestrator` agent uses Bash to run CLI commands when MCP tools are insufficient (e.g. `qos export`, workspace browsing via `ls`).
