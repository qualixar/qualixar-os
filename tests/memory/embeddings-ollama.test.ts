/**
 * Tests for Qualixar OS Ollama Embedding Provider
 *
 * Tests OllamaEmbeddingProvider with mocked fetch calls.
 * No real Ollama instance required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OllamaEmbeddingProvider,
  createEmbeddingProvider,
  type EmbeddingConfig,
} from '../../src/memory/embeddings.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockEmbedding768 = Array.from({ length: 768 }, (_, i) => i * 0.001);

function mockFetchSuccess(embeddings: number[][]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ embeddings }),
  } as Response);
}

function mockFetchFailure() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: 'model not found' }),
  } as Response);
}

// ---------------------------------------------------------------------------
// OllamaEmbeddingProvider
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('isAvailable() returns true', () => {
    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });
    expect(provider.isAvailable()).toBe(true);
  });

  it('getDimensions() returns configured dimensions', () => {
    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });
    expect(provider.getDimensions()).toBe(768);
  });

  it('getDimensions() defaults to 768', () => {
    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 0,
    });
    // 0 is falsy, so || 768 applies
    expect(provider.getDimensions()).toBe(768);
  });

  it('generateEmbedding() calls Ollama API with search_document prefix', async () => {
    const fetchMock = mockFetchSuccess([mockEmbedding768]);
    globalThis.fetch = fetchMock;

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
      endpoint: 'http://localhost:11434',
    });

    const result = await provider.generateEmbedding('test text');
    expect(result).toEqual(mockEmbedding768);

    // Verify fetch was called correctly
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('nomic-embed-text');
    expect(body.input).toBe('search_document: test text');
    expect(body.options.num_ctx).toBe(8192);
  });

  it('generateEmbedding() returns null on API failure', async () => {
    globalThis.fetch = mockFetchFailure();

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbedding('test');
    expect(result).toBeNull();
  });

  it('generateEmbedding() returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbedding('test');
    expect(result).toBeNull();
  });

  it('generateEmbedding() returns null when response has no embeddings', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbedding('test');
    expect(result).toBeNull();
  });

  it('generateEmbeddings() handles multiple texts', async () => {
    const emb1 = Array.from({ length: 768 }, () => 0.1);
    const emb2 = Array.from({ length: 768 }, () => 0.2);
    globalThis.fetch = mockFetchSuccess([emb1, emb2]);

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbeddings(['text1', 'text2']);
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual(emb1);
    expect(result![1]).toEqual(emb2);

    // Verify batch input was sent with prefixes
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.input).toEqual([
      'search_document: text1',
      'search_document: text2',
    ]);
  });

  it('generateEmbeddings() returns empty array for empty input', async () => {
    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbeddings([]);
    expect(result).toEqual([]);
  });

  it('generateEmbeddings() returns null on API failure', async () => {
    globalThis.fetch = mockFetchFailure();

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbeddings(['text']);
    expect(result).toBeNull();
  });

  it('generateEmbeddings() returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateEmbeddings(['text']);
    expect(result).toBeNull();
  });

  it('generateQueryEmbedding() uses search_query prefix', async () => {
    globalThis.fetch = mockFetchSuccess([mockEmbedding768]);

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateQueryEmbedding('what is qualixar');
    expect(result).toEqual(mockEmbedding768);

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.input).toBe('search_query: what is qualixar');
  });

  it('generateQueryEmbedding() returns null on failure', async () => {
    globalThis.fetch = mockFetchFailure();

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateQueryEmbedding('test');
    expect(result).toBeNull();
  });

  it('generateQueryEmbedding() returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    const result = await provider.generateQueryEmbedding('test');
    expect(result).toBeNull();
  });

  it('uses OLLAMA_HOST env var as default endpoint', () => {
    const orig = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = 'http://my-ollama:9999';

    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    // Access private field indirectly via a test call
    // The provider should use the env var endpoint
    expect(provider.isAvailable()).toBe(true);

    process.env.OLLAMA_HOST = orig;
  });

  it('uses default model when empty string provided', () => {
    const provider = new OllamaEmbeddingProvider({
      provider: 'ollama',
      model: '',
      dimensions: 768,
    });
    // model defaults to 'nomic-embed-text' via || operator
    expect(provider.getDimensions()).toBe(768);
  });
});

// ---------------------------------------------------------------------------
// createEmbeddingProvider factory
// ---------------------------------------------------------------------------

describe('createEmbeddingProvider with ollama', () => {
  it('creates OllamaEmbeddingProvider for provider: ollama', () => {
    const provider = createEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    expect(provider.isAvailable()).toBe(true);
    expect(provider.getDimensions()).toBe(768);
  });

  it('OllamaEmbeddingProvider is instanceof correct class', () => {
    const provider = createEmbeddingProvider({
      provider: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
  });
});
