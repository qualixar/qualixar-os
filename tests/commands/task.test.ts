/**
 * Phase 10 -- Task Command Tests
 * Source: Phase 10 LLD Section 6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { taskCommands } from '../../src/commands/task.js';
import type { CommandContext, CommandResult } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      run: vi.fn().mockResolvedValue({ taskId: 't1', status: 'completed', output: 'done' }),
      getStatus: vi.fn().mockReturnValue({ taskId: 't1', phase: 'run', progress: 50 }),
      cancel: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      redirect: vi.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCmd(name: string) {
  const cmd = taskCommands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskCommands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('exports 8 command definitions', () => {
    expect(taskCommands).toHaveLength(8);
  });

  // -- run --
  describe('run', () => {
    it('calls orchestrator.run and returns result', async () => {
      const result = await findCmd('run').handler(ctx, { prompt: 'Build something' });
      expect(result.success).toBe(true);
      expect(ctx.orchestrator.run).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Build something' }));
    });

    it('does not pass stream to orchestrator', async () => {
      await findCmd('run').handler(ctx, { prompt: 'Test', stream: true });
      expect(ctx.orchestrator.run).toHaveBeenCalledWith(expect.not.objectContaining({ stream: true }));
    });

    it('returns TASK_RUN_FAILED on error', async () => {
      vi.mocked(ctx.orchestrator.run).mockRejectedValue(new Error('Boom'));
      const result = await findCmd('run').handler(ctx, { prompt: 'Fail' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TASK_RUN_FAILED');
    });

    it('rejects empty prompt via schema', () => {
      const parsed = findCmd('run').inputSchema.safeParse({ prompt: '' });
      expect(parsed.success).toBe(false);
    });
  });

  // -- status --
  describe('status', () => {
    it('returns task status on success', async () => {
      const result = await findCmd('status').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ taskId: 't1', phase: 'run' });
    });

    it('returns TASK_NOT_FOUND on error', async () => {
      vi.mocked(ctx.orchestrator.getStatus).mockImplementation(() => { throw new Error('No task'); });
      const result = await findCmd('status').handler(ctx, { taskId: 'bad' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TASK_NOT_FOUND');
    });
  });

  // -- output --
  describe('output', () => {
    it('returns parsed output from DB', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([{ result: JSON.stringify({ output: 'hello', artifacts: [{ path: 'a.ts' }] }) }]);
      const result = await findCmd('output').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ taskId: 't1', output: 'hello', artifacts: [{ path: 'a.ts' }] });
    });

    it('returns TASK_NOT_FOUND when no rows', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([]);
      const result = await findCmd('output').handler(ctx, { taskId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('handles malformed JSON gracefully', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([{ result: 'not-json' }]);
      const result = await findCmd('output').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });
  });

  // -- cancel --
  describe('cancel', () => {
    it('calls orchestrator.cancel and returns cancelled:true', async () => {
      const result = await findCmd('cancel').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ cancelled: true });
    });

    it('returns CANCEL_FAILED on error', async () => {
      vi.mocked(ctx.orchestrator.cancel).mockRejectedValue(new Error('Cannot cancel'));
      const result = await findCmd('cancel').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CANCEL_FAILED');
    });
  });

  // -- pause --
  describe('pause', () => {
    it('calls orchestrator.pause and returns paused:true', async () => {
      const result = await findCmd('pause').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ paused: true });
    });

    it('returns HANDLER_ERROR on error', async () => {
      vi.mocked(ctx.orchestrator.pause).mockRejectedValue(new Error('Nope'));
      const result = await findCmd('pause').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });
  });

  // -- resume --
  describe('resume', () => {
    it('calls orchestrator.resume and returns resumed:true', async () => {
      const result = await findCmd('resume').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ resumed: true });
    });

    it('returns HANDLER_ERROR on error', async () => {
      vi.mocked(ctx.orchestrator.resume).mockRejectedValue(new Error('Fail'));
      const result = await findCmd('resume').handler(ctx, { taskId: 't1' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });
  });

  // -- steer --
  describe('steer', () => {
    it('calls orchestrator.redirect and returns redirected:true', async () => {
      const result = await findCmd('steer').handler(ctx, { taskId: 't1', newPrompt: 'Go left' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ redirected: true });
      expect(ctx.orchestrator.redirect).toHaveBeenCalledWith('t1', 'Go left');
    });

    it('rejects empty newPrompt via schema', () => {
      const parsed = findCmd('steer').inputSchema.safeParse({ taskId: 't1', newPrompt: '' });
      expect(parsed.success).toBe(false);
    });
  });

  // -- list --
  describe('list', () => {
    it('queries DB with default limit and offset', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([{ id: 't1', status: 'completed' }]);
      const result = await findCmd('list').handler(ctx, { limit: 50, offset: 0 });
      expect(result.success).toBe(true);
      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC LIMIT ? OFFSET ?'),
        [50, 0],
      );
    });

    it('adds WHERE clause when status is provided', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([]);
      await findCmd('list').handler(ctx, { status: 'running', limit: 10, offset: 0 });
      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        ['running', 10, 0],
      );
    });

    it('returns HANDLER_ERROR on DB error', async () => {
      vi.mocked(ctx.db.query).mockImplementation(() => { throw new Error('DB down'); });
      const result = await findCmd('list').handler(ctx, { limit: 50, offset: 0 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });
  });
});
