# Qualixar OS — Claude Code Plugin

The Universal OS for AI Agents, integrated into Claude Code.

## What You Get

### Skills
- **`qos-forge-design`** — Design multi-agent teams from a prompt. Forge picks topology, agents, and tools.
- **`qos-code-review`** — Multi-agent code review using debate topology (reviewer vs devil's advocate + judge).
- **`qos-research`** — Deep web research with cited sources using web-researcher agent.
- **`qos-marketplace`** — Browse and install skills from the global registry.

### Commands
- `/qos-forge` — Quick access to Forge team designer
- `/qos-marketplace` — Search the skill marketplace
- `/qos-status` — Server health, costs, active tasks

### Hooks
- **Cost tracker** — Logs tool usage for cost analysis
- **Audit log** — Compliance logging for all tool actions

### MCP Server
Full Qualixar OS exposed as MCP tools:
- `qos_task` — Run, pause, resume, cancel tasks
- `qos_agents` — List agents, Forge design, topologies
- `qos_system` — Config, models, cost summary
- `qos_context` — Workspace and context management
- `qos_quality` — Judge results, memory search
- `qos_workspace` — File management, agent import

## Install

```bash
# From Claude Code
/plugin install qualixar-os

# Or manually
claude mcp add qualixar-os -- npx qualixar-os --mcp
```

## License

MIT — [Qualixar](https://qualixar.com)
