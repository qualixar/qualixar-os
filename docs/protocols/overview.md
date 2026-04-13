---
title: "Protocol Overview"
description: "Qualixar OS supports two standard protocols: MCP for tool access and A2A for agent-to-agent communication"
category: "protocols"
tags: ["mcp", "a2a", "protocol", "interoperability"]
last_updated: "2026-04-13"
---

# Protocol Overview

Qualixar OS supports two standard protocols that serve different but complementary purposes. Understanding when to use each is key to getting the most out of QOS.

## Two Protocols, Two Purposes

### MCP (Model Context Protocol)

MCP is a JSON-RPC 2.0 based standard created by Anthropic for connecting LLM applications to external tools and data sources. In QOS, MCP is the **tool access layer** -- it lets IDEs and AI coding assistants call QOS functions like `run_task`, `search_memory`, or `list_agents`.

**When to use MCP:**

- Connecting QOS to an IDE (Claude Code, Cursor, VS Code, Windsurf, Cline)
- Exposing QOS orchestration as callable tools for an LLM
- Building custom clients that need to invoke QOS operations
- Any scenario where a **human or LLM** needs to **call QOS functions**

**Implementation:** `src/channels/mcp-server.ts` (stdio transport, 25 individual tools) and `src/commands/adapters/mcp-adapter.ts` (6 domain-grouped tools for token efficiency).

### A2A (Agent-to-Agent Protocol)

A2A is Google's open protocol for agent-to-agent communication. In QOS, A2A is the **inter-agent communication layer** -- it lets agents discover each other, delegate tasks, and exchange results without human intervention.

**When to use A2A:**

- Connecting QOS to other agent frameworks (LangGraph, CrewAI, AutoGen)
- Building multi-system agent workflows where agents in different processes need to collaborate
- Exposing QOS agents as discoverable services on your network
- Any scenario where **agents** need to **talk to agents**

**Implementation:** `src/compatibility/a2a-server.ts` (inbound), `src/compatibility/a2a-client.ts` (outbound), `src/agents/transport/a2a-transport.ts` (inter-agent transport with circuit breaker), `src/agents/transport/a2a-msghub.ts` (transparent A2A wrapper for the internal message hub).

## How They Complement Each Other

```
                  MCP                          A2A
            (Tool Access)              (Agent Communication)
                 |                              |
    IDE / LLM Client                   External Agent System
         |                                      |
    [JSON-RPC 2.0]                    [HTTP + Agent Cards]
         |                                      |
    QOS MCP Server                     QOS A2A Server
         |                                      |
         +----------> Orchestrator <------------+
                          |
                    Internal Agents
                    (MsgHub + A2A)
```

An IDE calls QOS via **MCP** to submit a task. The orchestrator assigns that task to internal agents. Those agents communicate internally using A2A message format via the MsgHub. If the task requires capabilities from an external agent, QOS discovers and delegates to it via **A2A**.

The two protocols never conflict. MCP handles the **vertical** connection (IDE down to QOS). A2A handles the **horizontal** connection (QOS across to other agents).

## Protocol Versions

| Protocol | Version | Specification |
|----------|---------|---------------|
| MCP | Latest | [modelcontextprotocol.io](https://modelcontextprotocol.io) |
| A2A | v0.3 | [google.github.io/A2A](https://google.github.io/A2A) |

QOS validates the A2A protocol version strictly -- agent cards must declare `protocol: 'a2a/v0.3'` or discovery will fail (enforced in `src/compatibility/a2a-client.ts`, line 254).

## Quick Comparison

| Dimension | MCP | A2A |
|-----------|-----|-----|
| Purpose | Tool access for LLMs/IDEs | Agent-to-agent communication |
| Wire format | JSON-RPC 2.0 | HTTP REST + JSON |
| Discovery | Client configuration | `/.well-known/agent-card` endpoint |
| Direction | Client calls server | Bidirectional (client + server) |
| Transport | stdio, SSE, WebSocket | HTTP |
| Authentication | `QOS_API_KEY` env var | Per-agent (future) |
| Statefulness | Stateless tool calls | Stateful task lifecycle |

## Next Steps

- [MCP Protocol Details](./mcp.md) -- Full MCP implementation, all 25 tools, connecting from any client
- [A2A Protocol Details](./a2a.md) -- A2A server/client, agent card discovery, inter-agent transport
