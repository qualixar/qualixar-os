// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8b -- MCP Consumer
 *
 * Connect to external MCP servers via stdio, list tools, call tools.
 * Each connection spawns a child process via StdioClientTransport.
 *
 * Hard Rules:
 *   - Never spawn real subprocesses in tests (mock Client + Transport)
 *   - readonly on all interface properties
 *   - ESM .js extensions on local imports
 *   - No silent error swallowing
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'node:crypto';
import type { ToolSpec } from '../types/common.js';
import type { EventBus } from '../events/event-bus.js';
import type { Logger } from 'pino';
import { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
}

export interface McpConnection {
  readonly id: string;
  readonly name: string;
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly tools: readonly ToolSpec[];
}

// ---------------------------------------------------------------------------
// Internal state per connection
// ---------------------------------------------------------------------------

interface InternalConnection {
  readonly id: string;
  readonly name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: ToolSpec[];
  readonly client: InstanceType<typeof Client>;
  readonly transport: InstanceType<typeof StdioClientTransport>;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface McpConsumer {
  connect(serverConfig: McpServerConfig): Promise<McpConnection>;
  disconnect(connectionId: string): Promise<void>;
  listTools(connectionId: string): Promise<readonly ToolSpec[]>;
  callTool(connectionId: string, toolName: string, args: Record<string, unknown>): Promise<string>;
  getConnections(): readonly McpConnection[];
  disconnectAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class McpConsumerImpl implements McpConsumer {
  private readonly _connections: Map<string, InternalConnection> = new Map();
  private readonly _eventBus: EventBus;
  private readonly _logger: Logger;

  constructor(eventBus: EventBus, logger: Logger) {
    this._eventBus = eventBus;
    this._logger = logger;
  }

  async connect(serverConfig: McpServerConfig): Promise<McpConnection> {
    const id = randomUUID();

    // 1. Create transport
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ? [...serverConfig.args] : [],
      env: serverConfig.env ? { ...serverConfig.env } : undefined,
    });

    // 2. Create client
    const client = new Client(
      { name: 'qos-mcp-consumer', version: VERSION },
      { capabilities: {} },
    );

    // 3. Connect (throws on failure -- no swallowing)
    await client.connect(transport);

    // 4. List tools
    const toolsResponse = await client.listTools();
    const tools = this._mapTools(toolsResponse.tools);

    // 5. Store connection
    const conn: InternalConnection = {
      id,
      name: serverConfig.name,
      status: 'connected',
      tools,
      client,
      transport,
    };
    this._connections.set(id, conn);

    // 6. Emit connected event
    this._eventBus.emit({
      type: 'channel:connected',
      payload: { connectionId: id, serverName: serverConfig.name, toolCount: tools.length },
      source: 'mcp-consumer',
    });

    this._logger.info({ connectionId: id, server: serverConfig.name }, 'MCP server connected');

    return this._toPublicConnection(conn);
  }

  async disconnect(connectionId: string): Promise<void> {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      throw new Error(`MCP connection '${connectionId}' not found`);
    }

    await conn.client.close();
    this._connections.delete(connectionId);

    this._eventBus.emit({
      type: 'channel:disconnected',
      payload: { connectionId, serverName: conn.name },
      source: 'mcp-consumer',
    });

    this._logger.info({ connectionId, server: conn.name }, 'MCP server disconnected');
  }

  async listTools(connectionId: string): Promise<readonly ToolSpec[]> {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      throw new Error(`MCP connection '${connectionId}' not found`);
    }

    // Refresh tools from server
    const toolsResponse = await conn.client.listTools();
    const tools = this._mapTools(toolsResponse.tools);
    conn.tools = tools;

    return tools;
  }

  async callTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      throw new Error(`MCP connection '${connectionId}' not found`);
    }

    // Emit tool_called event
    this._eventBus.emit({
      type: 'mcp:tool_called',
      payload: { connectionId, toolName, serverName: conn.name },
      source: 'mcp-consumer',
    });

    // Call the tool
    const result = await conn.client.callTool({
      name: toolName,
      arguments: args,
    });

    // Extract text content items and join
    const textParts: string[] = [];
    if (Array.isArray(result.content)) {
      for (const item of result.content) {
        if (
          typeof item === 'object' &&
          item !== null &&
          'type' in item &&
          item.type === 'text' &&
          'text' in item
        ) {
          textParts.push(String(item.text));
        }
      }
    }

    const output = textParts.join('');

    // Emit tool_completed event
    this._eventBus.emit({
      type: 'mcp:tool_completed',
      payload: { connectionId, toolName, outputLength: output.length },
      source: 'mcp-consumer',
    });

    return output;
  }

  getConnections(): readonly McpConnection[] {
    return Array.from(this._connections.values()).map((c) =>
      this._toPublicConnection(c),
    );
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this._connections.keys());
    for (const id of ids) {
      try {
        await this.disconnect(id);
      } catch (err) {
        this._logger.warn({ connectionId: id, err }, 'Failed to disconnect MCP server');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _mapTools(
    mcpTools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  ): ToolSpec[] {
    return mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  }

  private _toPublicConnection(conn: InternalConnection): McpConnection {
    return {
      id: conn.id,
      name: conn.name,
      status: conn.status,
      tools: [...conn.tools],
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpConsumer(eventBus: EventBus, logger: Logger): McpConsumer {
  return new McpConsumerImpl(eventBus, logger);
}
