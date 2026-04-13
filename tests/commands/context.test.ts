/**
 * Phase 12 -- Context Command Tests (Updated from Phase 10 stubs)
 * Tests the context.add, context.scan, context.list command handlers
 * with real DB and temp files.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contextCommands } from '../../src/commands/context.js';
import { createDatabase } from '../../src/db/database.js';
import type { CommandContext } from '../../src/commands/types.js';
import type { QosDatabase } from '../../src/db/database.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), 'qos-ctx-cmd-test-' + Date.now());
let db: QosDatabase;

beforeAll(async () => {
  await mkdir(join(TEST_DIR, 'docs'), { recursive: true });
  await writeFile(join(TEST_DIR, 'readme.md'), '# Test Readme\n\nSome content here.');
  await writeFile(join(TEST_DIR, 'docs', 'guide.txt'), 'A plain text guide.');
  await writeFile(join(TEST_DIR, 'docs', 'data.json'), '{"key": "value"}');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Mock CommandContext with real DB
// ---------------------------------------------------------------------------

function createTestContext(): CommandContext {
  db = createDatabase(':memory:');
  db.runMigrations();
  return {
    orchestrator: {} as never,
    eventBus: { emit: vi.fn() } as never,
    db,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

function findCmd(name: string) {
  const cmd = contextCommands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contextCommands', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('exports 3 command definitions', () => {
    expect(contextCommands).toHaveLength(3);
  });

  // -- context.add --
  describe('context.add', () => {
    it('parses and stores files, returns added count and tokens', async () => {
      const result = await findCmd('context.add').handler(ctx, {
        paths: [join(TEST_DIR, 'readme.md')],
      });
      expect(result.success).toBe(true);
      expect((result.data as any).added).toBe(1);
      expect((result.data as any).tokens).toBeGreaterThan(0);
    });

    it('handles multiple files', async () => {
      const result = await findCmd('context.add').handler(ctx, {
        paths: [
          join(TEST_DIR, 'readme.md'),
          join(TEST_DIR, 'docs', 'guide.txt'),
        ],
      });
      expect(result.success).toBe(true);
      expect((result.data as any).added).toBe(2);
    });

    it('associates context with taskId', async () => {
      const result = await findCmd('context.add').handler(ctx, {
        paths: [join(TEST_DIR, 'readme.md')],
        taskId: 'task-123',
      });
      expect(result.success).toBe(true);

      // Verify via context.list
      const listResult = await findCmd('context.list').handler(ctx, { taskId: 'task-123' });
      expect(listResult.success).toBe(true);
      expect((listResult.data as any).count).toBeGreaterThan(0);
    });

    it('returns error for nonexistent file', async () => {
      const result = await findCmd('context.add').handler(ctx, {
        paths: ['/nonexistent/file.md'],
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTEXT_ADD_ERROR');
    });

    it('rejects empty paths array via schema', () => {
      const parsed = findCmd('context.add').inputSchema.safeParse({ paths: [] });
      expect(parsed.success).toBe(false);
    });

    it('accepts optional urls and taskId', () => {
      const parsed = findCmd('context.add').inputSchema.safeParse({
        paths: ['a.ts'],
        urls: ['https://example.com'],
        taskId: 't1',
      });
      expect(parsed.success).toBe(true);
    });
  });

  // -- context.scan --
  describe('context.scan', () => {
    it('scans directory and stores parsed files', async () => {
      const result = await findCmd('context.scan').handler(ctx, {
        directory: TEST_DIR,
        recursive: true,
      });
      expect(result.success).toBe(true);
      expect((result.data as any).scanned).toBeGreaterThan(0);
      expect((result.data as any).tokens).toBeGreaterThan(0);
    });

    it('returns chunk count and skip count', async () => {
      const result = await findCmd('context.scan').handler(ctx, {
        directory: TEST_DIR,
        recursive: true,
      });
      expect(result.success).toBe(true);
      expect((result.data as any)).toHaveProperty('chunks');
      expect((result.data as any)).toHaveProperty('skipped');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await findCmd('context.scan').handler(ctx, {
        directory: '/nonexistent/dir',
        recursive: true,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTEXT_SCAN_ERROR');
    });

    it('rejects empty directory via schema', () => {
      const parsed = findCmd('context.scan').inputSchema.safeParse({ directory: '' });
      expect(parsed.success).toBe(false);
    });

    it('defaults recursive to true', () => {
      const parsed = findCmd('context.scan').inputSchema.safeParse({ directory: '/tmp' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.recursive).toBe(true);
      }
    });
  });

  // -- context.list --
  describe('context.list', () => {
    it('returns empty when no context added', async () => {
      const result = await findCmd('context.list').handler(ctx, {});
      expect(result.success).toBe(true);
      expect((result.data as any).entries).toEqual([]);
      expect((result.data as any).count).toBe(0);
      expect((result.data as any).totalTokens).toBe(0);
    });

    it('returns entries after adding context', async () => {
      await findCmd('context.add').handler(ctx, {
        paths: [join(TEST_DIR, 'readme.md')],
        taskId: 'task-1',
      });

      const result = await findCmd('context.list').handler(ctx, { taskId: 'task-1' });
      expect(result.success).toBe(true);
      expect((result.data as any).count).toBeGreaterThan(0);
      expect((result.data as any).totalTokens).toBeGreaterThan(0);
    });

    it('accepts optional taskId', () => {
      const parsed = findCmd('context.list').inputSchema.safeParse({ taskId: 't1' });
      expect(parsed.success).toBe(true);
    });
  });
});
