/**
 * Phase 10 -- Interop Command Tests
 * Source: Phase 10 LLD Section 2.11
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interopCommands } from '../../src/commands/interop.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock AgentConverter
// ---------------------------------------------------------------------------

const mockDetectAndConvert = vi.fn();

vi.mock('../../src/compatibility/converter.js', () => ({
  AgentConverter: class MockAgentConverter {
    detectAndConvert = mockDetectAndConvert;
  },
}));

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {} as never,
    eventBus: { emit: vi.fn() } as never,
    db: {
      insert: vi.fn(),
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    } as never,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockSpec = {
  version: 1,
  name: 'test-agent',
  description: 'A test agent',
  roles: [
    { role: 'analyst', model: 'claude-sonnet-4-6', systemPrompt: 'Analyze data', tools: [] },
  ],
  tools: [
    { name: 'search', description: 'Search tool', parameters: {} },
    { name: 'write', description: 'Write tool', parameters: {} },
  ],
  config: {},
  source: { format: 'openclaw' as const, originalPath: '/tmp/agent.yaml' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('interop commands', () => {
  const importDef = interopCommands.find((c) => c.name === 'import')!;

  describe('import', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
      mockDetectAndConvert.mockReset();
      mockDetectAndConvert.mockResolvedValue(mockSpec);
    });

    it('exists with correct metadata', () => {
      expect(importDef).toBeDefined();
      expect(importDef.category).toBe('interop');
    });

    it('imports agent and returns summary', async () => {
      const result = await importDef.handler(ctx, { path: '/tmp/agent.yaml' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.name).toBe('test-agent');
      expect(data.format).toBe('openclaw');
      expect(data.roles).toBe(1);
      expect(data.tools).toBe(2);
      expect(data.id).toBeDefined();
    });

    it('inserts into imported_agents table', async () => {
      await importDef.handler(ctx, { path: '/tmp/agent.yaml' });

      expect(ctx.db.insert).toHaveBeenCalledWith(
        'imported_agents',
        expect.objectContaining({
          source_format: 'openclaw',
          agent_spec: JSON.stringify(mockSpec),
          version: 1,
        }),
      );
    });

    it('emits compat:agent_imported event', async () => {
      await importDef.handler(ctx, { path: '/tmp/agent.yaml' });

      expect(ctx.eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'compat:agent_imported',
          payload: expect.objectContaining({
            name: 'test-agent',
            sourceFormat: 'openclaw',
          }),
          source: 'command',
        }),
      );
    });

    it('returns error when converter fails', async () => {
      mockDetectAndConvert.mockRejectedValue(new Error('Unsupported format'));

      const result = await importDef.handler(ctx, { path: '/tmp/bad.xyz' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('IMPORT_FAILED');
      expect(result.error?.message).toBe('Unsupported format');
    });

    it('returns error when DB insert fails', async () => {
      vi.mocked(ctx.db.insert).mockImplementation(() => {
        throw new Error('DB full');
      });

      const result = await importDef.handler(ctx, { path: '/tmp/agent.yaml' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('IMPORT_FAILED');
    });

    it('validates path is required', () => {
      const parseResult = importDef.inputSchema.safeParse({});
      expect(parseResult.success).toBe(false);
    });

    it('validates path must be non-empty', () => {
      const parseResult = importDef.inputSchema.safeParse({ path: '' });
      expect(parseResult.success).toBe(false);
    });

    it('validates format enum when provided', () => {
      const parseResult = importDef.inputSchema.safeParse({
        path: '/tmp/agent.yaml',
        format: 'invalid',
      });
      expect(parseResult.success).toBe(false);
    });

    it('accepts valid format values', () => {
      for (const fmt of ['openclaw', 'deerflow', 'nemoclaw', 'gitagent']) {
        const parseResult = importDef.inputSchema.safeParse({
          path: '/tmp/agent.yaml',
          format: fmt,
        });
        expect(parseResult.success).toBe(true);
      }
    });
  });
});
