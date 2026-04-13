---
title: "Events Reference"
description: "All event types emitted by Qualixar OS via SSE and WebSocket"
category: "reference"
tags: ["events", "sse", "websocket", "streaming", "monitoring", "reference"]
last_updated: "2026-04-13"
---

# Events Reference

Qualixar OS emits typed events via Server-Sent Events (SSE) and WebSocket. All events use the `namespace:action` format (colon-separated). Events are defined in `src/types/events.ts`.

## Connecting

### SSE (read-only stream)

```bash
curl -N http://localhost:3000/api/sse
```

```javascript
const es = new EventSource('http://localhost:3000/api/sse');
es.addEventListener('task:completed', (e) => console.log(JSON.parse(e.data)));
```

### WebSocket (bidirectional)

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=YOUR_API_KEY');
ws.onmessage = (e) => { const { type, payload } = JSON.parse(e.data); };
```

WebSocket also accepts task control commands: `{ "type": "task:pause", "taskId": "..." }` and JSON-RPC 2.0 for the Universal Command Protocol.

## Event Format

```json
{ "type": "task:completed", "payload": { "taskId": "abc-123", "cost": 0.05 } }
```

## Event Categories

### System (Phase 0) -- 5 events
`system:started`, `system:stopped`, `system:error`, `config:changed`, `config:migrated`

### Task Lifecycle (Phase 1) -- 5 events
`task:created`, `task:started`, `task:completed`, `task:failed`, `task:cancelled`

### Model Calls (Phase 1) -- 4 events
`model:call_started`, `model:call_completed`, `model:call_failed`, `model:call_retrying`

### Cost (Phase 1) -- 4 events
`cost:recorded`, `cost:budget_warning`, `cost:budget_exceeded`, `cost:optimized`

### Mode (Phase 1) -- 2 events
`mode:switched`, `mode:feature_gated`

### Security (Phase 2) -- 8 events
`security:violation`, `security:policy_evaluated`, `security:skill_scanned`, `security:container_started`, `security:container_stopped`, `security:container_failed`, `security:credential_accessed`, `security:audit_logged`

### Quality / Judges (Phase 3) -- 11 events
`judge:started`, `judge:verdict`, `judge:rejected`, `judge:approved`, `consensus:reached`, `consensus:split`, `drift:detected`, `fabrication:detected`, `rl:update`, `rl:strategy_learned`, `rl:reward_recorded`

### Multi-Agent (Phase 4) -- 19 events
`forge:designing`, `forge:designed`, `forge:redesigning`, `forge:failed`, `agent:spawned`, `agent:started`, `agent:completed`, `agent:failed`, `agent:terminated`, `swarm:started`, `swarm:completed`, `swarm:failed`, `swarm:topology_set`, `simulation:started`, `simulation:completed`, `simulation:failed`, `handoff:occurred`, `message:sent`, `message:received`

### Memory (Phase 5) -- 11 events
`memory:stored`, `memory:recalled`, `memory:promoted`, `memory:archived`, `memory:expired`, `memory:trust_updated`, `memory:belief_updated`, `memory:belief_edge_added`, `memory:behavior_captured`, `memory:pattern_learned`, `memory:team_shared`

### Orchestrator (Phase 6) -- 14 events
`orchestrator:step_started`, `orchestrator:step_completed`, `checkpoint:saved`, `checkpoint:restored`, `steering:paused`, `steering:resumed`, `steering:redirected`, `steering:cancelled`, `steering:hitl_approved`, `steering:hitl_rejected`, `steering:human_escalation_required`, `output:delivered`, `output:formatted`, `output:saved_to_disk`

### Chat (Phase 14) -- 8 events
`chat:message_created`, `chat:stream_started`, `chat:token`, `chat:thinking_started`, `chat:thinking_ended`, `chat:tool_call_started`, `chat:tool_call_completed`, `chat:message_completed`

### Degradation -- 2 events
`degradation:tier_changed`, `degradation:human_required`

### Hybrid Topology -- 3 events
`hybrid:route_assigned`, `hybrid:cloud_fallback`, `hybrid:cost_reconciled`

### Marketplace (Phase 20) -- 12 events
`plugin:installed`, `plugin:uninstalled`, `plugin:enabled`, `plugin:disabled`, `plugin:configured`, `plugin:config_error`, `plugin:loaded`, `plugin:load_error`, `plugin:sandbox_violation`, `registry:refreshed`, `registry:fetch_error`, `marketplace:search`

### Workflow Builder (Phase 21) -- 11 events
`workflow:created`, `workflow:updated`, `workflow:deleted`, `workflow:execution_started`, `workflow:execution_completed`, `workflow:execution_failed`, `workflow:validation_failed`, `workflow:conversion_failed`, `workflow:node_started`, `workflow:node_completed`, `workflow:node_failed`

### Enterprise (Phase 22) -- 11 events
`credential:rotated`, `credential:rotation_failed`, `rbac:access_denied`, `user:created`, `user:role_changed`, `user:token_generated`, `sso:login`, `sso:callback`, `sso:state_invalid`, `sso:token_exchange_failed`, `audit:purged`

### Additional Categories
- **Access (Phase 7):** `channel:connected`, `channel:disconnected`, `channel:message_received`, `dashboard:client_connected`, `dashboard:client_disconnected`
- **Compatibility (Phase 8):** `compat:agent_imported`, `compat:agent_converted`, `a2a:request_received`, `a2a:request_sent`, `a2a:agent_registered`, `mcp:tool_called`, `mcp:tool_completed`
- **Transport (Phase 10b):** `transport:message_sent`, `transport:send_failed`, `transport:fallback`, `transport:metric_recorded`, `transport:location_swapped`, `transport:agent_removed`, `transport:metrics_pruned`
- **Tool Registry:** `tool:registered`, `tool:removed`, `tool_connector:registered`, `tool_connector:removed`, `skill:installed`
- **Data:** `dataset:uploaded`, `dataset:deleted`, `vector:indexed`, `vector:deleted`, `blueprint:created`, `blueprint:deployed`, `blueprint:deleted`, `prompt:created`, `prompt:updated`, `prompt:deleted`
- **Pivot-2 Quality:** `trilemma:degraded`, `trilemma:unsafe`, `contract:captured`, `contract:violation`, `goodhart:risk_elevated`
- **Commands:** `cmd:dispatched`, `cmd:failed`
- **Discovery:** `discovery:completed`, `discovery:failed`

## Event Persistence

Events are stored in the `events` table in SQLite. Query via `GET /api/system/events?limit=50` or `GET /api/traces`.

## Related

- [Dashboard Overview](../dashboard/overview.md) -- Events in the dashboard
- [API Endpoints](api-endpoints.md) -- SSE and WebSocket endpoints
- [Troubleshooting](../guides/troubleshooting.md) -- Using events to debug
