---
title: "Agents Tab"
description: "View, configure, and manage individual AI agents"
category: "dashboard"
tags: ["agents", "configuration", "roles", "dashboard"]
last_updated: "2026-04-05"
---

# Agents Tab

The Agents tab shows all registered agents in the system. Each agent has a role, an assigned model, tool permissions, and execution history.

## Agent List

The main view displays a table of agents with:
- **Name** — Human-readable agent identifier
- **Role** — What the agent does (researcher, coder, reviewer, etc.)
- **Model** — Which LLM powers this agent
- **Status** — Idle, Running, Error
- **Tasks Completed** — Lifetime count
- **Last Active** — Timestamp

Click an agent to open its detail panel.

## Agent Detail Panel

The detail panel shows:

### Configuration
- System prompt
- Model assignment
- Temperature and other parameters
- Allowed tools
- Budget limit per task

### History
- Recent tasks with status and cost
- Average response time
- Success rate

### Metrics
- Token usage (input/output)
- Cost breakdown
- Error rate

## Creating an Agent

Agents are typically created as part of a task or team (via Forge). To create a standalone agent:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "code-reviewer",
    "role": "Review code for bugs and style issues",
    "model": "claude-sonnet-4-6",
    "tools": ["code-dev"],
    "system_prompt": "You are an expert code reviewer..."
  }'
```

## Listing Agents

```bash
# Via API
curl http://localhost:3000/api/agents

# Via CLI
qos agents list
```

## Agent Lifecycle

1. **Created** — Agent is configured but not yet assigned work
2. **Assigned** — Agent is part of an active task or team
3. **Running** — Agent is executing (processing, calling tools, generating)
4. **Complete** — Agent finished its assignment
5. **Error** — Agent encountered a failure

## Related

- [Forge Tab](forge.md) — Design agent teams
- [Tasks](../reference/api-endpoints.md) — Task API that assigns work to agents
- [Tool Categories](../reference/tool-categories.md) — Tools agents can use
