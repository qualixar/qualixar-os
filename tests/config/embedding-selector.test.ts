/**
 * Qualixar OS Phase 18 -- Embedding Selector Tests
 * Tests for createEmbeddingSelector(): provider listing, model lookup,
 * test embedding (mocked fetch), config persistence, and timeout handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmbeddingSelector } from '../../src/config/embedding-selector.js';
import type { CredentialStore } from '../../src/types/phase18.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentialStore(apiKey?: string): CredentialStore {
  return {
    store: vi.fn(),
    resolve: vi.fn().mockReturnValue(apiKey),
    list: vi.fn().mockReturnValue([]),
    remove: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(!!apiKey),
  };
}

/** Build a minimal fetch Response object for vi.fn() */
function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbeddingSelector', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1
  it('listEmbeddingProviders() returns only providers that support embeddings', () => {
    const selector = createEmbeddingSelector();
    const configured = new Map([
      ['my-openai', { type: 'openai' }],
      ['my-ollama', { type: 'ollama' }],
    ]);
    const providers = selector.listEmbeddingProviders(configured);
    // Both openai and ollama support embeddings
    expect(providers.length).toBe(2);
    const names = providers.map((p) => p.providerName);
    expect(names).toContain('my-openai');
    expect(names).toContain('my-ollama');
  });

  // Test 2
  it('listEmbeddingProviders() excludes providers that do not support embeddings', () => {
    const selector = createEmbeddingSelector();
    const configured = new Map([
      ['my-anthropic', { type: 'anthropic' }],
      ['my-openai', { type: 'openai' }],
    ]);
    const providers = selector.listEmbeddingProviders(configured);
    // anthropic does NOT support embeddings
    const names = providers.map((p) => p.providerName);
    expect(names).not.toContain('my-anthropic');
    expect(names).toContain('my-openai');
  });

  // Test 3
  it('getModelsForProvider() returns correct models for openai', () => {
    const selector = createEmbeddingSelector();
    const models = selector.getModelsForProvider('openai');
    expect(models.length).toBeGreaterThan(0);
    const modelIds = models.map((m) => m.modelId);
    expect(modelIds).toContain('text-embedding-3-large');
    expect(modelIds).toContain('text-embedding-3-small');
  });

  // Test 4
  it('getModelsForProvider() returns empty array for provider without embeddings (anthropic)', () => {
    const selector = createEmbeddingSelector();
    const models = selector.getModelsForProvider('anthropic');
    expect(models).toHaveLength(0);
  });

  // Test 5
  it('testEmbedding() calls fetch with "hello world" in the body', async () => {
    const selector = createEmbeddingSelector();
    const credStore = makeCredentialStore('sk-test-key');

    // Mock successful OpenAI embeddings response
    const fakeEmbedding = new Array(1536).fill(0.1);
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ data: [{ embedding: fakeEmbedding }] }),
    );

    await selector.testEmbedding('my-openai', 'openai', 'text-embedding-3-small', credStore);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.input).toBe('hello world');
  });

  // Test 6
  it('testEmbedding() returns dimensions and latencyMs on success', async () => {
    const selector = createEmbeddingSelector();
    const credStore = makeCredentialStore('sk-test-key');

    const fakeEmbedding = new Array(1536).fill(0.1);
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ data: [{ embedding: fakeEmbedding }] }),
    );

    const result = await selector.testEmbedding(
      'my-openai',
      'openai',
      'text-embedding-3-small',
      credStore,
    );

    expect(result.success).toBe(true);
    expect(result.dimensions).toBe(1536);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
    expect(result.testedAt).toBeTruthy();
  });

  // Test 7
  it('testEmbedding() returns error on API failure', async () => {
    const selector = createEmbeddingSelector();
    const credStore = makeCredentialStore('sk-test-key');

    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse('Unauthorized', false, 401),
    );

    const result = await selector.testEmbedding(
      'my-openai',
      'openai',
      'text-embedding-3-small',
      credStore,
    );

    expect(result.success).toBe(false);
    expect(result.dimensions).toBeNull();
    expect(result.error).toBeTruthy();
  });

  // Test 8
  it('testEmbedding() returns error when no API key configured (non-ollama)', async () => {
    const selector = createEmbeddingSelector();
    // credentialStore.resolve returns undefined → no key
    const credStore = makeCredentialStore(undefined);

    const result = await selector.testEmbedding(
      'my-openai',
      'openai',
      'text-embedding-3-small',
      credStore,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('API key not configured');
    // fetch should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Test 9
  it('saveEmbeddingConfig() updates the current config', () => {
    const selector = createEmbeddingSelector();
    expect(selector.getCurrentConfig()).toBeNull();

    selector.saveEmbeddingConfig('my-openai', 'text-embedding-3-large', 3072);

    const config = selector.getCurrentConfig();
    expect(config).not.toBeNull();
    expect(config!.provider).toBe('my-openai');
    expect(config!.model).toBe('text-embedding-3-large');
    expect(config!.dimensions).toBe(3072);
  });

  // Test 10
  it('saveEmbeddingConfig() overwrites previous config (acts as event/update)', () => {
    const selector = createEmbeddingSelector();
    selector.saveEmbeddingConfig('provider-a', 'model-a', 768);
    selector.saveEmbeddingConfig('provider-b', 'model-b', 1024);

    const config = selector.getCurrentConfig();
    expect(config!.provider).toBe('provider-b');
    expect(config!.model).toBe('model-b');
    expect(config!.dimensions).toBe(1024);
  });

  // Test 11
  it('getCurrentConfig() returns updated config after save', () => {
    const selector = createEmbeddingSelector();
    const saved = selector.saveEmbeddingConfig('my-ollama', 'nomic-embed-text', 768);
    const current = selector.getCurrentConfig();
    expect(current).toStrictEqual(saved);
    expect(current!.tested).toBe(true);
  });

  // Test 12
  it('testEmbedding() returns error with timeout message on AbortError', async () => {
    const selector = createEmbeddingSelector();
    const credStore = makeCredentialStore('sk-test-key');

    // Simulate AbortError (as thrown when AbortController fires)
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchSpy.mockRejectedValueOnce(abortError);

    const result = await selector.testEmbedding(
      'my-openai',
      'openai',
      'text-embedding-3-small',
      credStore,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});
