---
title: "Using QOS Skills in Claude Code"
description: "How Qualixar OS skills work inside Claude Code — invocation, workflow integration, and the task orchestrator skill"
category: "claude-cli"
tags: ["skills", "claude-code", "orchestrator", "workflow", "task-management"]
last_updated: "2026-04-13"
---

# Using QOS Skills in Claude Code

Skills are reusable, structured capabilities that Claude Code can invoke. The QOS plugin ships with the `qos-task-orchestrator` skill, which gives Claude Code structured knowledge of the entire QOS API for task management.

## What Skills Do

A skill is a markdown file that teaches Claude Code how to perform a specific workflow. Unlike slash commands (which are direct actions), skills provide context and instructions that Claude follows when the situation calls for it.

The `qos-task-orchestrator` skill teaches Claude Code:
- The exact API endpoints for task submission, status checking, and log retrieval
- The correct curl commands and JSON payloads
- Error handling patterns (server down, task failed, empty workspace)
- The workflow loop: submit, poll, review, iterate

## How to Invoke the Skill

### Automatic Invocation

When you ask Claude Code to manage QOS tasks in natural language, the orchestrator agent activates and uses the skill's knowledge:

```
> Run a code review on my authentication module and show me the results
```

Claude Code will:
1. Submit the task via `POST /api/tasks`
2. Poll status until completion
3. Read the workspace output
4. Present the results

### Through Slash Commands

The `/qos-task` command triggers the skill directly:

```
/qos-task Analyze src/api/ for security vulnerabilities
```

### Manual Reference

You can also ask Claude Code to use the skill explicitly:

```
> Use the QOS task orchestrator to run a parallel analysis of my test suite
```

## The Task Orchestrator Workflow

The skill defines a four-step workflow:

### 1. Submit

```bash
curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "your task description", "mode": "power"}'
```

The `mode` parameter controls agent allocation:
- `companion` — lighter, single-agent execution
- `power` — full multi-agent pipeline with Forge team design

### 2. Poll

```bash
curl -s http://localhost:3000/api/tasks/<taskId>
```

The skill polls every 5 seconds until the task reaches `completed` or `failed` status.

### 3. Review

Two ways to review output:

**Via API:**
```bash
curl -s http://localhost:3000/api/tasks/<taskId>/logs
```

**Via filesystem:**
```bash
ls -la ~/.qualixar-os/workspaces/<taskId>/
```

The workspace contains agent-generated code, documents, and artifacts. Agent logs live in the `.qos-log/` subdirectory.

### 4. Iterate

Submit follow-up tasks that reference previous work:

```
/qos-task Fix the issues found in task abc123 workspace
```

The orchestrator agent can read the previous workspace and provide context to the new task.

## Error Handling

The skill includes recovery instructions for common failures:

| Problem | Recovery |
|---------|----------|
| Server not running | Start with `qos serve --dashboard --port 3000` |
| Task failed | Check logs at `/api/tasks/:id/logs` for error entries |
| Workspace empty | Task may still be running — poll status first |
| Connection refused | Verify server port matches (default 3000) |

## Extending with Marketplace Skills

The QOS marketplace provides additional skills you can install:

```
/qos-marketplace search code-review
```

Installed skills become available to agent teams. Browse installed skills:

```
/qos-marketplace list installed
```

Skills from the marketplace are registered in the QOS skill store and loaded into the tool registry at server startup.

## Related

- [Plugin Installation](./plugin-install.md) — Install the QOS plugin
- [Power User Guide](./power-user.md) — Advanced multi-agent workflows
- [Marketplace Tab](../dashboard/marketplace.md) — Web-based skill management
- [Skill Manifest Reference](../reference/skill-manifest.md) — Building custom skills
