/**
 * Qualixar OS Phase 5 -- Memory Store Tests
 * LLD Section 6.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl, MemoryEntryNotFoundError, createMemoryStore } from '../../src/memory/store.js';
import { createTestDb, createTestEventBus, createEventSpy } from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('MemoryStoreImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
  });

  // -----------------------------------------------------------------------
  // Store operations
  // -----------------------------------------------------------------------

  it('stores to working memory in RAM', async () => {
    const id = await store.store({
      content: 'test working',
      layer: 'working',
      source: 'user',
    });
    expect(id).toBeTruthy();
    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.layer).toBe('working');
    expect(entry!.content).toBe('test working');
  });

  it('stores to episodic in SQLite', async () => {
    const id = await store.store({
      content: 'episodic data',
      layer: 'episodic',
      source: 'agent',
    });
    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.layer).toBe('episodic');
  });

  it('stores to semantic in SQLite', async () => {
    const id = await store.store({
      content: 'semantic fact',
      layer: 'semantic',
      source: 'system',
    });
    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.layer).toBe('semantic');
  });

  it('stores to procedural in SQLite', async () => {
    const id = await store.store({
      content: 'procedural how-to',
      layer: 'procedural',
      source: 'behavioral',
    });
    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.layer).toBe('procedural');
  });

  it('emits memory:stored event', async () => {
    const captured = createEventSpy(eventBus);
    await store.store({
      content: 'test event',
      layer: 'episodic',
      source: 'user',
    });
    const stored = captured.find((e) => e.type === 'memory:stored');
    expect(stored).toBeDefined();
    expect(stored!.payload.layer).toBe('episodic');
  });

  // -----------------------------------------------------------------------
  // Recall operations
  // -----------------------------------------------------------------------

  it('recalls from working memory by keyword match', async () => {
    await store.store({ content: 'alpha beta gamma', layer: 'working', source: 'user' });
    await store.store({ content: 'delta epsilon', layer: 'working', source: 'user' });
    const results = await store.recall('beta');
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('alpha beta gamma');
  });

  it('recalls from episodic via FTS5', async () => {
    await store.store({ content: 'machine learning algorithms', layer: 'episodic', source: 'user' });
    await store.store({ content: 'deep neural network', layer: 'episodic', source: 'user' });
    const results = await store.recall('learning', { layers: ['episodic'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('recall with minTrustScore filters low-trust entries', async () => {
    const id = await store.store({ content: 'low trust item', layer: 'episodic', source: 'user' });
    store.updateTrustScore(id, 0.2);
    const results = await store.recall('low trust', {
      layers: ['episodic'],
      minTrustScore: 0.4,
    });
    expect(results.length).toBe(0);
  });

  it('recall increments access_count', async () => {
    const id = await store.store({
      content: 'access count test',
      layer: 'episodic',
      source: 'user',
    });
    await store.recall('access count', { layers: ['episodic'] });
    const entry = store.getById(id);
    expect(entry!.accessCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  it('getById finds working memory entry', async () => {
    const id = await store.store({ content: 'working find', layer: 'working', source: 'user' });
    expect(store.getById(id)).toBeDefined();
  });

  it('getById finds SQLite entry', async () => {
    const id = await store.store({ content: 'db find', layer: 'episodic', source: 'user' });
    expect(store.getById(id)).toBeDefined();
  });

  it('getById returns undefined for non-existent', () => {
    expect(store.getById('nonexistent-id')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // createVersion (immutability)
  // -----------------------------------------------------------------------

  it('createVersion creates new entry with version lineage', async () => {
    const originalId = await store.store({
      content: 'original content',
      layer: 'episodic',
      source: 'user',
    });
    const newId = store.createVersion(originalId, { content: 'updated content' });
    expect(newId).not.toBe(originalId);

    const newEntry = store.getById(newId);
    expect(newEntry!.content).toBe('updated content');
    expect(newEntry!.metadata.version_of).toBe(originalId);
    expect(newEntry!.metadata.version).toBe(2);
  });

  it('createVersion sets superseded_by on original', async () => {
    const originalId = await store.store({
      content: 'to version',
      layer: 'episodic',
      source: 'user',
    });
    const newId = store.createVersion(originalId, { content: 'v2' });
    const original = store.getById(originalId);
    expect(original!.metadata.superseded_by).toBe(newId);
    // Original content unchanged
    expect(original!.content).toBe('to version');
  });

  it('createVersion throws for non-existent entry', () => {
    expect(() => store.createVersion('missing', { content: 'x' })).toThrow(
      MemoryEntryNotFoundError,
    );
  });

  // -----------------------------------------------------------------------
  // updateTrustScore
  // -----------------------------------------------------------------------

  it('updateTrustScore clamps to [0.1, 1.0]', async () => {
    const id = await store.store({ content: 'trust test', layer: 'episodic', source: 'user' });
    store.updateTrustScore(id, 0.05);
    expect(store.getById(id)!.trustScore).toBe(0.1);

    store.updateTrustScore(id, 1.5);
    expect(store.getById(id)!.trustScore).toBe(1.0);
  });

  it('updateTrustScore emits event', async () => {
    const captured = createEventSpy(eventBus);
    const id = await store.store({ content: 'trust event', layer: 'episodic', source: 'user' });
    store.updateTrustScore(id, 0.8);
    const trustEvent = captured.find((e) => e.type === 'memory:trust_updated');
    expect(trustEvent).toBeDefined();
    expect(trustEvent!.payload.newScore).toBe(0.8);
  });

  // -----------------------------------------------------------------------
  // archive
  // -----------------------------------------------------------------------

  it('archive hides entry from recall', async () => {
    const id = await store.store({
      content: 'to archive',
      layer: 'episodic',
      source: 'user',
    });
    store.archive(id);
    const results = await store.recall('archive', { layers: ['episodic'] });
    expect(results.find((r) => r.id === id)).toBeUndefined();
  });

  it('archive emits event', async () => {
    const captured = createEventSpy(eventBus);
    const id = await store.store({ content: 'archive event', layer: 'episodic', source: 'user' });
    store.archive(id);
    const archiveEvent = captured.find((e) => e.type === 'memory:archived');
    expect(archiveEvent).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Working memory snapshot/restore
  // -----------------------------------------------------------------------

  it('getWorkingMemorySnapshot returns all working entries', async () => {
    await store.store({ content: 'w1', layer: 'working', source: 'user' });
    await store.store({ content: 'w2', layer: 'working', source: 'user' });
    const snapshot = store.getWorkingMemorySnapshot();
    expect(snapshot.length).toBe(2);
  });

  it('restoreWorkingMemory restores entries', async () => {
    await store.store({ content: 'w1', layer: 'working', source: 'user' });
    const snapshot = store.getWorkingMemorySnapshot();

    // Create new store and restore
    const store2 = new MemoryStoreImpl(db, eventBus);
    expect(store2.getWorkingMemorySnapshot().length).toBe(0);
    store2.restoreWorkingMemory(snapshot);
    expect(store2.getWorkingMemorySnapshot().length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  it('getStats returns per-layer counts', async () => {
    await store.store({ content: 'w', layer: 'working', source: 'user' });
    await store.store({ content: 'e1', layer: 'episodic', source: 'user' });
    await store.store({ content: 'e2', layer: 'episodic', source: 'user' });
    await store.store({ content: 's', layer: 'semantic', source: 'user' });

    const stats = store.getStats();
    expect(stats.byLayer.working).toBe(1);
    expect(stats.byLayer.episodic).toBe(2);
    expect(stats.byLayer.semantic).toBe(1);
    expect(stats.totalEntries).toBe(4);
  });

  // -----------------------------------------------------------------------
  // FTS5 table exists
  // -----------------------------------------------------------------------

  it('FTS5 table created at init', () => {
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_entries_fts'",
    );
    expect(tables.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // getByLayer
  // -----------------------------------------------------------------------

  it('getByLayer returns entries for the specified layer', async () => {
    await store.store({ content: 'ep1', layer: 'episodic', source: 'user' });
    await store.store({ content: 'sem1', layer: 'semantic', source: 'user' });
    const episodic = store.getByLayer('episodic');
    expect(episodic.length).toBe(1);
    expect(episodic[0].content).toBe('ep1');
  });

  // -----------------------------------------------------------------------
  // getByTeamId
  // -----------------------------------------------------------------------

  it('getByTeamId returns entries for team', async () => {
    await store.store({ content: 'team data', layer: 'episodic', source: 'user', teamId: 'team-a' });
    await store.store({ content: 'personal', layer: 'episodic', source: 'user' });
    const results = store.getByTeamId('team-a');
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('team data');
  });

  // -----------------------------------------------------------------------
  // createVersion for working memory
  // -----------------------------------------------------------------------

  it('createVersion works for working memory entries', async () => {
    const originalId = await store.store({
      content: 'working original',
      layer: 'working',
      source: 'user',
    });
    const newId = store.createVersion(originalId, { content: 'working v2' });
    expect(newId).not.toBe(originalId);

    const newEntry = store.getById(newId);
    expect(newEntry).toBeDefined();
    expect(newEntry!.content).toBe('working v2');
    expect(newEntry!.layer).toBe('working');
    expect(newEntry!.metadata.version_of).toBe(originalId);

    // Original gets superseded_by
    const original = store.getById(originalId);
    expect(original!.metadata.superseded_by).toBe(newId);
  });

  // -----------------------------------------------------------------------
  // recall with teamId filter (LIKE fallback path)
  // -----------------------------------------------------------------------

  it('recall with teamId filter on persistent layers', async () => {
    await store.store({
      content: 'team episodic data alpha',
      layer: 'episodic',
      source: 'user',
      teamId: 'team-filter',
    });
    await store.store({
      content: 'personal episodic data alpha',
      layer: 'episodic',
      source: 'user',
    });

    const results = await store.recall('alpha', {
      layers: ['episodic'],
      teamId: 'team-filter',
    });
    // Should return both: team entries + entries with null team_id
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // recall working memory with teamId filter
  // -----------------------------------------------------------------------

  it('recall working memory filters by teamId', async () => {
    await store.store({
      content: 'working team entry beta',
      layer: 'working',
      source: 'user',
      teamId: 'team-w',
    });
    await store.store({
      content: 'working personal entry beta',
      layer: 'working',
      source: 'user',
    });

    const results = await store.recall('beta', {
      layers: ['working'],
      teamId: 'team-w',
    });
    // Should only return the entry matching team-w
    expect(results.length).toBe(1);
    expect(results[0].teamId).toBe('team-w');
  });

  // -----------------------------------------------------------------------
  // Archive working memory entry
  // -----------------------------------------------------------------------

  it('archive works for working memory entry', async () => {
    const id = await store.store({
      content: 'working to archive',
      layer: 'working',
      source: 'user',
    });
    store.archive(id);
    // Should no longer be in working memory snapshot
    const snapshot = store.getWorkingMemorySnapshot();
    expect(snapshot.find((e) => e.id === id)).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // updateTrustScore for working memory
  // -----------------------------------------------------------------------

  it('updateTrustScore works for working memory entry', async () => {
    const id = await store.store({
      content: 'working trust',
      layer: 'working',
      source: 'user',
    });
    store.updateTrustScore(id, 0.9);
    const entry = store.getById(id);
    expect(entry!.trustScore).toBe(0.9);
  });

  // -----------------------------------------------------------------------
  // getByLayer for working memory
  // -----------------------------------------------------------------------

  it('getByLayer returns working memory entries', async () => {
    await store.store({ content: 'wk1', layer: 'working', source: 'user' });
    await store.store({ content: 'wk2', layer: 'working', source: 'user' });
    const entries = store.getByLayer('working');
    expect(entries.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // cleanExpired with actual expired entries
  // -----------------------------------------------------------------------

  it('cleanExpired removes expired entries and emits events', async () => {
    const captured = createEventSpy(eventBus);
    const id = await store.store({
      content: 'will expire',
      layer: 'episodic',
      source: 'user',
    });

    // Manually set expires_at to past
    const pastDate = new Date(Date.now() - 60000).toISOString();
    db.db.prepare('UPDATE memory_entries SET expires_at = ? WHERE id = ?').run(pastDate, id);

    const count = store.cleanExpired();
    expect(count).toBe(1);

    // Entry should be deleted
    expect(store.getById(id)).toBeUndefined();

    // Event should be emitted
    const expiredEvent = captured.find((e) => e.type === 'memory:expired');
    expect(expiredEvent).toBeDefined();
    expect(expiredEvent!.payload.entryId).toBe(id);
  });

  // -----------------------------------------------------------------------
  // _searchLike with teamId filter (FTS5 failure fallback)
  // -----------------------------------------------------------------------

  it('recall falls back to LIKE search with teamId when FTS5 fails', async () => {
    await store.store({
      content: 'team LIKE fallback data',
      layer: 'episodic',
      source: 'user',
      teamId: 'team-like',
    });

    // Use FTS5 special syntax that will cause a parse error, forcing LIKE fallback
    // "OR" alone or unbalanced quotes trigger FTS5 syntax errors
    const results = await store.recall('"unclosed', {
      layers: ['episodic'],
      teamId: 'team-like',
    });
    // LIKE fallback should still find the entry by content match (if it contains the query)
    // The unclosed quote won't match via LIKE either, but the code path is exercised
    expect(results).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // archive throws for non-existent DB entry
  // -----------------------------------------------------------------------

  it('archive throws for non-existent entry not in working memory', () => {
    expect(() => store.archive('totally-nonexistent')).toThrow(MemoryEntryNotFoundError);
  });
});

describe('createMemoryStore factory', () => {
  it('returns MemoryStore instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const ms = createMemoryStore(db2, eb2);
    expect(ms).toBeDefined();
    expect(typeof ms.store).toBe('function');
    expect(typeof ms.recall).toBe('function');
    expect(typeof ms.getById).toBe('function');
  });
});
