---
title: "Power User Guide — Claude Code + QOS"
description: "Advanced workflows combining Claude Code CLI with Qualixar OS — multi-agent tasks, Forge team design, real-time monitoring, and the full execution loop"
category: "claude-cli"
tags: ["power-user", "advanced", "multi-agent", "forge", "monitoring", "workflow"]
last_updated: "2026-04-13"
---

# Power User Guide — Claude Code + QOS

This guide covers advanced patterns for combining Claude Code CLI with Qualixar OS. You get the best of both: Claude Code's direct file access and coding ability, plus QOS multi-agent orchestration.

## The Full Loop

The core power-user workflow is a feedback loop:

```
Claude Code CLI
  |
  +-- You describe a task
  |
  +-- Claude submits to QOS via /qos-task or MCP tools
  |
  +-- QOS Forge designs the team
  |     |-- Picks topology (pipeline, parallel, debate, etc.)
  |     |-- Assigns agent roles and models
  |     +-- Allocates tools
  |
  +-- Agent team executes
  |     |-- Workspace created at ~/.qualixar-os/workspaces/<id>/
  |     +-- Logs streamed via SSE/WebSocket
  |
  +-- Results return to Claude Code
  |     |-- Claude reads workspace files
  |     +-- Claude summarizes or applies the output
  |
  +-- You iterate
```

## Running Multi-Agent Tasks from Claude Code

### Basic: Single Command

```
/qos-task Research the top 5 AI agent frameworks in 2026, compare their architectures, and recommend one for a Node.js backend
```

QOS handles everything: Forge designs a research team, agents execute, results land in a workspace.

### Advanced: Control the Topology

Ask Claude to submit with specific parameters via the MCP `run_task` tool:

```
> Run a QOS task with debate topology: two agents argue whether to use SQLite or PostgreSQL for our use case, and a judge decides. Budget $0.50.
```

Claude uses the MCP tool:
```json
{
  "prompt": "Debate SQLite vs PostgreSQL for a 10K-user SaaS app",
  "topology": "debate",
  "budget_usd": 0.50
}
```

### Advanced: Simulate First

Test a task without executing it:

```
> Simulate a QOS task: parallel code review of src/auth/ and src/api/ directories
```

The `simulate: true` parameter returns the Forge design and cost estimate without running agents.

## Designing Teams with Forge

Use `/qos-forge` to iterate on team design before committing:

```
/qos-forge Build a 4-agent security audit pipeline that checks OWASP Top 10
```

Forge returns:
- Topology recommendation (likely `pipeline` or `hierarchical`)
- Agent roles with model assignments
- Tool allocations per agent
- Estimated cost

Review the design, adjust if needed, then submit the actual task.

## Monitoring Tasks While Coding

### From Claude Code

Check on running tasks without leaving your session:

```
/qos-status
```

Or ask for details on a specific task:

```
/qos-workspace abc123
```

### Split Terminal Workflow

Run Claude Code in one terminal and the QOS dashboard in another:

**Terminal 1 — Claude Code:**
```bash
claude
```

**Terminal 2 — QOS Dashboard:**
```bash
qos serve --dashboard --port 3000
# Open http://localhost:3000/dashboard
```

The dashboard provides real-time visualization of agent execution, cost tracking, and log streaming across 24 tabs.

### SSE Event Stream

Subscribe to task events from any terminal:

```bash
curl -N http://localhost:3000/api/sse
```

Events stream in real-time as agents start, produce output, and complete.

### WebSocket for Interactive Control

Connect via WebSocket for bidirectional communication:

```
ws://localhost:3000/ws
```

Send commands to pause, resume, or cancel tasks:
```json
{"type": "task:pause", "taskId": "abc123"}
{"type": "task:resume", "taskId": "abc123"}
{"type": "task:cancel", "taskId": "abc123"}
```

## Steering Agents Mid-Execution

QOS supports task redirection. If an agent is going off track:

```
> Redirect QOS task abc123: focus only on SQL injection, skip XSS for now
```

Claude calls the `redirect_task` MCP tool, which changes the agent's prompt mid-execution.

## Combining Claude Code + QOS Output

The most powerful pattern: let QOS agents do the heavy lifting, then use Claude Code to apply the results.

**Example: Code Review + Auto-Fix**

1. Submit a review task:
   ```
   /qos-task Review src/api/ for security vulnerabilities using OWASP guidelines
   ```

2. Wait for completion, then browse results:
   ```
   /qos-workspace <taskId>
   ```

3. Ask Claude Code to apply the fixes:
   ```
   > Read the review output from the QOS workspace and fix each vulnerability in the actual source files
   ```

Claude Code reads the workspace, understands the findings, and edits your source files directly.

## Cost-Aware Workflows

### Check Before Running

```
> How much would a 3-agent parallel research task cost?
```

Claude uses `get_cost` and `get_system_config` to estimate.

### Budget Limits

Set a budget on every task:

```
/qos-task Comprehensive code audit of the entire src/ directory
```

Then tell Claude:
```
> Set a $1 budget limit on that task
```

QOS enforces the budget and stops agents if costs exceed the limit.

### Cost Summary

```
/qos-status
```

Shows total spend across all tasks. Or ask for per-task breakdown via the `get_cost` MCP tool.

## Blueprint Workflows

Save successful team designs as blueprints for reuse:

1. Design a team: `/qos-forge Security audit pipeline`
2. Save the design as a blueprint via the dashboard
3. Deploy it later: `deploy_blueprint` MCP tool or dashboard Blueprints tab

## Related

- [Overview](./overview.md) — What QOS brings to Claude Code
- [MCP Setup](./mcp-setup.md) — MCP tool registration and verification
- [Skills Guide](./skills-guide.md) — Using skills in Claude Code
- [Topologies Reference](../reference/topologies.md) — All 13 execution topologies
- [Cost Optimization Guide](../guides/cost-optimization.md) — Managing agent costs
