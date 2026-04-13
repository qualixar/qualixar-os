/**
 * Tests for Qualixar OS V2 Tool Registry (C-01)
 *
 * Tests the ToolRegistry: registration, lookup, execution,
 * built-in tools, error handling, and schema generation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createToolRegistry,
  createBuiltInTools,
} from '../../src/tools/tool-registry.js';
import type { ToolDefinition, ToolResult } from '../../src/tools/tool-registry.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
    removeAllListeners: vi.fn(),
  } as unknown as EventBus;
}

function createTestTool(name = 'test_tool'): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      required: ['value'],
    },
    handler: async (input) => ({
      content: `Result for ${input.value}`,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolRegistry', () => {
  describe('createToolRegistry', () => {
    it('creates registry with 4 built-in tools', () => {
      const registry = createToolRegistry();
      const tools = registry.list();
      expect(tools).toHaveLength(4);
      const names = tools.map((t) => t.name);
      expect(names).toContain('web_search');
      expect(names).toContain('file_read');
      expect(names).toContain('file_write');
      expect(names).toContain('shell_exec');
    });

    it('accepts optional EventBus', () => {
      const bus = mockEventBus();
      const registry = createToolRegistry(bus);
      expect(registry.list()).toHaveLength(4);
    });
  });

  describe('register', () => {
    it('registers a custom tool', () => {
      const registry = createToolRegistry();
      const tool = createTestTool('custom_search');
      registry.register(tool);
      const retrieved = registry.get('custom_search');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe(tool.name);
      expect(retrieved!.description).toBe(tool.description);
    });

    it('throws on duplicate tool name', () => {
      const registry = createToolRegistry();
      const tool = createTestTool('file_read'); // already built-in
      expect(() => registry.register(tool)).toThrow("Tool 'file_read' is already registered");
    });
  });

  describe('get', () => {
    it('returns undefined for unknown tool', () => {
      const registry = createToolRegistry();
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('returns registered tool by name', () => {
      const registry = createToolRegistry();
      const tool = registry.get('file_read');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('file_read');
    });
  });

  describe('list', () => {
    it('returns all registered tools as readonly array', () => {
      const registry = createToolRegistry();
      registry.register(createTestTool('extra'));
      expect(registry.list()).toHaveLength(5);
    });
  });

  describe('execute', () => {
    it('executes a tool and returns result', async () => {
      const registry = createToolRegistry();
      registry.register(createTestTool('echo'));
      const result = await registry.execute('echo', { value: 'hello' });
      expect(result.content).toBe('Result for hello');
      expect(result.isError).toBeUndefined();
    });

    it('returns error result for unknown tool', async () => {
      const registry = createToolRegistry();
      const result = await registry.execute('unknown_tool', {});
      expect(result.content).toBe("Tool 'unknown_tool' not found");
      expect(result.isError).toBe(true);
    });

    it('catches handler errors and returns error result', async () => {
      const registry = createToolRegistry();
      registry.register({
        name: 'failing_tool',
        description: 'A tool that always fails',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => {
          throw new Error('Intentional failure');
        },
      });
      const result = await registry.execute('failing_tool', {});
      expect(result.content).toBe("Tool 'failing_tool' failed: Intentional failure");
      expect(result.isError).toBe(true);
    });

    it('emits events via EventBus when provided', async () => {
      const bus = mockEventBus();
      const registry = createToolRegistry(bus);
      registry.register(createTestTool('evented'));
      await registry.execute('evented', { value: 'test' });

      // tool:registered events during register() + chat:tool_call_started + chat:tool_call_completed
      // 4 built-in registrations + 1 custom + 2 execute events = variable
      // Just check that the two execute events are present:
      expect((bus.emit as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
      const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls;
      const startEvent = calls.find(
        (c: unknown[]) => (c[0] as { type: string }).type === 'chat:tool_call_started',
      );
      const endEvent = calls.find(
        (c: unknown[]) => (c[0] as { type: string }).type === 'chat:tool_call_completed',
      );
      expect(startEvent).toBeDefined();
      expect(endEvent).toBeDefined();
    });

    it('emits error event when tool handler throws', async () => {
      const bus = mockEventBus();
      const registry = createToolRegistry(bus);
      registry.register({
        name: 'throw_tool',
        description: 'Throws',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => { throw new Error('boom'); },
      });
      const result = await registry.execute('throw_tool', {});
      expect(result.isError).toBe(true);

      const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls;
      const endEvent = calls.find(
        (c: unknown[]) => {
          const evt = c[0] as { type: string; payload: { isError: boolean } };
          return evt.type === 'chat:tool_call_completed' && evt.payload.isError === true;
        },
      );
      expect(endEvent).toBeDefined();
    });
  });

  describe('toToolSchemas', () => {
    it('returns provider-agnostic schemas for all tools', () => {
      const registry = createToolRegistry();
      const schemas = registry.toToolSchemas();
      expect(schemas).toHaveLength(4);
      for (const s of schemas) {
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('description');
        expect(s).toHaveProperty('inputSchema');
        // Should NOT have handler
        expect(s).not.toHaveProperty('handler');
      }
    });

    it('includes custom tools in schemas', () => {
      const registry = createToolRegistry();
      registry.register(createTestTool('custom'));
      const schemas = registry.toToolSchemas();
      expect(schemas).toHaveLength(5);
      expect(schemas.find((s) => s.name === 'custom')).toBeDefined();
    });
  });

  describe('built-in tools (stubs)', () => {
    it('file_read returns stub response', async () => {
      const registry = createToolRegistry();
      const result = await registry.execute('file_read', { path: '/test.txt' });
      expect(result.content).toContain('[stub]');
      expect(result.content).toContain('/test.txt');
    });

    it('file_write returns stub response', async () => {
      const registry = createToolRegistry();
      const result = await registry.execute('file_write', { path: '/out.txt', content: 'data' });
      expect(result.content).toContain('[stub]');
      expect(result.content).toContain('/out.txt');
    });

    it('shell_exec returns stub response', async () => {
      const registry = createToolRegistry();
      const result = await registry.execute('shell_exec', { command: 'echo hello' });
      expect(result.content).toContain('[stub]');
      expect(result.content).toContain('echo hello');
    });
  });

  describe('createBuiltInTools', () => {
    it('returns 4 tool definitions (including web_search)', () => {
      const tools = createBuiltInTools();
      expect(tools).toHaveLength(4);
      for (const t of tools) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.inputSchema).toBeDefined();
        expect(typeof t.handler).toBe('function');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Phase Pivot-2: Categorized Tool Registry Tests (RED 4-7, 36-37)
// ---------------------------------------------------------------------------

describe('CategorizedToolRegistry', () => {
  describe('register with category', () => {
    it('should register tool with explicit category (RED 4)', () => {
      const registry = createToolRegistry();
      registry.register({
        ...createTestTool('custom_code'),
        category: 'code-dev',
        source: 'mcp',
      });
      const tool = registry.get('custom_code');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('code-dev');
      expect(tool!.source).toBe('mcp');
    });

    it('should default category from BUILTIN_CATEGORIES for known names', () => {
      // Built-in tools get their category from BUILTIN_CATEGORIES
      const registry = createToolRegistry();
      const tool = registry.get('web_search');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('web-data');
    });

    it('should default to knowledge for unknown tools without category', () => {
      const registry = createToolRegistry();
      registry.register(createTestTool('mystery_tool'));
      const tool = registry.get('mystery_tool');
      expect(tool).toBeDefined();
      expect(tool!.category).toBe('knowledge');
    });
  });

  describe('listByCategory (RED 5)', () => {
    it('should list tools by category', () => {
      const registry = createToolRegistry();
      registry.register({ ...createTestTool('gh_pr'), category: 'code-dev', source: 'mcp' });
      registry.register({ ...createTestTool('gh_issue'), category: 'code-dev', source: 'mcp' });
      registry.register({ ...createTestTool('google'), category: 'web-data', source: 'mcp' });

      const codeDev = registry.listByCategory('code-dev');
      // 3 builtins (file_read, file_write, shell_exec) + 2 custom
      expect(codeDev.length).toBeGreaterThanOrEqual(4);

      const webData = registry.listByCategory('web-data');
      // 1 builtin (web_search) + 1 custom
      expect(webData.length).toBeGreaterThanOrEqual(2);

      const creative = registry.listByCategory('creative');
      expect(creative).toHaveLength(0);
    });
  });

  describe('getCatalogSummary (RED 6)', () => {
    it('should return catalog entries with truncated descriptions', () => {
      const registry = createToolRegistry();
      registry.register({
        ...createTestTool('long_desc'),
        description: 'A'.repeat(100),
        category: 'knowledge',
        source: 'mcp',
      });

      const catalog = registry.getCatalogSummary();
      expect(catalog.length).toBeGreaterThanOrEqual(5);

      const longEntry = catalog.find((e) => e.name === 'long_desc');
      expect(longEntry).toBeDefined();
      expect(longEntry!.description.length).toBeLessThanOrEqual(80);
      expect(longEntry!.description.endsWith('...')).toBe(true);
      expect(longEntry!.category).toBe('knowledge');
    });
  });

  describe('toToolSchemasForAgent (RED 7)', () => {
    it('should filter schemas for specific agent tool list', () => {
      const registry = createToolRegistry();
      registry.register({ ...createTestTool('extra1'), category: 'web-data', source: 'mcp' });
      registry.register({ ...createTestTool('extra2'), category: 'creative', source: 'mcp' });

      const schemas = registry.toToolSchemasForAgent(['web_search', 'file_read']);
      expect(schemas).toHaveLength(2);
      expect(schemas.map((s) => s.name)).toContain('web_search');
      expect(schemas.map((s) => s.name)).toContain('file_read');
    });

    it('should ignore nonexistent tool names', () => {
      const registry = createToolRegistry();
      const schemas = registry.toToolSchemasForAgent(['web_search', 'nonexistent']);
      expect(schemas).toHaveLength(1);
      expect(schemas[0].name).toBe('web_search');
    });
  });

  describe('builtin immutability R4 (RED 36)', () => {
    it('should reject overwriting builtin tools from non-builtin source', () => {
      const registry = createToolRegistry();
      expect(() =>
        registry.register({
          ...createTestTool('web_search'),
          source: 'mcp',
        }),
      ).toThrow("Cannot overwrite builtin tool 'web_search'");
    });

    it('should reject overwriting file_read from skill source', () => {
      const registry = createToolRegistry();
      expect(() =>
        registry.register({
          ...createTestTool('file_read'),
          source: 'skill',
        }),
      ).toThrow("Cannot overwrite builtin tool 'file_read'");
    });
  });

  describe('non-builtin overwrite (RED 37)', () => {
    it('should allow overwriting non-builtin tools', () => {
      const registry = createToolRegistry();
      registry.register({
        ...createTestTool('custom_search'),
        description: 'v1',
        category: 'web-data',
        source: 'mcp',
      });
      registry.register({
        ...createTestTool('custom_search'),
        description: 'v2',
        category: 'web-data',
        source: 'skill',
      });
      const tool = registry.get('custom_search');
      expect(tool!.description).toBe('v2');
      expect(tool!.source).toBe('skill');
    });
  });

  describe('getCategories', () => {
    it('should return all 6 category infos', () => {
      const registry = createToolRegistry();
      const cats = registry.getCategories();
      expect(cats).toHaveLength(6);
    });
  });

  describe('unregisterBySource', () => {
    it('should remove all tools from a source', () => {
      const registry = createToolRegistry();
      registry.register({ ...createTestTool('mcp_tool_1'), category: 'web-data', source: 'mcp' });
      registry.register({ ...createTestTool('mcp_tool_2'), category: 'code-dev', source: 'mcp' });
      registry.register({ ...createTestTool('skill_tool'), category: 'creative', source: 'skill' });

      const removed = registry.unregisterBySource('mcp', 'connector-1');
      expect(removed).toBe(2);
      expect(registry.get('mcp_tool_1')).toBeUndefined();
      expect(registry.get('mcp_tool_2')).toBeUndefined();
      expect(registry.get('skill_tool')).toBeDefined();
      // Builtins untouched
      expect(registry.get('web_search')).toBeDefined();
    });
  });
});

describe('ToolCall type integration', () => {
  it('ModelResponse can carry toolCalls', () => {
    // Type-level test: ensure ToolCall is usable in ModelResponse
    const response: import('../../src/types/common.js').ModelResponse = {
      content: 'thinking...',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      latencyMs: 200,
      toolCalls: [
        { id: 'tc_001', name: 'file_read', input: { path: '/test.txt' } },
      ],
    };
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('file_read');
  });

  it('ModelRequest can carry tools and messages', () => {
    const request: import('../../src/types/common.js').ModelRequest = {
      prompt: 'Read the file',
      tools: [
        { name: 'file_read', description: 'Read a file', inputSchema: { type: 'object', properties: {} } },
      ],
      messages: [
        { role: 'user', content: 'Read the file' },
      ],
    };
    expect(request.tools).toHaveLength(1);
    expect(request.messages).toHaveLength(1);
  });
});
