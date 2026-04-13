/**
 * Phase 10 -- Memory Command Tests
 * Source: Phase 10 LLD Section 2.9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryCommands } from '../../src/commands/memory.js';
import type { CommandContext } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      slmLite: {
        search: vi.fn().mockResolvedValue([]),
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

describe('memory commands', () => {
  const searchDef = memoryCommands.find((c) => c.name === 'memory.search')!;
  const storeDef = memoryCommands.find((c) => c.name === 'memory.store')!;

  describe('memory.search', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(searchDef).toBeDefined();
      expect(searchDef.category).toBe('memory');
    });

    it('uses slmLite.search when no minTrust', async () => {
      const mockResults = [
        { layer: 'semantic', content: 'test content' },
      ];
      vi.mocked(ctx.orchestrator.slmLite.search).mockResolvedValue(mockResults);

      const result = await searchDef.handler(ctx, { query: 'test', limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResults);
      expect(ctx.orchestrator.slmLite.search).toHaveBeenCalledWith('test', {
        layer: undefined,
        limit: 10,
      });
    });

    it('passes layer filter to slmLite.search', async () => {
      await searchDef.handler(ctx, { query: 'test', layer: 'episodic', limit: 5 });
      expect(ctx.orchestrator.slmLite.search).toHaveBeenCalledWith('test', {
        layer: 'episodic',
        limit: 5,
      });
    });

    it('uses direct DB query when minTrust is provided', async () => {
      const mockRows = [
        { id: '1', layer: 'semantic', content: 'memory', trust_score: 0.8, access_count: 3, created_at: '2026-01-01' },
      ];
      vi.mocked(ctx.db.query).mockReturnValue(mockRows);

      const result = await searchDef.handler(ctx, {
        query: 'memory',
        minTrust: 0.7,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRows);
      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('trust_score >= ?'),
        expect.arrayContaining(['%memory%', 0.7, 10]),
      );
      // Should NOT call slmLite.search
      expect(ctx.orchestrator.slmLite.search).not.toHaveBeenCalled();
    });

    it('adds layer filter to DB query when minTrust + layer', async () => {
      vi.mocked(ctx.db.query).mockReturnValue([]);

      await searchDef.handler(ctx, {
        query: 'test',
        minTrust: 0.5,
        layer: 'working',
        limit: 10,
      });

      expect(ctx.db.query).toHaveBeenCalledWith(
        expect.stringContaining('AND layer = ?'),
        expect.arrayContaining(['%test%', 0.5, 'working', 10]),
      );
    });

    it('returns error when search fails', async () => {
      vi.mocked(ctx.orchestrator.slmLite.search).mockRejectedValue(
        new Error('Search engine down'),
      );

      const result = await searchDef.handler(ctx, { query: 'test', limit: 10 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MEMORY_SEARCH_FAILED');
    });

    it('validates query is required', () => {
      const parseResult = searchDef.inputSchema.safeParse({});
      expect(parseResult.success).toBe(false);
    });

    it('validates layer enum', () => {
      const parseResult = searchDef.inputSchema.safeParse({ query: 'x', layer: 'invalid' });
      expect(parseResult.success).toBe(false);
    });

    it('validates limit bounds', () => {
      const tooLow = searchDef.inputSchema.safeParse({ query: 'x', limit: 0 });
      expect(tooLow.success).toBe(false);

      const tooHigh = searchDef.inputSchema.safeParse({ query: 'x', limit: 101 });
      expect(tooHigh.success).toBe(false);
    });
  });

  describe('memory.store', () => {
    let ctx: CommandContext;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('exists with correct metadata', () => {
      expect(storeDef).toBeDefined();
      expect(storeDef.category).toBe('memory');
    });

    it('inserts memory entry into DB and returns id', async () => {
      const result = await storeDef.handler(ctx, {
        content: 'important fact',
        layer: 'semantic',
        source: 'user',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(typeof (result.data as { id: string }).id).toBe('string');
      expect(ctx.db.insert).toHaveBeenCalledWith(
        'memory_entries',
        expect.objectContaining({
          content: 'important fact',
          layer: 'semantic',
          source: 'user',
          trust_score: 0.5,
          access_count: 0,
        }),
      );
    });

    it('serializes metadata to JSON', async () => {
      await storeDef.handler(ctx, {
        content: 'fact',
        layer: 'episodic',
        metadata: { key: 'val' },
        source: 'agent',
      });

      expect(ctx.db.insert).toHaveBeenCalledWith(
        'memory_entries',
        expect.objectContaining({
          metadata: '{"key":"val"}',
        }),
      );
    });

    it('handles null metadata', async () => {
      await storeDef.handler(ctx, {
        content: 'fact',
        layer: 'working',
        source: 'system',
      });

      expect(ctx.db.insert).toHaveBeenCalledWith(
        'memory_entries',
        expect.objectContaining({
          metadata: null,
        }),
      );
    });

    it('returns error when DB insert fails', async () => {
      vi.mocked(ctx.db.insert).mockImplementation(() => {
        throw new Error('DB write failed');
      });

      const result = await storeDef.handler(ctx, {
        content: 'fact',
        layer: 'semantic',
        source: 'user',
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MEMORY_STORE_FAILED');
    });

    it('validates content is required', () => {
      const parseResult = storeDef.inputSchema.safeParse({ layer: 'semantic' });
      expect(parseResult.success).toBe(false);
    });

    it('validates layer is required', () => {
      const parseResult = storeDef.inputSchema.safeParse({ content: 'fact' });
      expect(parseResult.success).toBe(false);
    });

    it('validates layer enum values', () => {
      const parseResult = storeDef.inputSchema.safeParse({
        content: 'fact',
        layer: 'unknown',
      });
      expect(parseResult.success).toBe(false);
    });
  });
});
