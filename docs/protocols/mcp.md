---
title: "MCP Protocol"
description: "How Qualixar OS implements the Model Context Protocol -- transports, tools, domain grouping, and connecting from any MCP client"
category: "protocols"
tags: ["mcp", "protocol", "stdio", "tools", "json-rpc"]
last_updated: "2026-04-13"
---

# MCP Protocol

Qualixar OS implements the [Model Context Protocol](https://modelcontextprotocol.io) to expose its orchestration engine as callable tools for any MCP-compatible client. This page covers the implementation details, all available tools, and how to connect.

## What is MCP?

MCP is a JSON-RPC 2.0 based standard for connecting LLM applications to external tools and data sources. An MCP server exposes:

- **Tools** -- Functions that LLM agents can call
- **Resources** -- Data that agents can read
- **Prompts** -- Reusable prompt templates

QOS implements the server side using `@modelcontextprotocol/sdk`. Any MCP client (Claude Code, Cursor, VS Code, Windsurf, Cline, or custom applications) can connect.

## Transport: stdio

QOS uses the `StdioServerTransport` from the MCP SDK. The client spawns QOS as a child process and communicates over stdin/stdout.

**Source:** `src/channels/mcp-server.ts` -- `startMcpServer()` function (line 377).

**Start command:**
```bash
npx qualixar-os --mcp
```

**How it works:**
1. The MCP client runs `npx qualixar-os --mcp`
2. QOS creates a `Server` instance with name `'qos'` and the current version
3. A `StdioServerTransport` connects stdin/stdout to the JSON-RPC handler
4. The client sends `tools/list` to discover available tools
5. The client sends `tools/call` with a tool name and arguments to invoke a tool
6. The connection persists for the lifetime of the client session

The server is created by `createMcpServer(orchestrator)` which registers two request handlers: one for `ListToolsRequestSchema` and one for `CallToolRequestSchema`.

## Individual Tools (25 tools)

The stdio MCP server exposes 25 individual tools, each with its own Zod-validated input schema. These are defined in `buildToolDefs()` in `src/channels/mcp-server.ts`.

### Task Management

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `run_task` | Submit a new task to the orchestrator | `prompt` (string) |
| `get_status` | Get the status of a task | `taskId` (string) |
| `list_tasks` | List all tasks (most recent 50) | -- |
| `pause_task` | Pause a running task | `taskId` (string) |
| `resume_task` | Resume a paused task | `taskId` (string) |
| `cancel_task` | Cancel a task | `taskId` (string) |
| `redirect_task` | Change a task's prompt mid-execution | `taskId`, `newPrompt` |

`run_task` also accepts optional parameters: `type` (code/research/analysis/creative/custom), `mode` (companion/power), `budget_usd`, `topology`, and `simulate` (boolean for dry-run).

### Agents and Swarm

| Tool | Description |
|------|-------------|
| `list_agents` | List all registered agents |
| `list_topologies` | List available swarm topologies |
| `get_forge_designs` | Get Forge team designs (optional `taskType` filter) |

### Quality and Memory

| Tool | Description |
|------|-------------|
| `get_judge_results` | Get judge evaluation results (optional `taskId`) |
| `search_memory` | Search SLM-Lite memory (`query`, optional `layer` and `limit`) |
| `get_rl_stats` | Get reinforcement learning training statistics |

### System

| Tool | Description |
|------|-------------|
| `get_cost` | Get cost summary (optional `taskId`) |
| `get_system_config` | Get the current system configuration |

### Chat and Data (Phase 14-16)

| Tool | Description |
|------|-------------|
| `send_chat_message` | Send a message in a chat conversation |
| `list_connectors` | List configured data connectors |
| `test_connector` | Test a connector connection |
| `list_datasets` | List available datasets |
| `preview_dataset` | Preview rows from a dataset |
| `search_vectors` | Search the vector store |
| `list_blueprints` | List agent blueprints |
| `deploy_blueprint` | Deploy a blueprint |
| `list_prompts` | List prompt templates |
| `create_prompt` | Create a new prompt template |

## Domain-Grouped Tools (7 tools)

For clients where token budget matters, the MCP adapter in `src/commands/adapters/mcp-adapter.ts` groups related operations into 6 domain tools plus 1 standalone tool. Each domain tool uses a discriminated union on an `action` parameter.

**Token savings:** 6 grouped tools use approximately 2,400 tokens versus approximately 7,000 tokens for 25 individual tools.

| Domain Tool | Actions | Tier |
|-------------|---------|------|
| `qos_task` | `run`, `status`, `output`, `cancel`, `pause`, `resume`, `steer`, `list` | core |
| `qos_system` | `config_get`, `config_set`, `models_list`, `cost_summary` | core |
| `qos_agents` | `list`, `inspect`, `forge_design`, `forge_topologies` | extended |
| `qos_context` | `add`, `scan`, `list`, `set_workspace`, `workspace_files` | extended |
| `qos_quality` | `judge_results`, `memory_search`, `memory_store` | full |
| `qos_workspace` | `set`, `files`, `import_agent` | full |
| `qos_workflow_create` | (standalone -- creates a workflow) | full |

### Tier System

The tier is controlled by the `QOS_TIER` environment variable or passed directly to `registerMcpTools()`:

- **core** -- 2 tools: `qos_task`, `qos_system`
- **extended** -- 4 tools: core + `qos_agents`, `qos_context`
- **full** -- All 7 tools (default)

## Connecting from Any MCP Client

### Claude Code / Cursor / Windsurf

Add to your MCP configuration (e.g., `~/.claude.json`):

```json
{
  "mcpServers": {
    "qualixar-os": {
      "command": "npx",
      "args": ["qualixar-os", "--mcp"]
    }
  }
}
```

### Node.js (Custom Client)

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['qualixar-os', '--mcp'],
});

const client = new Client({ name: 'my-app', version: '1.0.0' }, {});
await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool('run_task', {
  prompt: 'Review my code for bugs',
  mode: 'power',
});
```

### Python (Custom Client)

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

- **API key:** Set `QOS_API_KEY` to require authentication on HTTP/WebSocket endpoints. Health checks (`/api/health`, `/api/ready`) are exempt.
- **Rate limiting:** 2,000 requests per 60-second window per IP on API endpoints.
- **Body size limit:** 1MB maximum on API request bodies.
- **Timing-safe auth:** API key comparison uses `timingSafeEqual` to prevent timing attacks.

## Related

- [Protocol Overview](./overview.md) -- MCP vs A2A comparison
- [A2A Protocol](./a2a.md) -- Agent-to-agent communication
- [IDE Integration](../ide-integration/mcp-protocol.md) -- Transport details (SSE, WebSocket)
