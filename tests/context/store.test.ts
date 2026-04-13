/**
 * Phase 12 -- Context Store Tests
 * Tests CRUD operations on context_entries using in-memory DB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../src/db/database.js';
import { ContextStore } from '../../src/context/store.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { NewContextEntry } from '../../src/context/store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<NewContextEntry>): NewContextEntry {
  return {
    taskId: overrides?.taskId ?? 'task-1',
    filePath: overrides?.filePath ?? '/docs/readme.md',
    content: overrides?.content ?? '# Hello World',
    format: overrides?.format ?? 'markdown',
    tokens: overrides?.tokens ?? 4,
    chunkIndex: overrides?.chunkIndex ?? 0,
    totalChunks: overrides?.totalChunks ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextStore', () => {
  let db: QosDatabase;
  let store: ContextStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
    store = new ContextStore(db);
  });

  describe('add', () => {
    it('inserts an entry and returns an id', () => {
      const id = store.add(makeEntry());
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('inserts entry with null taskId', () => {
      const id = store.add(makeEntry({ taskId: null }));
      expect(id).toBeDefined();
    });
  });

  describe('list', () => {
    it('returns empty array when no entries exist', () => {
      const entries = store.list();
      expect(entries).toEqual([]);
    });

    it('returns all entries when no taskId filter', () => {
      store.add(makeEntry({ taskId: 'task-1' }));
      store.add(makeEntry({ taskId: 'task-2' }));
      store.add(makeEntry({ taskId: null }));
      const entries = store.list();
      expect(entries).toHaveLength(3);
    });

    it('filters entries by taskId', () => {
      store.add(makeEntry({ taskId: 'task-1' }));
      store.add(makeEntry({ taskId: 'task-2' }));
      store.add(makeEntry({ taskId: 'task-1' }));
      const entries = store.list('task-1');
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.taskId).toBe('task-1');
      }
    });

    it('returns entries with correct fields', () => {
      store.add(makeEntry({
        filePath: '/test.md',
        content: 'Test content',
        format: 'markdown',
        tokens: 3,
        chunkIndex: 0,
        totalChunks: 1,
      }));
      const entries = store.list();
      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry.id).toBeDefined();
      expect(entry.filePath).toBe('/test.md');
      expect(entry.content).toBe('Test content');
      expect(entry.format).toBe('markdown');
      expect(entry.tokens).toBe(3);
      expect(entry.chunkIndex).toBe(0);
      expect(entry.totalChunks).toBe(1);
      expect(entry.createdAt).toBeDefined();
    });
  });

  describe('getTokenCount', () => {
    it('returns 0 when no entries exist', () => {
      expect(store.getTokenCount()).toBe(0);
    });

    it('sums tokens across all entries', () => {
      store.add(makeEntry({ tokens: 100 }));
      store.add(makeEntry({ tokens: 200 }));
      store.add(makeEntry({ tokens: 50 }));
      expect(store.getTokenCount()).toBe(350);
    });

    it('sums tokens filtered by taskId', () => {
      store.add(makeEntry({ taskId: 'task-1', tokens: 100 }));
      store.add(makeEntry({ taskId: 'task-2', tokens: 200 }));
      store.add(makeEntry({ taskId: 'task-1', tokens: 50 }));
      expect(store.getTokenCount('task-1')).toBe(150);
      expect(store.getTokenCount('task-2')).toBe(200);
    });
  });

  describe('clear', () => {
    it('clears all entries when no taskId', () => {
      store.add(makeEntry({ taskId: 'task-1' }));
      store.add(makeEntry({ taskId: 'task-2' }));
      store.clear();
      expect(store.list()).toEqual([]);
    });

    it('clears only entries for specific taskId', () => {
      store.add(makeEntry({ taskId: 'task-1' }));
      store.add(makeEntry({ taskId: 'task-2' }));
      store.clear('task-1');
      const remaining = store.list();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].taskId).toBe('task-2');
    });

    it('is idempotent on empty store', () => {
      store.clear();
      store.clear('nonexistent');
      expect(store.list()).toEqual([]);
    });
  });
});
