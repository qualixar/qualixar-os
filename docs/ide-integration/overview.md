---
title: "IDE Integration Overview"
description: "How Qualixar OS works with different IDEs — Claude Code, VS Code, Cursor, Windsurf, Cline, and any MCP-compatible editor"
category: "ide-integration"
tags: ["ide", "claude-code", "vscode", "cursor", "windsurf", "cline", "mcp"]
last_updated: "2026-04-13"
---

# IDE Integration Overview

Qualixar OS connects to any IDE that supports the Model Context Protocol (MCP). The integration level varies by editor: Claude Code gets a native plugin with slash commands and agents, while other editors connect via the MCP server for tool access.

## Integration Matrix

| IDE | Integration Type | Install Command | Features |
|-----|-----------------|-----------------|----------|
| **Claude Code** | Native plugin + MCP | `npm i -g qos-claude-code` + `claude mcp add qualixar-os -- npx qualixar-os --mcp` | Slash commands, agent, skill, full MCP tools |
| **VS Code** | MCP extension | `npx qualixar-os --mcp` | MCP tools via Copilot Chat or MCP extensions |
| **Cursor** | MCP server | `npx qualixar-os --mcp` | MCP tools in Composer |
| **Windsurf** | MCP server | `npx qualixar-os --mcp` | MCP tools in Cascade |
| **Cline** | MCP server | `npx qualixar-os --mcp` | MCP tools in Cline chat |
| **Any MCP client** | MCP server | `npx qualixar-os --mcp` | All 25 MCP tools |

## Claude Code (Native Plugin)

Claude Code has the deepest integration. The `qos-claude-code` plugin provides:

- **5 slash commands:** `/qos-task`, `/qos-forge`, `/qos-status`, `/qos-workspace`, `/qos-marketplace`
- **Orchestrator agent** running on Sonnet with file access tools
- **Task orchestrator skill** for structured API interaction
- **MCP bridge** exposing all 25 QOS tools

See the full [Claude Code integration guide](../claude-cli/overview.md).

## VS Code

Add QOS as an MCP server in your VS Code settings. The exact configuration depends on which MCP extension you use. The MCP server command is always:

```
npx qualixar-os --mcp
```

QOS tools appear alongside other MCP tools in your AI chat panel.

## Cursor

Cursor supports MCP servers in its Composer. Add to your Cursor MCP configuration:

```json
{
  "qualixar-os": {
    "command": "npx",
    "args": ["qualixar-os", "--mcp"]
  }
}
```

Tools available: `qos_task`, `qos_agents`, `qos_system`, `qos_context`, `qos_quality`, `qos_workspace` (domain-grouped), plus all 25 individual tools.

## Windsurf

Windsurf supports MCP through its Cascade AI. Register QOS with the same command:

```
npx qualixar-os --mcp
```

## Cline

Cline (VS Code extension) supports MCP natively. Add QOS as an MCP server in Cline's settings panel.

## Universal MCP Connection

Any tool or editor that speaks MCP can connect to QOS. The server exposes:
- **stdio transport** — `npx qualixar-os --mcp` (default, used by all editors)
- **SSE transport** — `http://localhost:3000/api/sse` (when QOS HTTP server is running)
- **WebSocket** — `ws://localhost:3000/ws` (for real-time event streaming)

See [MCP Protocol Details](./mcp-protocol.md) for transport specifics.

## Registry Listings

QOS is listed on multiple MCP server registries for one-click installation:

- **Smithery** — `qualixar-os` in the orchestration category
- **Glama** — Listed as "Qualixar OS --- Universal Agent OS" under developer-tools
- **MCP Marketplace** — Available with install commands for Claude Code, Cursor, VS Code, Windsurf, and Cline

## Related

- [Claude Code Overview](../claude-cli/overview.md) — Full Claude Code integration
- [MCP Protocol Details](./mcp-protocol.md) — Transport types and tool listing
- [MCP Integration Guide](../guides/mcp-integration.md) — Connecting MCP servers to QOS
