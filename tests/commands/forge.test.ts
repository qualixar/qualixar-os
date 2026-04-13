/**
 * Phase 10 -- Forge Command Tests
 * Source: Phase 10 LLD Section 6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forgeCommands } from '../../src/commands/forge.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      forge: {
        designTeam: vi.fn().mockResolvedValue({
          id: 'd1',
          taskType: 'code',
          topology: 'pipeline',
          agents: [{ role: 'coder', model: 'claude' }],
          reasoning: 'Simple task',
          estimatedCostUsd: 0.05,
          version: 1,
        }),
      },
      modeEngine: {
        getFeatureGates: vi.fn().mockReturnValue({
          topologies: ['solo', 'pipeline', 'debate', 'ensemble'],
        }),
      },
    } as never,
    eventBus: { emit: vi.fn() } as never,
    db: { query: vi.fn(), get: vi.fn(), insert: vi.fn() } as never,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

function findCmd(name: string) {
  const cmd = forgeCommands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('forgeCommands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('exports 2 command definitions', () => {
    expect(forgeCommands).toHaveLength(2);
  });

  // -- forge.design --
  describe('forge.design', () => {
    it('calls forge.designTeam with provided taskId', async () => {
      const result = await findCmd('forge.design').handler(ctx, {
        taskType: 'code',
        prompt: 'Build API',
        taskId: 'existing-task',
      });
      expect(result.success).toBe(true);
      expect(ctx.orchestrator.forge.designTeam).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'existing-task', prompt: 'Build API' }),
      );
      expect(result.data).toMatchObject({ dryRun: false });
    });

    it('generates ephemeral taskId for dry-run when taskId omitted', async () => {
      const result = await findCmd('forge.design').handler(ctx, {
        taskType: 'research',
        prompt: 'Analyze market',
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ dryRun: true });
      // Verify a UUID-like ID was generated (not undefined)
      const call = vi.mocked(ctx.orchestrator.forge.designTeam).mock.calls[0][0];
      expect(call.taskId).toBeDefined();
      expect(call.taskId.length).toBeGreaterThan(0);
    });

    it('defaults mode to companion', async () => {
      await findCmd('forge.design').handler(ctx, { taskType: 'code', prompt: 'Test' });
      expect(ctx.orchestrator.forge.designTeam).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'companion' }),
      );
    });

    it('returns HANDLER_ERROR on forge failure', async () => {
      vi.mocked(ctx.orchestrator.forge.designTeam).mockRejectedValue(new Error('Forge broken'));
      const result = await findCmd('forge.design').handler(ctx, { taskType: 'code', prompt: 'Fail' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });

    it('rejects empty taskType via schema', () => {
      const parsed = findCmd('forge.design').inputSchema.safeParse({ taskType: '', prompt: 'Test' });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty prompt via schema', () => {
      const parsed = findCmd('forge.design').inputSchema.safeParse({ taskType: 'code', prompt: '' });
      expect(parsed.success).toBe(false);
    });
  });

  // -- forge.topologies --
  describe('forge.topologies', () => {
    it('returns topologies from feature gates', async () => {
      const result = await findCmd('forge.topologies').handler(ctx, {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['solo', 'pipeline', 'debate', 'ensemble']);
    });

    it('returns HANDLER_ERROR on failure', async () => {
      vi.mocked(ctx.orchestrator.modeEngine.getFeatureGates).mockImplementation(() => { throw new Error('No gates'); });
      const result = await findCmd('forge.topologies').handler(ctx, {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });

    it('accepts empty object input', () => {
      const parsed = findCmd('forge.topologies').inputSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });
  });
});
