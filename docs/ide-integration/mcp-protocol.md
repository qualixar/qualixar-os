---
title: "MCP Protocol Implementation"
description: "How Qualixar OS implements the Model Context Protocol — transport types, tool listing, SSE streaming, and connecting from any MCP client"
category: "ide-integration"
tags: ["mcp", "protocol", "stdio", "sse", "websocket", "transport", "tools"]
last_updated: "2026-04-13"
---

# MCP Protocol Implementation

Qualixar OS implements the Model Context Protocol (MCP) to expose its orchestration capabilities to any MCP-compatible client. This document covers the protocol details, transport types, and how to connect from any client.

## What is MCP?

The Model Context Protocol is a JSON-RPC 2.0 based standard for connecting LLM applications to external tools and data sources. An MCP server exposes:

- **Tools** — Functions that LLM agents can call
- **Resources** — Data that agents can read
- **Prompts** — Reusable prompt templates

QOS implements the server side. Any MCP client (Claude Code, Cursor, VS Code extensions, custom applications) can connect and use QOS tools.

## Transport Types

QOS supports three transport mechanisms:

### stdio (Primary)

The default transport. The MCP client spawns QOS as a child process and communicates over stdin/stdout.

**Start command:**
```bash
npx qualixar-os --mcp
```

**How it works:**
1. The MCP client runs `npx qualixar-os --mcp`
2. QOS starts in MCP mode, creating a `StdioServerTransport`
3. The client sends JSON-RPC requests to QOS stdin
4. QOS writes JSON-RPC responses to stdout
5. The connection persists for the lifetime of the client session

This is the transport used by Claude Code, Cursor, Windsurf, Cline, and most MCP clients.

**Configuration in `server.json`:**
```json
{
  "packages": [
    {
      "type": "npm",
      "package": "qualixar-os",
      "transport": "stdio"
    }
  ]
}
```

### SSE (Server-Sent Events)

Available when the QOS HTTP server is running. Provides a read-only event stream.

**Endpoint:**
```
GET http://localhost:3000/api/sse
```

**How it works:**
1. Client opens an SSE connection to `/api/sse`
2. QOS sends an initial `connected` event with a `clientId`
3. All EventBus events are broadcast to connected SSE clients
4. Events are formatted as `event: <type>\ndata: <json>\n\n`

**Event types include:**
- `task:started`, `task:completed`, `task:failed`
- `agent:started`, `agent:completed`
- `cost:updated`
- `forge:designed`

**Use case:** Monitoring dashboards, CI/CD integrations, external logging systems.

### WebSocket

Bidirectional communication channel. Supports both event streaming and command dispatch.

**Endpoint:**
```
ws://localhost:3000/ws
```

**Authentication:** If `QOS_API_KEY` is set, pass it as a query parameter:
```
ws://localhost:3000/ws?token=your-api-key
```

**Incoming events:** All EventBus events are relayed as JSON messages:
```json
{"type": "task:completed", "payload": {"taskId": "abc123", "status": "completed"}}
```

**Outgoing commands:** Send JSON to control tasks:
```json
{"type": "task:pause", "taskId": "abc123"}
{"type": "task:resume", "taskId": "abc123"}
{"type": "task:cancel", "taskId": "abc123"}
```

**JSON-RPC 2.0 (UCP):** The WebSocket also accepts JSON-RPC 2.0 messages for the Universal Command Protocol:
```json
{"jsonrpc": "2.0", "method": "run", "params": {"prompt": "Hello"}, "id": 1}
```

**Keepalive:** The server pings all connected clients every 30 seconds.

## Tool Registration

QOS registers tools using the `@modelcontextprotocol/sdk` package. The tool listing is served via the `tools/list` JSON-RPC method.

Each tool has:
- `name` — Unique identifier (e.g., `run_task`)
- `description` — Human-readable explanation
- `inputSchema` — JSON Schema for parameters (converted from Zod schemas)

### Individual Tools (stdio transport)

The stdio MCP server exposes 25 individual tools. See [MCP Setup](../claude-cli/mcp-setup.md) for the full list.

### Domain-Grouped Tools (MCP adapter)

For clients where token budget matters, the MCP adapter groups tools into 6 domains using discriminated unions on the `action` parameter:

| Domain Tool | Actions |
|-------------|---------|
| `qos_task` | `run`, `status`, `output`, `cancel`, `pause`, `resume`, `steer`, `list` |
| `qos_agents` | `list`, `inspect`, `forge_design`, `forge_topologies` |
| `qos_system` | `config_get`, `config_set`, `models_list`, `cost_summary` |
| `qos_context` | `add`, `scan`, `list`, `set_workspace`, `workspace_files` |
| `qos_quality` | `judge_results`, `memory_search`, `memory_store` |
| `qos_workspace` | `set`, `files`, `import_agent` |

This reduces token usage from ~7,000 tokens (17 individual tools) to ~2,400 tokens (6 grouped tools).

## Connecting from a Custom Client

### Node.js

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['qualixar-os', '--mcp'],
});

const client = new Client({ name: 'my-app', version: '1.0.0' }, {});
await client.connect(transport);

// List tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool('run_task', {
  prompt: 'Review my code for bugs',
  mode: 'power',
});
```

### Python

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server_params = StdioServerParameters(
    command="npx",
    args=["qualixar-os", "--mcp"],
)

async with stdio_client(server_params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
        result = await session.call_tool("run_task", {
            "prompt": "Analyze my codebase",
            "mode": "power",
        })
```

## Security

- **API key:** Set `QOS_API_KEY` to require authentication on all API and WebSocket endpoints. Health checks (`/api/health`, `/api/ready`) are exempt.
- **CSRF protection:** State-changing HTTP requests require an `Origin` or `Referer` header matching the allowed origin, or an `Authorization` header.
- **Rate limiting:** 2,000 requests per 60-second window per IP on API endpoints.
- **Body size limit:** 1MB maximum on API request bodies.
- **Timing-safe auth:** API key comparison uses `timingSafeEqual` to prevent timing attacks.

## Related

- [IDE Integration Overview](./overview.md) — All supported IDEs
- [Claude Code MCP Setup](../claude-cli/mcp-setup.md) — Registering QOS in Claude Code
- [MCP Integration Guide](../guides/mcp-integration.md) — Connecting external MCP servers to QOS
- [API Endpoints Reference](../reference/api-endpoints.md) — Full HTTP API documentation
