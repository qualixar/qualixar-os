/**
 * Phase 10 -- Agent Command Tests
 * Source: Phase 10 LLD Section 6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentCommands } from '../../src/commands/agents.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      agentRegistry: {
        listAgents: vi.fn().mockReturnValue([
          { id: 'a1', status: 'running', role: 'coder' },
          { id: 'a2', status: 'completed', role: 'reviewer' },
        ]),
      },
    } as never,
    eventBus: { emit: vi.fn() } as never,
    db: {
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      insert: vi.fn(),
    } as never,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

function findCmd(name: string) {
  const cmd = agentCommands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentCommands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('exports 2 command definitions', () => {
    expect(agentCommands).toHaveLength(2);
  });

  // -- agents.list --
  describe('agents.list', () => {
    it('uses DB query when taskId is provided', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([{ id: 'a1', status: 'running', role: 'coder', task_id: 't1' }]);
      const result = await findCmd('agents.list').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE task_id = ?'),
        ['t1'],
      );
    });

    it('adds status filter to DB query when both taskId and status provided', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([]);
      await findCmd('agents.list').handler(ctx, { taskId: 't1', status: 'running' });
      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('AND status = ?'),
        ['t1', 'running'],
      );
    });

    it('uses agentRegistry.listAgents when no taskId', async () => {
      const result = await findCmd('agents.list').handler(ctx, {});
      expect(result.success).toBe(true);
      expect(ctx.orchestrator.agentRegistry.listAgents).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
    });

    it('filters by status from registry when no taskId', async () => {
      const result = await findCmd('agents.list').handler(ctx, { status: 'running' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('returns HANDLER_ERROR on failure', async () => {
      vi.mocked(ctx.orchestrator.agentRegistry.listAgents).mockImplementation(() => { throw new Error('Registry down'); });
      const result = await findCmd('agents.list').handler(ctx, {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });
  });

  // -- agents.inspect --
  describe('agents.inspect', () => {
    it('returns agent details and model calls from DB', async () => {
      vi.mocked(ctx.db.get).mockReturnValue({ id: 'a1', status: 'completed', role: 'coder', task_id: 't1', output: 'result' });
      vi.mocked(ctx.db.query).mockReturnValue([{ id: 'mc1', agent_id: 'a1', model: 'claude' }]);
      const result = await findCmd('agents.inspect').handler(ctx, { agentId: 'a1' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        agent: { id: 'a1', role: 'coder' },
        output: 'result',
        modelCalls: [{ id: 'mc1' }],
      });
    });

    it('returns AGENT_NOT_FOUND when agent missing', async () => {
      vi.mocked(ctx.db.get).mockReturnValue(undefined);
      const result = await findCmd('agents.inspect').handler(ctx, { agentId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AGENT_NOT_FOUND');
    });

    it('defaults output to empty string when null', async () => {
      vi.mocked(ctx.db.get).mockReturnValue({ id: 'a1', status: 'done', role: 'r', task_id: 't1', output: null });
      vi.mocked(ctx.db.query).mockReturnValue([]);
      const result = await findCmd('agents.inspect').handler(ctx, { agentId: 'a1' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ output: '' });
    });

    it('rejects empty agentId via schema', () => {
      const parsed = findCmd('agents.inspect').inputSchema.safeParse({ agentId: '' });
      expect(parsed.success).toBe(false);
    });
  });
});
