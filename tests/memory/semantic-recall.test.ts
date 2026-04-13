/**
 * Qualixar OS -- Semantic Recall Tests
 *
 * Verifies that the embedding-based semantic recall path works when
 * an EmbeddingProvider is available, and that FTS5-only behavior is
 * preserved when embeddings are not configured.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { cosineSimilarity, type EmbeddingProvider } from '../../src/memory/embeddings.js';
import { createTestDb, createTestEventBus } from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Mock Embedding Provider
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic mock embedding provider that generates embeddings
 * based on simple word-bag hashing. This lets us test semantic similarity
 * without real API calls.
 *
 * Strategy: map each word to a dimension index (via hash), set that dimension
 * to 1.0. Semantically similar content shares words => higher cosine similarity.
 */
function createMockEmbeddingProvider(dimensions = 64): EmbeddingProvider {
  function hashWord(word: string): number {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) - h + word.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % dimensions;
  }

  function textToVector(text: string): readonly number[] {
    const vec = new Array<number>(dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      vec[hashWord(word)] += 1.0;
    }
    return vec;
  }

  return {
    isAvailable: () => true,
    getDimensions: () => dimensions,
    generateEmbedding: async (text: string) => textToVector(text),
    generateEmbeddings: async (texts: readonly string[]) =>
      texts.map((t) => textToVector(t)),
  };
}

/**
 * Creates a disabled mock that reports unavailable.
 */
function createDisabledEmbeddingProvider(): EmbeddingProvider {
  return {
    isAvailable: () => false,
    getDimensions: () => 0,
    generateEmbedding: async () => null,
    generateEmbeddings: async () => null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Semantic Recall (embedding-enhanced)', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
  });

  // -----------------------------------------------------------------------
  // Backward compatibility: no embedding provider
  // -----------------------------------------------------------------------

  it('works without embedding provider (backward compatible)', async () => {
    const store = new MemoryStoreImpl(db, eventBus);
    await store.store({
      content: 'machine learning algorithms',
      layer: 'episodic',
      source: 'user',
    });
    const results = await store.recall('learning', { layers: ['episodic'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('works with disabled embedding provider', async () => {
    const provider = createDisabledEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);
    await store.store({
      content: 'neural network training',
      layer: 'episodic',
      source: 'user',
    });
    const results = await store.recall('training', { layers: ['episodic'] });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Embedding caching: store() writes embedding BLOB
  // -----------------------------------------------------------------------

  it('caches embedding BLOB when storing to persistent layer', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    const id = await store.store({
      content: 'quantum computing breakthrough',
      layer: 'semantic',
      source: 'user',
    });

    // Wait for async embedding caching
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify the embedding column is populated
    const row = db.get<{ embedding: Buffer | null }>(
      'SELECT embedding FROM memory_entries WHERE id = ?',
      [id],
    );
    expect(row).toBeDefined();
    expect(row!.embedding).not.toBeNull();
    expect(row!.embedding!.length).toBeGreaterThan(0);
  });

  it('does not cache embedding for working memory', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    const id = await store.store({
      content: 'working memory data',
      layer: 'working',
      source: 'user',
    });

    // Working memory is RAM-only, no DB row
    const row = db.get<{ embedding: Buffer | null }>(
      'SELECT embedding FROM memory_entries WHERE id = ?',
      [id],
    );
    expect(row).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Semantic fallback: find semantically related entries
  // -----------------------------------------------------------------------

  it('finds semantically similar entries when FTS5 yields no results', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    // Store entries with related content
    await store.store({
      content: 'deep learning neural network training',
      layer: 'semantic',
      source: 'user',
    });
    await store.store({
      content: 'supervised machine learning model',
      layer: 'semantic',
      source: 'user',
    });
    await store.store({
      content: 'banana smoothie recipe fruit',
      layer: 'semantic',
      source: 'user',
    });

    // Wait for async embedding caching
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Query using a term that won't match FTS5 but is semantically related
    // "learning" shares vocabulary with entries 1 and 2
    // Use a phrase that FTS5 won't match but embedding similarity will pick up
    const results = await store.recall('artificial intelligence deep network', {
      layers: ['semantic'],
    });

    // Should find the related entries via semantic fallback
    expect(results.length).toBeGreaterThanOrEqual(1);
    // The "deep learning neural network training" entry should rank high
    // because it shares many words with the query
    const hasRelated = results.some((r) =>
      r.content.includes('neural network') || r.content.includes('machine learning'),
    );
    expect(hasRelated).toBe(true);
  });

  it('semantic results exclude entries already found by FTS5', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    // Store one entry that FTS5 will find
    await store.store({
      content: 'kubernetes container orchestration',
      layer: 'episodic',
      source: 'user',
    });

    // Store another that is semantically related but uses different terms
    await store.store({
      content: 'docker container deployment management',
      layer: 'episodic',
      source: 'user',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const results = await store.recall('container', { layers: ['episodic'] });

    // Both should be found (FTS5 finds both because "container" is in both)
    // No duplicates
    const ids = results.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // -----------------------------------------------------------------------
  // Trust score filtering applies to semantic results
  // -----------------------------------------------------------------------

  it('semantic results respect minTrustScore filter', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    const id = await store.store({
      content: 'low trust semantic data about quantum physics',
      layer: 'semantic',
      source: 'user',
    });
    store.updateTrustScore(id, 0.2);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const results = await store.recall('quantum physics theory', {
      layers: ['semantic'],
      minTrustScore: 0.5,
    });

    // Should not include the low-trust entry
    const found = results.find((r) => r.id === id);
    expect(found).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Team ID filtering applies to semantic results
  // -----------------------------------------------------------------------

  it('semantic results respect teamId filter', async () => {
    const provider = createMockEmbeddingProvider();
    const store = new MemoryStoreImpl(db, eventBus, undefined, provider);

    await store.store({
      content: 'team specific architecture design patterns',
      layer: 'semantic',
      source: 'user',
      teamId: 'team-alpha',
    });

    await store.store({
      content: 'different team architecture design systems',
      layer: 'semantic',
      source: 'user',
      teamId: 'team-beta',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const results = await store.recall('software architecture design', {
      layers: ['semantic'],
      teamId: 'team-alpha',
    });

    // Should include team-alpha and null-team entries, not team-beta
    for (const r of results) {
      expect(r.teamId === null || r.teamId === 'team-alpha').toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Embedding column exists after migration
  // -----------------------------------------------------------------------

  it('embedding column exists in memory_entries table', () => {
    const columns = db.db.pragma('table_info(memory_entries)') as readonly {
      readonly name: string;
    }[];
    const hasEmbedding = columns.some((c) => c.name === 'embedding');
    expect(hasEmbedding).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Mock embedding provider produces valid cosine similarity
  // -----------------------------------------------------------------------

  it('mock embedding provider produces meaningful similarity scores', async () => {
    const provider = createMockEmbeddingProvider();

    const vecA = await provider.generateEmbedding('machine learning neural network');
    const vecB = await provider.generateEmbedding('deep learning neural training');
    const vecC = await provider.generateEmbedding('banana smoothie recipe');

    expect(vecA).not.toBeNull();
    expect(vecB).not.toBeNull();
    expect(vecC).not.toBeNull();

    // A and B share words ("learning", "neural") => higher similarity
    const simAB = cosineSimilarity(vecA!, vecB!);
    // A and C share no words => lower similarity
    const simAC = cosineSimilarity(vecA!, vecC!);

    expect(simAB).toBeGreaterThan(simAC);
  });
});
