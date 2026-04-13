---
title: "A2A Protocol"
description: "How Qualixar OS implements Google's Agent-to-Agent protocol -- discovery, task delegation, inter-agent transport, and the message hub"
category: "protocols"
tags: ["a2a", "protocol", "agent-card", "discovery", "inter-agent", "transport"]
last_updated: "2026-04-13"
---

# A2A Protocol

Qualixar OS has native support for [Google's Agent-to-Agent (A2A) protocol](https://google.github.io/A2A), version 0.3. This is a major differentiator -- most agent frameworks treat inter-agent communication as an afterthought. In QOS, A2A is wired into the core transport layer.

A2A enables four capabilities:

1. **Discovery** -- External agents can find QOS and learn what it can do
2. **Inbound delegation** -- External agents can submit tasks to QOS
3. **Outbound delegation** -- QOS can discover and delegate tasks to external agents
4. **Internal routing** -- QOS agents communicate using A2A message format internally

## Agent Card Discovery

Every A2A-compatible agent exposes a JSON document at `/.well-known/agent-card` describing its capabilities. QOS serves its agent card from two locations:

**System routes** (`src/channels/system-routes.ts`, line 110):

```json
{
  "name": "Qualixar OS",
  "protocol": "a2a/v0.3",
  "capabilities": ["orchestration", "multi-agent", "quality-judges", "cost-routing"],
  "description": "Qualixar OS Universal Agent OS",
  "url": "http://localhost:3000"  // port depends on your --port setting, default 3000
}
```

**A2A server** (`src/compatibility/a2a-server.ts`, line 122):

The A2A server also mounts a `/.well-known/agent-card` route with dynamically registered capabilities. New capabilities can be added at runtime via `a2aServer.registerCapability('new-skill')`.

**Discovering QOS from another agent:**
```bash
curl http://localhost:3000/.well-known/agent-card
```

## A2A Server (Inbound)

The A2A server in `src/compatibility/a2a-server.ts` exposes three HTTP endpoints:

### GET /.well-known/agent-card

Returns the agent card (see above).

### POST /a2a/tasks/send

Submit a task to QOS. Returns `202 Accepted` immediately with a task ID. The task runs asynchronously via the orchestrator.

**Request:**
```json
{
  "prompt": "Analyze this codebase for security vulnerabilities",
  "taskType": "analysis",
  "maxBudgetUsd": 0.50,
  "timeoutMs": 120000
}
```

**Response (202):**
```json
{
  "id": "a2a-task-uuid",
  "status": "pending"
}
```

The server validates that `prompt` is a non-empty string. An optional `id` field can be passed to use a specific task ID. The task transitions through states: `pending` -> `running` -> `completed` or `failed`.

Task state is persisted to the QOS database so it survives server restarts.

### GET /a2a/tasks/:id/status

Poll for task completion.

**Response (running):**
```json
{
  "id": "a2a-task-uuid",
  "status": "running"
}
```

**Response (completed):**
```json
{
  "id": "a2a-task-uuid",
  "status": "completed",
  "output": "Found 3 critical vulnerabilities...",
  "costUsd": 0.12,
  "metadata": {}
}
```

## A2A Client (Outbound)

The A2A client in `src/compatibility/a2a-client.ts` enables QOS to discover and delegate tasks to external A2A agents.

### Discovering an External Agent

```typescript
const client = createA2AClient(eventBus, logger, db);

// Discover an agent at a URL
const card = await client.discover('http://external-agent:4000');
// Validates: name is non-empty, protocol is 'a2a/v0.3', capabilities is non-empty array
// Stores the agent in the a2a_agents DB table and in-memory cache
```

The client enforces strict protocol validation. The agent card **must** have:
- A non-empty `name`
- `protocol` set to exactly `'a2a/v0.3'`
- A non-empty `capabilities` array

Any violation throws an error. This prevents connecting to incompatible agents.

### Delegating a Task

```typescript
const result = await client.delegate('http://external-agent:4000', {
  prompt: 'Generate a test suite for this module',
  taskType: 'code',
  maxBudgetUsd: 0.25,
  timeoutMs: 60000,
});

// result.status: 'completed' | 'failed' | 'timeout'
// result.output: the agent's response
// result.costUsd: cost reported by the agent
```

The delegation flow:
1. POST to `/a2a/tasks/send` on the remote agent
2. Poll `/a2a/tasks/:id/status` every 500ms
3. Return when status is `completed` or `failed`
4. Return `timeout` if `timeoutMs` (default 60s) is exceeded

### Listing Known Agents

```typescript
const agents = client.listKnownAgents();
// Returns: { name, url, protocol, capabilities }[]
```

### Health Checking

```typescript
const isAlive = await client.healthCheck('http://external-agent:4000');
// Attempts discovery; returns true if successful, false otherwise
```

## A2A Transport (Inter-Agent)

The A2A transport in `src/agents/transport/a2a-transport.ts` handles HTTP-based communication between QOS internal agents and remote agents. It implements the `AgentTransport` interface and includes two reliability features:

### Circuit Breaker

Each remote agent has an independent circuit breaker with three states:

- **Closed** -- Normal operation, requests flow through
- **Open** -- After 5 consecutive failures, all requests are blocked for 60 seconds
- **Half-open** -- After the reset period, one request is allowed through as a test

Defined by constants: `CIRCUIT_BREAKER_THRESHOLD = 5`, `CIRCUIT_BREAKER_RESET_MS = 60_000`.

### Retry with Exponential Backoff

Failed requests are retried based on `TransportConfig.retryCount` (default: 2 retries). Each retry uses exponential backoff with 25% jitter:

```
delay = baseDelayMs * 2^attempt + random(0, 0.25 * baseDelayMs * 2^attempt)
```

### Latency Tracking

A sliding window of 20 latency measurements per agent is maintained for performance monitoring. The `getLatency()` method returns the average across all agents.

## A2A Message Hub

The A2A message hub in `src/agents/transport/a2a-msghub.ts` is a transparent wrapper around the internal MsgHub. It is a **drop-in replacement** -- topologies and agents don't know the difference. The wrapper:

1. Converts every `AgentMessage` to `A2ATaskMessage` format using the `MessageConverter`
2. Selects a transport via the `ProtocolRouter` (local or A2A)
3. For local agents: delegates to the underlying MsgHub unchanged
4. For remote agents: sends via A2A transport with automatic local fallback on failure
5. Emits `a2a:message_wrapped` events for observability

This means internal agents communicate using A2A message semantics without any code changes. The conversion is handled by the `MessageConverter` in `src/agents/transport/message-converter.ts`, which maps between internal message types (`task`, `result`, `feedback`, `handoff`, `broadcast`) and A2A types (`task`, `artifact`, `status`, `cancel`).

## Location Registry

The `LocationRegistry` (defined in `src/agents/transport/types.ts`) tracks where each agent lives:

- **local** -- In-process agent, communicates via MsgHub
- **remote** -- External agent, communicates via A2A HTTP

The registry supports:
- `register(entry)` / `remove(agentId)` -- Add/remove agents
- `lookup(agentId)` -- Find an agent's location and URL
- `isLocal(agentId)` -- Check if an agent is in-process
- `listRemote()` / `listAll()` -- List agents by location type
- `swapLocation(agentId, newLocation, url?)` -- Move an agent between local and remote
- `onLocationChange(handler)` -- Subscribe to location change events
- `discoverFromCard(card, url)` -- Create a location entry from an A2A agent card

## Agent Listing API

The quality routes in `src/channels/quality-routes.ts` expose an endpoint for listing agents available via A2A:

```
GET /api/a2a/agents
```

Returns all agents registered in the agent registry, useful for dashboard views and external tooling.

## Events

A2A operations emit events on the EventBus for observability:

| Event | Source | When |
|-------|--------|------|
| `a2a:agent_registered` | a2a-client | Agent discovered and stored |
| `a2a:request_sent` | a2a-client | Task delegated to external agent |
| `a2a:request_received` | a2a-server | Task received from external agent |
| `a2a:message_wrapped` | a2a-msghub | Internal message converted to A2A format |
| `a2a:remote_delivery` | a2a-msghub | Remote delivery succeeded or failed |
| `transport:message_sent` | a2a-transport | Message successfully sent via A2A |
| `transport:send_failed` | a2a-transport | Message delivery failed after retries |

## Related

- [Protocol Overview](./overview.md) -- MCP vs A2A comparison
- [MCP Protocol](./mcp.md) -- Tool access for IDEs and LLMs
