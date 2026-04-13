/**
 * Phase 10 -- MCP Adapter Tests
 * Source: Phase 10 LLD Section 2.14
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { zodToMcpSchema, registerMcpTools } from '../../../src/commands/adapters/mcp-adapter.js';
import type { CommandRouter } from '../../../src/commands/router.js';

// ---------------------------------------------------------------------------
// Mock Router
// ---------------------------------------------------------------------------

function createMockRouter(): CommandRouter {
  return {
    dispatch: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
    list: vi.fn().mockReturnValue([]),
    register: vi.fn(),
    dispatchStream: vi.fn(),
    getDefinition: vi.fn(),
    getCategories: vi.fn(),
    size: 0,
  } as unknown as CommandRouter;
}

// ---------------------------------------------------------------------------
// Mock MCP Server
// ---------------------------------------------------------------------------

function createMockServer() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    setRequestHandler: vi.fn((schema: { method: string }, handler: (...args: unknown[]) => unknown) => {
      handlers.set(schema.method, handler);
    }),
    _handlers: handlers,
  };
}

// ---------------------------------------------------------------------------
// zodToMcpSchema Tests
// ---------------------------------------------------------------------------

describe('zodToMcpSchema', () => {
  it('converts a simple Zod object to JSON Schema without $schema key', () => {
    const schema = z.object({ name: z.string(), age: z.number().optional() });
    const result = zodToMcpSchema(schema);
    expect(result).not.toHaveProperty('$schema');
    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
    expect((result.properties as Record<string, unknown>).name).toBeDefined();
  });

  it('includes required array for non-optional fields', () => {
    const schema = z.object({ id: z.string(), label: z.string().optional() });
    const result = zodToMcpSchema(schema);
    expect(result.required).toContain('id');
    // label is optional, should NOT be in required
    if (Array.isArray(result.required)) {
      expect(result.required).not.toContain('label');
    }
  });

  it('handles enum types', () => {
    const schema = z.object({ type: z.enum(['a', 'b', 'c']) });
    const result = zodToMcpSchema(schema);
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.type.enum).toEqual(['a', 'b', 'c']);
  });

  it('handles empty object schema', () => {
    const schema = z.object({});
    const result = zodToMcpSchema(schema);
    expect(result.type).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// registerMcpTools Tests
// ---------------------------------------------------------------------------

describe('registerMcpTools', () => {
  let server: ReturnType<typeof createMockServer>;
  let router: CommandRouter;

  beforeEach(() => {
    server = createMockServer();
    router = createMockRouter();
  });

  it('registers tools for full tier by default', () => {
    registerMcpTools(server as never, router);
    // 6 domain tools + 1 standalone (qos_workflow_create) = 7
    expect(server.setRequestHandler).toHaveBeenCalledTimes(7);
  });

  it('registers only core tools plus standalone for core tier', () => {
    registerMcpTools(server as never, router, 'core');
    // 2 domain tools + 1 standalone = 3
    expect(server.setRequestHandler).toHaveBeenCalledTimes(3);
  });

  it('registers extended tools plus standalone for extended tier', () => {
    registerMcpTools(server as never, router, 'extended');
    // 4 domain tools + 1 standalone = 5
    expect(server.setRequestHandler).toHaveBeenCalledTimes(5);
  });

  it('stores tool definitions on server object', () => {
    registerMcpTools(server as never, router);
    expect((server as Record<string, unknown>).__tool_qos_task).toBeDefined();
    expect((server as Record<string, unknown>).__tool_qos_system).toBeDefined();
  });

  it('handler dispatches correct command for task actions', async () => {
    registerMcpTools(server as never, router);
    const handler = server._handlers.get('tools/call/qos_task');
    expect(handler).toBeDefined();

    const result = await handler!({ action: 'run', prompt: 'hello' });
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hello' });
    expect(result).toHaveProperty('content');
    expect((result as Record<string, unknown>).isError).toBe(false);
  });

  it('handler returns error for unknown action', async () => {
    registerMcpTools(server as never, router);
    const handler = server._handlers.get('tools/call/qos_task');
    const result = await handler!({ action: 'nonexistent' }) as Record<string, unknown>;
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('UNKNOWN_ACTION');
  });

  it('handler strips action field before dispatching', async () => {
    registerMcpTools(server as never, router);
    const handler = server._handlers.get('tools/call/qos_system');
    await handler!({ action: 'config_get', path: 'mode' });
    expect(router.dispatch).toHaveBeenCalledWith('config.get', { path: 'mode' });
  });

  it('registers qos_workflow_create standalone tool', () => {
    registerMcpTools(server as never, router);
    expect((server as Record<string, unknown>).__tool_qos_workflow_create).toBeDefined();
    const tool = (server as Record<string, unknown>).__tool_qos_workflow_create as { name: string; inputSchema: Record<string, unknown> };
    expect(tool.name).toBe('qos_workflow_create');
    expect((tool.inputSchema as Record<string, unknown>).required).toContain('name');
  });

  it('respects QOS_TIER env var when no tier argument given', () => {
    const original = process.env.QOS_TIER;
    process.env.QOS_TIER = 'core';
    registerMcpTools(server as never, router);
    // 2 domain tools + 1 standalone = 3
    expect(server.setRequestHandler).toHaveBeenCalledTimes(3);
    process.env.QOS_TIER = original;
  });
});
