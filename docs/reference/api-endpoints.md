---
title: "API Endpoints Reference"
description: "Complete REST API reference for Qualixar OS"
category: "reference"
tags: ["api", "rest", "endpoints", "reference"]
last_updated: "2026-04-13"
---

# API Endpoints Reference

Qualixar OS exposes a REST API. All endpoints accept and return JSON. Authentication via `Authorization: Bearer <QOS_API_KEY>` when `QOS_API_KEY` is set.

## System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (no auth required) |
| GET | `/api/ready` | Readiness check: DB, models, event bus |
| GET | `/api/setup/status` | Provider availability and local model detection |
| GET | `/api/system/cwd` | Current working directory |
| GET | `/api/system/browse?path=` | Browse directories (within home) |
| POST | `/api/system/mkdir` | Create a directory |
| GET | `/api/system/config` | Get merged config (memory + disk) |
| POST | `/api/system/config` | Update config (partial merge, persists to disk) |
| GET | `/api/system/models` | Available models (config + Ollama detection) |
| GET | `/api/system/events?limit=50` | Recent events from DB |
| GET | `/api/models` | Model catalog |
| GET | `/api/models/status` | Model catalog with availability |

## Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (latest 100) |
| POST | `/api/tasks` | Create and run a task (returns 202) |
| GET | `/api/tasks/:id` | Task status (in-memory or DB) |
| GET | `/api/tasks/:id/detail` | Full detail: agents, judges, costs |
| GET | `/api/tasks/:id/logs` | Structured agent logs (team.jsonl) |
| POST | `/api/tasks/:id/pause` | Pause a running task |
| POST | `/api/tasks/:id/resume` | Resume a paused task |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| POST | `/api/tasks/:id/redirect` | Change prompt mid-execution |
| GET | `/api/tasks/:id/workspace` | List workspace files |
| GET | `/api/tasks/:id/workspace/*` | Read a workspace file |

## Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents (in-memory, then DB fallback) |
| GET | `/api/agents/:id` | Agent details |
| GET | `/api/agents/:id/detail` | Agent + model calls + events |

## Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/conversations` | List conversations |
| POST | `/api/chat/conversations` | Create a conversation |
| GET | `/api/chat/conversations/:id` | Get conversation |
| PUT | `/api/chat/conversations/:id` | Update title |
| DELETE | `/api/chat/conversations/:id` | Delete conversation + messages |
| GET | `/api/chat/conversations/:id/messages` | List messages |
| POST | `/api/chat/conversations/:id/messages` | Send message (async AI response via WebSocket) |
| POST | `/api/chat/conversations/:id/cancel` | Cancel active stream |
| POST | `/api/chat/conversations/:id/clone` | Branch/clone a conversation |
| POST | `/api/chat/conversations/:id/files` | Upload files (multipart) |
| GET | `/api/files/:filename` | Serve uploaded files |

## Quality (Forge, Judges, Swarm, RL)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/judges/results?taskId=` | Judge verdicts |
| GET | `/api/judges/profiles` | Available judge profiles |
| GET | `/api/forge/designs?taskType=` | Team designs |
| GET | `/api/forge/designs/:taskType` | Designs for a task type |
| GET | `/api/swarm/topologies` | Allowed topologies for current mode |
| GET | `/api/rl/stats` | Strategy scoring statistics |
| GET | `/api/rl/strategies` | Learned strategies |

## Cost

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cost` | Cost summary + budget status |
| GET | `/api/cost/history` | Per-call cost entries |

## Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory/stats` | Memory system statistics |
| GET | `/api/memory/search?q=&layer=&limit=` | Search memory (SLM-Lite) |
| GET | `/api/memory/entries?limit=50` | Raw memory entries |
| GET | `/api/memory/beliefs` | Belief graph entries |

## Data and Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/logs` | Structured logs (with event fallback) |
| GET/POST | `/api/reviews` | Human review items (gate) |
| PUT | `/api/reviews/:id` | Update review status |
| GET/POST | `/api/datasets` | Dataset management |
| GET | `/api/datasets/:id/preview?limit=20` | Dataset preview |
| DELETE | `/api/datasets/:id` | Delete dataset |
| GET/POST | `/api/vectors` | Vector store entries |
| DELETE | `/api/vectors/:id` | Delete vector |
| GET | `/api/vectors/stats` | Vector store statistics |
| GET/POST | `/api/vectors/search` | Vector search (embedding or keyword) |
| GET/POST | `/api/blueprints` | Task blueprints |
| POST | `/api/blueprints/:id/deploy` | Deploy a blueprint as a task |
| DELETE | `/api/blueprints/:id` | Delete blueprint |
| GET/POST | `/api/prompts` | Prompt library |
| PUT | `/api/prompts/:id` | Update prompt |
| DELETE | `/api/prompts/:id` | Delete prompt |
| GET/POST | `/api/lab/experiments` | A/B experiments |
| GET | `/api/lab/experiments/:id` | Experiment with live status |
| GET | `/api/lab/experiments/:id/results` | Experiment comparison results |
| GET | `/api/traces` | Task execution traces |
| GET | `/api/traces/metrics` | Trace metrics (avg duration, error rate) |
| GET/POST/PUT/DELETE | `/api/flows[/:id]` | Flow definitions (CRUD) |
| POST | `/api/flows/:id/run` | Execute a flow |
| POST | `/api/chat/hitl/:requestId` | Human-in-the-loop approve/reject |

## Connectors and Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/connectors` | MCP connectors |
| DELETE | `/api/connectors/:id` | Remove connector |
| POST | `/api/connectors/:id/test` | Test connector connectivity |
| GET | `/api/connectors/:id/tools` | Tools from a connector |
| GET/POST/DELETE | `/api/tool-connectors[/:id]` | Config-persisted connectors |
| GET | `/api/tools` | Full tool catalog |
| GET | `/api/tools/categories` | Tool categories |
| GET | `/api/tools/for-task/:taskType` | Tools relevant to a task type |
| GET | `/api/mcp/tools` | MCP tool registry (static catalog) |

## Real-Time

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `/api/sse` | SSE | Server-Sent Events stream |
| `/ws` | WebSocket | Real-time events + task control + JSON-RPC 2.0 |
| `/.well-known/agent-card` | HTTP | A2A agent discovery |

## Error Format

All errors return: `{ "error": "message" }` with appropriate HTTP status codes (400, 401, 403, 404, 409, 413, 429, 500).

## Related

- [Config Schema](config-schema.md) -- Configuration reference
- [Events Reference](events.md) -- All event types
- [Topologies](topologies.md) -- Available topologies
