/**
 * Tests for Code Intelligence Ingester (Layer 2a)
 * Production tests against real project source + wiki.
 */

import { describe, it, expect, vi } from 'vitest';
import { ingestCodeIntel, createHashCache } from '../../src/help/code-intel-ingester.js';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock DocumentIngester
// ---------------------------------------------------------------------------

function createMockIngester() {
  const ingested: { content: string; fileName: string; source: string; metadata: Record<string, unknown> }[] = [];
  return {
    ingested,
    ingester: {
      ingestContent: vi.fn(async (content: string, fileName: string, source: string, options?: { metadata?: Record<string, unknown> }) => {
        ingested.push({ content, fileName, source, metadata: options?.metadata ?? {} });
        return { filePath: source, fileName, chunkCount: 1, totalChars: content.length, estimatedTokens: 100, entryIds: ['test-id'] };
      }),
      ingestDocument: vi.fn(),
      hasEmbeddingProvider: vi.fn(() => false),
    } as any,
  };
}

const PROJECT_ROOT = join(import.meta.dirname, '../../');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('code-intel-ingester', () => {
  describe('ingestCodeIntel', () => {
    it('should ingest wiki pages from code-review-graph', async () => {
      const { ingester, ingested } = createMockIngester();
      const result = await ingestCodeIntel(ingester, PROJECT_ROOT);

      const wikiChunks = ingested.filter((i) => i.metadata.category === 'wiki-community');
      expect(wikiChunks.length).toBeGreaterThan(0);
      expect(result.wikiPages).toBeGreaterThan(0);
    });

    it('should ingest source extracts (events, providers, tools)', async () => {
      const { ingester, ingested } = createMockIngester();
      const result = await ingestCodeIntel(ingester, PROJECT_ROOT);

      expect(result.sourceExtracts).toBeGreaterThan(0);
      const extractChunks = ingested.filter((i) =>
        i.metadata.source === 'qualixar-source-extract',
      );
      expect(extractChunks.length).toBeGreaterThan(0);
    });

    it('should extract event catalog with all event types', async () => {
      const { ingester, ingested } = createMockIngester();
      await ingestCodeIntel(ingester, PROJECT_ROOT);

      const eventCatalog = ingested.find((i) => i.metadata.category === 'event-catalog');
      expect(eventCatalog).toBeDefined();
      expect(eventCatalog!.content).toContain('task:created');
      expect(eventCatalog!.content).toContain('task:failed');
    });

    it('should extract provider catalog with local providers', async () => {
      const { ingester, ingested } = createMockIngester();
      await ingestCodeIntel(ingester, PROJECT_ROOT);

      const providerCatalog = ingested.find((i) => i.metadata.category === 'provider-catalog');
      expect(providerCatalog).toBeDefined();
      expect(providerCatalog!.content).toContain('ollama');
      expect(providerCatalog!.content).toContain('lmstudio');
      expect(providerCatalog!.content).toContain('vllm');
    });

    it('should extract API route reference', async () => {
      const { ingester, ingested } = createMockIngester();
      await ingestCodeIntel(ingester, PROJECT_ROOT);

      const apiCatalog = ingested.find((i) => i.metadata.category === 'api-catalog');
      expect(apiCatalog).toBeDefined();
      expect(apiCatalog!.content).toContain('/api/');
    });

    it('should extract tool categories', async () => {
      const { ingester, ingested } = createMockIngester();
      await ingestCodeIntel(ingester, PROJECT_ROOT);

      const toolCatalog = ingested.find((i) => i.metadata.category === 'tool-catalog');
      expect(toolCatalog).toBeDefined();
      expect(toolCatalog!.content).toContain('web-data');
    });

    it('should tag all chunks with docType code-intel', async () => {
      const { ingester, ingested } = createMockIngester();
      await ingestCodeIntel(ingester, PROJECT_ROOT);

      for (const chunk of ingested) {
        expect(chunk.metadata.docType).toBe('code-intel');
      }
    });

    it('should report wiki page count in result', async () => {
      const { ingester } = createMockIngester();
      const result = await ingestCodeIntel(ingester, PROJECT_ROOT);

      expect(result.totalChunks).toBe(result.wikiPages + result.sourceExtracts);
      expect(result.categories['wiki-community']).toBe(result.wikiPages);
    });
  });

  describe('content-hash caching', () => {
    it('should create an empty hash cache', () => {
      const cache = createHashCache();
      expect(cache.hashes.size).toBe(0);
    });

    it('should skip re-ingestion for cached files on second run', async () => {
      const { ingester } = createMockIngester();
      const cache = createHashCache();

      const result1 = await ingestCodeIntel(ingester, PROJECT_ROOT, cache);
      expect(result1.cached).toBe(0);

      const result2 = await ingestCodeIntel(ingester, PROJECT_ROOT, cache);
      expect(result2.cached).toBeGreaterThan(0);
      // Most chunks cached; only generated extracts (API routes) re-ingest
      expect(result2.totalChunks).toBeLessThan(result1.totalChunks);
    });
  });

  describe('error handling', () => {
    it('should handle missing project root gracefully', async () => {
      const { ingester } = createMockIngester();
      const result = await ingestCodeIntel(ingester, '/nonexistent/path');

      expect(result.totalChunks).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing wiki directory gracefully', async () => {
      const { ingester } = createMockIngester();
      const result = await ingestCodeIntel(ingester, '/tmp');

      expect(result.wikiPages).toBe(0);
      expect(result.errors.some((e) => e.includes('Wiki directory not found'))).toBe(true);
    });
  });
});
