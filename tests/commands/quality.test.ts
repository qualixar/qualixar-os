/**
 * Phase 10 -- Quality Command Tests
 * Source: Phase 10 LLD Section 2.8
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qualityCommands } from '../../src/commands/quality.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(overrides?: Partial<Record<string, unknown>>): CommandContext {
  return {
    orchestrator: {
      judgePipeline: {
        getResults: vi.fn().mockReturnValue(null),
        ...(overrides?.judgePipeline as Record<string, unknown> ?? {}),
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

describe('quality commands', () => {
  const judgesResultsDef = qualityCommands.find((c) => c.name === 'judges.results')!;

  describe('judges.results', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists in qualityCommands with correct metadata', () => {
      expect(judgesResultsDef).toBeDefined();
      expect(judgesResultsDef.category).toBe('quality');
    });

    it('returns empty array when getResults returns null', async () => {
      const result = await judgesResultsDef.handler(ctx, { taskId: 'task-1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns empty array when getResults returns empty array', async () => {
      vi.mocked(ctx.orchestrator.judgePipeline.getResults).mockReturnValue([]);
      const result = await judgesResultsDef.handler(ctx, { taskId: 'task-1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns results when available', async () => {
      const mockResults = [
        { judgeModel: 'claude-sonnet-4-6', verdict: 'approve', score: 0.95 },
        { judgeModel: 'gpt-4.1', verdict: 'approve', score: 0.88 },
      ];
      vi.mocked(ctx.orchestrator.judgePipeline.getResults).mockReturnValue(mockResults);

      const result = await judgesResultsDef.handler(ctx, { taskId: 'task-1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResults);
    });

    it('returns error when judgePipeline throws', async () => {
      vi.mocked(ctx.orchestrator.judgePipeline.getResults).mockImplementation(() => {
        throw new Error('Pipeline unavailable');
      });

      const result = await judgesResultsDef.handler(ctx, { taskId: 'task-1' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('JUDGE_RESULTS_FAILED');
      expect(result.error?.message).toBe('Pipeline unavailable');
    });

    it('validates taskId is required', () => {
      const parseResult = judgesResultsDef.inputSchema.safeParse({});
      expect(parseResult.success).toBe(false);
    });

    it('validates taskId must be non-empty', () => {
      const parseResult = judgesResultsDef.inputSchema.safeParse({ taskId: '' });
      expect(parseResult.success).toBe(false);
    });

    it('passes valid input', () => {
      const parseResult = judgesResultsDef.inputSchema.safeParse({ taskId: 'abc-123' });
      expect(parseResult.success).toBe(true);
    });
  });
});
