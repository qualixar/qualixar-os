/**
 * Phase 10 -- Workspace Command Tests
 * Source: Phase 10 LLD Section 6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspaceCommands } from '../../src/commands/workspace.js';
import type { CommandContext } from '../../src/commands/types.js';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {} as never,
    eventBus: { emit: vi.fn() } as never,
    db: { query: vi.fn(), get: vi.fn(), insert: vi.fn() } as never,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

function findCmd(name: string) {
  const cmd = workspaceCommands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workspaceCommands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.mocked(existsSync).mockReset();
    vi.mocked(mkdirSync).mockReset();
  });

  it('exports 2 command definitions', () => {
    expect(workspaceCommands).toHaveLength(2);
  });

  // -- workspace.set --
  describe('workspace.set', () => {
    it('returns resolved path when directory exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const result = await findCmd('workspace.set').handler(ctx, { directory: '/tmp/workspace' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ path: resolve('/tmp/workspace'), created: false });
    });

    it('creates directory and sets created=true when missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await findCmd('workspace.set').handler(ctx, { directory: '/tmp/new-ws' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ created: true });
      expect(mkdirSync).toHaveBeenCalledWith(resolve('/tmp/new-ws'), { recursive: true });
    });

    it('returns HANDLER_ERROR when mkdirSync throws', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockImplementation(() => { throw new Error('Permission denied'); });
      const result = await findCmd('workspace.set').handler(ctx, { directory: '/no-access' });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });

    it('rejects empty directory via schema', () => {
      const parsed = findCmd('workspace.set').inputSchema.safeParse({ directory: '' });
      expect(parsed.success).toBe(false);
    });
  });

  // -- workspace.files --
  describe('workspace.files', () => {
    it('returns error when taskId is missing', async () => {
      const result = await findCmd('workspace.files').handler(ctx, {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_TASK_ID');
    });

    it('accepts optional taskId', () => {
      const parsed = findCmd('workspace.files').inputSchema.safeParse({ taskId: 't1' });
      expect(parsed.success).toBe(true);
    });
  });
});
