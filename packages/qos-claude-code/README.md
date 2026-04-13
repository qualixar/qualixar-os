# QOS Claude Code Plugin

Integrates Qualixar OS with Claude Code CLI for native agent orchestration.

## Install

```bash
npm install -g qos-claude-code
```

## Commands

- `/qos-task <prompt>` -- Submit a task to QOS
- `/qos-forge <description>` -- Design an agent team
- `/qos-status [taskId]` -- Check task status
- `/qos-workspace <taskId>` -- Browse task output files
- `/qos-marketplace` -- Browse installed skills and tools

## Agent

- `qos-orchestrator` -- Manages QOS tasks: submit, monitor, inspect results

## Requirements

- Qualixar OS running locally (`npx qualixar-os`)
- Claude Code CLI

## How It Works

This plugin connects Claude Code to a running Qualixar OS instance via its HTTP API (default: `http://localhost:3001`). You can:

1. Submit tasks that get routed through the full QOS pipeline (Forge team design, swarm execution, judge evaluation)
2. Monitor task progress in real-time
3. Browse workspace directories for agent-generated artifacts
4. Manage the skill marketplace

## License

FSL-1.1-ALv2
