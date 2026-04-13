/**
 * Tests for Qualixar OS Document Ingester
 *
 * Tests document chunking, ingestion from file and content,
 * supported formats, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chunkText, DocumentIngester, createDocumentIngester } from '../../src/memory/document-ingester.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), 'qos-doc-ingester-test-' + Date.now());

function mockMemoryStore() {
  let idCounter = 0;
  return {
    store: vi.fn().mockImplementation(async () => `entry-${++idCounter}`),
    recall: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
    createVersion: vi.fn(),
    updateTrustScore: vi.fn(),
    getByLayer: vi.fn().mockReturnValue([]),
    getByTeamId: vi.fn().mockReturnValue([]),
    archive: vi.fn(),
    getWorkingMemorySnapshot: vi.fn().mockReturnValue([]),
    restoreWorkingMemory: vi.fn(),
    cleanExpired: vi.fn().mockReturnValue(0),
    getStats: vi.fn().mockReturnValue({ totalEntries: 0, byLayer: {}, ramUsageMb: 0 }),
  };
}

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* cleanup best-effort */ }
});

// ---------------------------------------------------------------------------
// chunkText Tests
// ---------------------------------------------------------------------------

describe('chunkText', () => {
  it('chunks text into fixed-size pieces', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const chunks = chunkText(text, 10, 0);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('abcdefghij');
    expect(chunks[1]).toBe('klmnopqrst');
    expect(chunks[2]).toBe('uvwxyz');
  });

  it('supports overlap between chunks', () => {
    const text = 'abcdefghijklmnopqrst'; // 20 chars
    const chunks = chunkText(text, 10, 3);

    expect(chunks.length).toBeGreaterThan(2);
    // Check overlap: chunk 1 ends with chars that chunk 2 starts with
    expect(chunks[0]).toBe('abcdefghij');
    // Next chunk starts at position 7 (10 - 3)
    expect(chunks[1]).toContain('hijklmnopq');
  });

  it('returns empty array for empty text', () => {
    expect(chunkText('', 10, 0)).toEqual([]);
  });

  it('returns single chunk for text smaller than chunk size', () => {
    const chunks = chunkText('short', 100, 0);
    expect(chunks).toEqual(['short']);
  });

  it('handles overlap >= chunkSize by clamping', () => {
    const chunks = chunkText('abcdefghij', 5, 10);
    // Overlap is clamped to floor(5/2) = 2
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('skips empty chunks after trimming', () => {
    const chunks = chunkText('   ', 10, 0);
    expect(chunks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester Tests
// ---------------------------------------------------------------------------

describe('DocumentIngester', () => {
  describe('ingestDocument', () => {
    it('ingests a .txt file', async () => {
      const filePath = join(testDir, 'test.txt');
      writeFileSync(filePath, 'This is test content for ingestion.');

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath);

      expect(result.fileName).toBe('test.txt');
      expect(result.chunkCount).toBeGreaterThan(0);
      expect(result.totalChars).toBe(35);
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(store.store).toHaveBeenCalled();
    });

    it('ingests a .md file', async () => {
      const filePath = join(testDir, 'readme.md');
      writeFileSync(filePath, '# Title\n\nSome markdown content.');

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath);

      expect(result.fileName).toBe('readme.md');
      expect(result.chunkCount).toBeGreaterThan(0);
    });

    it('ingests a .json file', async () => {
      const filePath = join(testDir, 'data.json');
      writeFileSync(filePath, JSON.stringify({ key: 'value', items: [1, 2, 3] }));

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath);

      expect(result.fileName).toBe('data.json');
    });

    it('ingests a .csv file', async () => {
      const filePath = join(testDir, 'data.csv');
      writeFileSync(filePath, 'name,age\nAlice,30\nBob,25');

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath);

      expect(result.fileName).toBe('data.csv');
    });

    it('rejects unsupported file types', async () => {
      const filePath = join(testDir, 'binary.exe');
      writeFileSync(filePath, 'binary content');

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);

      await expect(ingester.ingestDocument(filePath)).rejects.toThrow('Unsupported file type');
    });

    it('stores chunks with correct metadata', async () => {
      const filePath = join(testDir, 'meta.txt');
      writeFileSync(filePath, 'A'.repeat(2500)); // Will create multiple chunks

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      await ingester.ingestDocument(filePath);

      const firstCall = store.store.mock.calls[0][0];
      expect(firstCall.layer).toBe('semantic');
      expect(firstCall.source).toBe('user');
      expect(firstCall.metadata.documentName).toBe('meta.txt');
      expect(firstCall.metadata.chunkIndex).toBe(0);
      expect(firstCall.metadata.ingested).toBe(true);
    });

    it('respects custom chunk size and overlap', async () => {
      const filePath = join(testDir, 'custom.txt');
      writeFileSync(filePath, 'A'.repeat(500));

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath, {
        chunkSize: 100,
        chunkOverlap: 20,
      });

      // 500 chars, 100 chunk, 20 overlap → ceil(500/80) ≈ 7 chunks
      expect(result.chunkCount).toBeGreaterThan(4);
    });

    it('returns entry IDs for all stored chunks', async () => {
      const filePath = join(testDir, 'ids.txt');
      writeFileSync(filePath, 'A'.repeat(3000));

      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestDocument(filePath);

      expect(result.entryIds.length).toBe(result.chunkCount);
      expect(result.entryIds[0]).toMatch(/^entry-/);
    });
  });

  describe('ingestContent', () => {
    it('ingests raw text content', async () => {
      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      const result = await ingester.ingestContent('Hello world content', 'test.txt', 'inline');

      expect(result.fileName).toBe('test.txt');
      expect(result.chunkCount).toBe(1);
      expect(result.totalChars).toBe(19);
    });

    it('passes custom metadata through', async () => {
      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      await ingester.ingestContent('content', 'doc.txt', 'api', {
        metadata: { author: 'Qualixar OS', project: 'test' },
      });

      const storedMeta = store.store.mock.calls[0][0].metadata;
      expect(storedMeta.author).toBe('Qualixar OS');
      expect(storedMeta.project).toBe('test');
    });

    it('uses specified layer', async () => {
      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      await ingester.ingestContent('content', 'doc.txt', 'api', {
        layer: 'procedural',
      });

      expect(store.store.mock.calls[0][0].layer).toBe('procedural');
    });
  });

  describe('hasEmbeddingProvider', () => {
    it('returns false when no provider', () => {
      const store = mockMemoryStore();
      const ingester = new DocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      expect(ingester.hasEmbeddingProvider()).toBe(false);
    });

    it('returns false when provider is not available', () => {
      const store = mockMemoryStore();
      const mockProvider = { isAvailable: () => false, generateEmbedding: vi.fn(), generateEmbeddings: vi.fn(), getDimensions: () => 0 };
      const ingester = new DocumentIngester(
        store as unknown as import('../../src/memory/store.js').MemoryStore,
        mockProvider as unknown as import('../../src/memory/embeddings.js').EmbeddingProvider,
      );
      expect(ingester.hasEmbeddingProvider()).toBe(false);
    });

    it('returns true when provider is available', () => {
      const store = mockMemoryStore();
      const mockProvider = { isAvailable: () => true, generateEmbedding: vi.fn(), generateEmbeddings: vi.fn(), getDimensions: () => 3072 };
      const ingester = new DocumentIngester(
        store as unknown as import('../../src/memory/store.js').MemoryStore,
        mockProvider as unknown as import('../../src/memory/embeddings.js').EmbeddingProvider,
      );
      expect(ingester.hasEmbeddingProvider()).toBe(true);
    });
  });

  describe('createDocumentIngester factory', () => {
    it('creates an ingester instance', () => {
      const store = mockMemoryStore();
      const ingester = createDocumentIngester(store as unknown as import('../../src/memory/store.js').MemoryStore);
      expect(ingester).toBeInstanceOf(DocumentIngester);
    });
  });
});
