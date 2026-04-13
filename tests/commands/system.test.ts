/**
 * Phase 10 -- System Command Tests
 * Source: Phase 10 LLD Section 2.10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { systemCommands } from '../../src/commands/system.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      modeEngine: {
        getConfig: vi.fn().mockReturnValue({
          models: { primary: 'claude-sonnet-4-6' },
          mode: 'companion',
        }),
        switchMode: vi.fn(),
      },
      costTracker: {
        getSummary: vi.fn().mockReturnValue({
          total_usd: 0.05,
          model_calls: 10,
        }),
      },
    } as never,
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
// Tests
// ---------------------------------------------------------------------------

describe('system commands', () => {
  const configGetDef = systemCommands.find((c) => c.name === 'config.get')!;
  const configSetDef = systemCommands.find((c) => c.name === 'config.set')!;
  const modelsListDef = systemCommands.find((c) => c.name === 'models.list')!;
  const costSummaryDef = systemCommands.find((c) => c.name === 'cost.summary')!;

  describe('config.get', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(configGetDef).toBeDefined();
      expect(configGetDef.category).toBe('system');
    });

    it('returns full config when no key is provided', async () => {
      const result = await configGetDef.handler(ctx, {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        models: { primary: 'claude-sonnet-4-6' },
        mode: 'companion',
      });
    });

    it('traverses dot-notated key path', async () => {
      const result = await configGetDef.handler(ctx, { key: 'models.primary' });
      expect(result.success).toBe(true);
      expect(result.data).toBe('claude-sonnet-4-6');
    });

    it('returns null for non-existent key path', async () => {
      const result = await configGetDef.handler(ctx, { key: 'does.not.exist' });
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns null when path traverses through primitive', async () => {
      const result = await configGetDef.handler(ctx, { key: 'mode.nested' });
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns top-level key value', async () => {
      const result = await configGetDef.handler(ctx, { key: 'mode' });
      expect(result.success).toBe(true);
      expect(result.data).toBe('companion');
    });

    it('returns error when getConfig throws', async () => {
      vi.mocked(ctx.orchestrator.modeEngine.getConfig).mockImplementation(() => {
        throw new Error('Config unavailable');
      });

      const result = await configGetDef.handler(ctx, {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONFIG_GET_FAILED');
    });
  });

  describe('config.set', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(configSetDef).toBeDefined();
      expect(configSetDef.category).toBe('system');
    });

    it('switches mode to companion', async () => {
      const result = await configSetDef.handler(ctx, { key: 'mode', value: 'companion' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ updated: true });
      expect(ctx.orchestrator.modeEngine.switchMode).toHaveBeenCalledWith('companion');
    });

    it('switches mode to power', async () => {
      const result = await configSetDef.handler(ctx, { key: 'mode', value: 'power' });
      expect(result.success).toBe(true);
      expect(ctx.orchestrator.modeEngine.switchMode).toHaveBeenCalledWith('power');
    });

    it('rejects invalid mode value', async () => {
      const result = await configSetDef.handler(ctx, { key: 'mode', value: 'turbo' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MODE');
    });

    it('rejects non-mode config keys', async () => {
      const result = await configSetDef.handler(ctx, { key: 'models.primary', value: 'gpt-5' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONFIG_READONLY');
    });

    it('returns error when switchMode throws', async () => {
      vi.mocked(ctx.orchestrator.modeEngine.switchMode).mockImplementation(() => {
        throw new Error('Mode switch failed');
      });

      const result = await configSetDef.handler(ctx, { key: 'mode', value: 'power' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONFIG_SET_FAILED');
    });

    it('validates key is required', () => {
      const parseResult = configSetDef.inputSchema.safeParse({ value: 'x' });
      expect(parseResult.success).toBe(false);
    });
  });

  describe('models.list', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(modelsListDef).toBeDefined();
      expect(modelsListDef.category).toBe('system');
    });

    it('returns MODEL_CATALOG entries with safe fields', async () => {
      const result = await modelsListDef.handler(ctx, {});
      expect(result.success).toBe(true);

      const data = result.data as readonly Record<string, unknown>[];
      expect(data.length).toBeGreaterThan(0);

      // Verify first model has all expected fields
      const first = data[0]!;
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('provider');
      expect(first).toHaveProperty('qualityScore');
      expect(first).toHaveProperty('costPerInputToken');
      expect(first).toHaveProperty('costPerOutputToken');
      expect(first).toHaveProperty('maxTokens');
      expect(first).toHaveProperty('available');
    });

    it('includes known models from catalog', async () => {
      const result = await modelsListDef.handler(ctx, {});
      const data = result.data as readonly { name: string }[];
      const names = data.map((m) => m.name);

      expect(names).toContain('claude-sonnet-4-6');
      expect(names).toContain('gpt-4.1');
      expect(names).toContain('gemini-2.5-pro');
    });
  });

  describe('cost.summary', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(costSummaryDef).toBeDefined();
      expect(costSummaryDef.category).toBe('system');
    });

    it('returns global cost summary when no taskId', async () => {
      const result = await costSummaryDef.handler(ctx, {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ total_usd: 0.05, model_calls: 10 });
      expect(ctx.orchestrator.costTracker.getSummary).toHaveBeenCalledWith(undefined);
    });

    it('returns per-task cost summary', async () => {
      const taskSummary = { total_usd: 0.01, model_calls: 2 };
      vi.mocked(ctx.orchestrator.costTracker.getSummary).mockReturnValue(taskSummary);

      const result = await costSummaryDef.handler(ctx, { taskId: 'task-42' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(taskSummary);
      expect(ctx.orchestrator.costTracker.getSummary).toHaveBeenCalledWith('task-42');
    });

    it('returns error when getSummary throws', async () => {
      vi.mocked(ctx.orchestrator.costTracker.getSummary).mockImplementation(() => {
        throw new Error('Cost tracker down');
      });

      const result = await costSummaryDef.handler(ctx, {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('COST_SUMMARY_FAILED');
    });
  });
});
