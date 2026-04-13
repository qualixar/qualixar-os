/**
 * Qualixar OS Phase 8b -- McpConsumer Tests
 * TDD: RED phase -- tests written before implementation.
 *
 * Mocks: MCP SDK Client + StdioClientTransport (never spawn real subprocesses).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventBus } from '../../src/events/event-bus.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Mock MCP SDK before any imports that depend on it
// ---------------------------------------------------------------------------

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    { name: 'web_search', description: 'Search the web', inputSchema: { type: 'object' } },
    { name: 'file_read', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
  ],
});
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'search result: found 5 items' }],
});
const mockOnClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: class MockClient {
      connect = mockConnect;
      close = mockClose;
      listTools = mockListTools;
      callTool = mockCallTool;
      onclose: (() => void) | undefined = undefined;
    },
  };
});

const mockTransportClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: class MockTransport {
      close = mockTransportClose;
    },
  };
});

import { McpConsumer, createMcpConsumer } from '../../src/compatibility/mcp-consumer.js';
import type { McpServerConfig, McpConnection } from '../../src/compatibility/mcp-consumer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

const testConfig: McpServerConfig = {
  name: 'test-server',
  command: 'npx',
  args: ['-y', 'test-mcp-server'],
  env: { API_KEY: 'test-key' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('McpConsumer', () => {
  let consumer: McpConsumer;
  let eventBus: EventBus;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createMockEventBus();
    logger = createMockLogger();
    consumer = createMcpConsumer(eventBus, logger);
  });

  // ---- Factory ----

  describe('createMcpConsumer()', () => {
    it('creates a McpConsumer instance', () => {
      expect(consumer).toBeDefined();
      expect(typeof consumer.connect).toBe('function');
      expect(typeof consumer.disconnect).toBe('function');
      expect(typeof consumer.listTools).toBe('function');
      expect(typeof consumer.callTool).toBe('function');
      expect(typeof consumer.getConnections).toBe('function');
      expect(typeof consumer.disconnectAll).toBe('function');
    });
  });

  // ---- connect() ----

  describe('connect()', () => {
    it('returns a McpConnection with connected status', async () => {
      const connection = await consumer.connect(testConfig);

      expect(connection.id).toBeTruthy();
      expect(connection.name).toBe('test-server');
      expect(connection.status).toBe('connected');
    });

    it('lists tools from the connected server', async () => {
      const connection = await consumer.connect(testConfig);

      expect(connection.tools).toHaveLength(2);
      expect(connection.tools[0].name).toBe('web_search');
      expect(connection.tools[1].name).toBe('file_read');
    });

    it('maps MCP tools to ToolSpec format', async () => {
      const connection = await consumer.connect(testConfig);

      expect(connection.tools[0]).toEqual({
        name: 'web_search',
        description: 'Search the web',
        parameters: { type: 'object' },
      });
    });

    it('emits mcp:tool_called event on connect', async () => {
      await consumer.connect(testConfig);

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'channel:connected',
          source: 'mcp-consumer',
          payload: expect.objectContaining({ serverName: 'test-server' }),
        }),
      );
    });

    it('throws when connection fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(consumer.connect(testConfig)).rejects.toThrow('Connection refused');
    });
  });

  // ---- disconnect() ----

  describe('disconnect()', () => {
    it('disconnects and removes the connection', async () => {
      const connection = await consumer.connect(testConfig);
      await consumer.disconnect(connection.id);

      const connections = consumer.getConnections();
      expect(connections).toHaveLength(0);
    });

    it('throws when connection id is unknown', async () => {
      await expect(consumer.disconnect('unknown-id')).rejects.toThrow('not found');
    });
  });

  // ---- listTools() ----

  describe('listTools()', () => {
    it('refreshes and returns tool list', async () => {
      const connection = await consumer.connect(testConfig);
      const tools = await consumer.listTools(connection.id);

      expect(tools).toHaveLength(2);
      expect(mockListTools).toHaveBeenCalledTimes(2); // once on connect, once on listTools
    });

    it('throws for unknown connection', async () => {
      await expect(consumer.listTools('bad-id')).rejects.toThrow('not found');
    });
  });

  // ---- callTool() ----

  describe('callTool()', () => {
    it('calls a tool and returns the result string', async () => {
      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'web_search', { query: 'test' });

      expect(result).toBe('search result: found 5 items');
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'web_search',
        arguments: { query: 'test' },
      });
    });

    it('emits mcp:tool_called event', async () => {
      const connection = await consumer.connect(testConfig);
      await consumer.callTool(connection.id, 'web_search', { query: 'test' });

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mcp:tool_called',
          source: 'mcp-consumer',
          payload: expect.objectContaining({
            connectionId: connection.id,
            toolName: 'web_search',
          }),
        }),
      );
    });

    it('emits mcp:tool_completed event after successful call', async () => {
      const connection = await consumer.connect(testConfig);
      await consumer.callTool(connection.id, 'web_search', {});

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mcp:tool_completed',
          source: 'mcp-consumer',
        }),
      );
    });

    it('joins multiple text content items', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Part 1.' },
          { type: 'text', text: ' Part 2.' },
          { type: 'image', data: 'abc' },
        ],
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'multi', {});

      expect(result).toBe('Part 1. Part 2.');
    });

    it('throws for unknown connection', async () => {
      await expect(consumer.callTool('bad-id', 'tool', {})).rejects.toThrow('not found');
    });
  });

  // ---- getConnections() ----

  describe('getConnections()', () => {
    it('returns empty array when no connections', () => {
      const connections = consumer.getConnections();
      expect(connections).toEqual([]);
    });

    it('returns all active connections', async () => {
      await consumer.connect(testConfig);
      await consumer.connect({ ...testConfig, name: 'server-2' });

      const connections = consumer.getConnections();
      expect(connections).toHaveLength(2);
    });

    it('does not expose internal client/transport fields', async () => {
      await consumer.connect(testConfig);
      const connections = consumer.getConnections();

      const conn = connections[0];
      expect(conn).toHaveProperty('id');
      expect(conn).toHaveProperty('name');
      expect(conn).toHaveProperty('status');
      expect(conn).toHaveProperty('tools');
      expect(conn).not.toHaveProperty('client');
      expect(conn).not.toHaveProperty('transport');
    });
  });

  // ---- disconnectAll() ----

  describe('disconnectAll()', () => {
    it('disconnects all connections', async () => {
      await consumer.connect(testConfig);
      await consumer.connect({ ...testConfig, name: 'server-2' });

      await consumer.disconnectAll();

      expect(consumer.getConnections()).toHaveLength(0);
    });

    it('logs warnings for individual disconnect failures', async () => {
      await consumer.connect(testConfig);
      mockClose.mockRejectedValueOnce(new Error('close error'));

      await consumer.disconnectAll(); // should not throw
      expect(logger.warn).toHaveBeenCalled();
    });

    it('works with zero connections', async () => {
      await consumer.disconnectAll(); // should not throw
    });
  });

  // ---- Branch coverage: _mapTools edge cases ----

  describe('_mapTools branch coverage', () => {
    it('handles tools with missing description (defaults to empty string)', async () => {
      mockListTools.mockResolvedValueOnce({
        tools: [
          { name: 'no_desc_tool' },
        ],
      });

      const connection = await consumer.connect(testConfig);

      expect(connection.tools[0].name).toBe('no_desc_tool');
      expect(connection.tools[0].description).toBe('');
    });

    it('handles tools with missing inputSchema (defaults to empty object)', async () => {
      mockListTools.mockResolvedValueOnce({
        tools: [
          { name: 'no_schema_tool', description: 'A tool without schema' },
        ],
      });

      const connection = await consumer.connect(testConfig);

      expect(connection.tools[0].parameters).toEqual({});
    });

    it('handles tools with both description and inputSchema missing', async () => {
      mockListTools.mockResolvedValueOnce({
        tools: [
          { name: 'bare_tool' },
        ],
      });

      const connection = await consumer.connect(testConfig);

      expect(connection.tools[0].name).toBe('bare_tool');
      expect(connection.tools[0].description).toBe('');
      expect(connection.tools[0].parameters).toEqual({});
    });
  });

  // ---- Branch coverage: connect() with optional args/env ----

  describe('connect() optional config fields', () => {
    it('connects with no args or env provided', async () => {
      const minimalConfig: McpServerConfig = {
        name: 'minimal-server',
        command: 'node',
      };

      const connection = await consumer.connect(minimalConfig);

      expect(connection.status).toBe('connected');
      expect(connection.name).toBe('minimal-server');
    });

    it('connects with empty args array', async () => {
      const config: McpServerConfig = {
        name: 'empty-args-server',
        command: 'node',
        args: [],
      };

      const connection = await consumer.connect(config);

      expect(connection.status).toBe('connected');
    });
  });

  // ---- Branch coverage: callTool with empty/non-text content ----

  describe('callTool content edge cases', () => {
    it('returns empty string when content has no text items', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [
          { type: 'image', data: 'base64data' },
          { type: 'resource', uri: 'file:///test.txt' },
        ],
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'image_tool', {});

      expect(result).toBe('');
    });

    it('returns empty string when content is empty array', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [],
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'empty_tool', {});

      expect(result).toBe('');
    });

    it('returns empty string when content is not an array', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: null,
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'null_content', {});

      expect(result).toBe('');
    });

    it('skips content items that are not objects', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [
          'just a string',
          42,
          null,
          { type: 'text', text: 'real text' },
        ],
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'mixed_content', {});

      expect(result).toBe('real text');
    });

    it('skips content items with type but no text field', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [
          { type: 'text' },
          { type: 'text', text: 'valid' },
        ],
      });

      const connection = await consumer.connect(testConfig);
      const result = await consumer.callTool(connection.id, 'partial_text', {});

      expect(result).toBe('valid');
    });
  });
});
