/**
 * Qualixar OS Session 15 -- Embedding Tests (C-12)
 *
 * Tests for embedding generation, cosine similarity, and graceful degradation.
 * All tests use mocks — no real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cosineSimilarity,
  createEmbeddingProvider,
  getDefaultEmbeddingConfig,
  type EmbeddingProvider,
  type EmbeddingConfig,
} from '../../src/memory/embeddings.js';

// ---------------------------------------------------------------------------
// Cosine Similarity (pure math — no mocking needed)
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 6);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('handles normalized vectors correctly', () => {
    // 45-degree angle in 2D
    const a = [1, 0];
    const b = [Math.SQRT1_2, Math.SQRT1_2];
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('is symmetric: cos(a, b) === cos(b, a)', () => {
    const a = [3, -1, 2, 7];
    const b = [-2, 4, 1, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('handles large vectors', () => {
    const size = 3072; // text-embedding-3-large dimension
    const a = Array.from({ length: size }, (_, i) => Math.sin(i));
    const b = Array.from({ length: size }, (_, i) => Math.cos(i));
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(-1);
    expect(result).toBeLessThan(1);
  });

  it('returns 1 for scaled versions of same vector', () => {
    const a = [2, 4, 6];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 6);
  });
});

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

describe('getDefaultEmbeddingConfig', () => {
  it('returns azure provider with text-embedding-3-large', () => {
    const config = getDefaultEmbeddingConfig();
    expect(config.provider).toBe('azure');
    expect(config.model).toBe('text-embedding-3-large');
    expect(config.dimensions).toBe(3072);
    expect(config.apiKeyEnv).toBe('AZURE_AI_API_KEY');
  });
});

// ---------------------------------------------------------------------------
// Embedding Provider Factory
// ---------------------------------------------------------------------------

describe('createEmbeddingProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates a provider with default config', () => {
    const provider = createEmbeddingProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.isAvailable).toBe('function');
    expect(typeof provider.generateEmbedding).toBe('function');
    expect(typeof provider.generateEmbeddings).toBe('function');
    expect(typeof provider.getDimensions).toBe('function');
  });

  it('returns null provider for provider=none', () => {
    const provider = createEmbeddingProvider({ provider: 'none' });
    expect(provider.isAvailable()).toBe(false);
    expect(provider.getDimensions()).toBe(0);
  });

  it('returns null provider for provider=local (not yet implemented)', () => {
    const provider = createEmbeddingProvider({ provider: 'local' });
    expect(provider.isAvailable()).toBe(false);
  });

  it('azure provider reports unavailable without API key', () => {
    delete process.env.AZURE_AI_API_KEY;
    const provider = createEmbeddingProvider({
      provider: 'azure',
      apiKeyEnv: 'AZURE_AI_API_KEY',
    });
    expect(provider.isAvailable()).toBe(false);
  });

  it('azure provider reports unavailable without endpoint', () => {
    process.env.AZURE_AI_API_KEY = 'test-key';
    const provider = createEmbeddingProvider({
      provider: 'azure',
      apiKeyEnv: 'AZURE_AI_API_KEY',
      endpoint: '',
    });
    expect(provider.isAvailable()).toBe(false);
  });

  it('azure provider reports available with key and endpoint', () => {
    process.env.AZURE_AI_API_KEY = 'test-key';
    const provider = createEmbeddingProvider({
      provider: 'azure',
      apiKeyEnv: 'AZURE_AI_API_KEY',
      endpoint: 'https://test.cognitiveservices.azure.com',
    });
    expect(provider.isAvailable()).toBe(true);
    expect(provider.getDimensions()).toBe(3072);
  });

  it('openai provider uses AzureEmbeddingProvider internally', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const provider = createEmbeddingProvider({
      provider: 'openai',
      apiKeyEnv: 'OPENAI_API_KEY',
      endpoint: 'https://api.openai.com',
    });
    expect(provider.isAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Null Provider Behavior
// ---------------------------------------------------------------------------

describe('NullEmbeddingProvider', () => {
  it('generateEmbedding returns null', async () => {
    const provider = createEmbeddingProvider({ provider: 'none' });
    const result = await provider.generateEmbedding('test');
    expect(result).toBeNull();
  });

  it('generateEmbeddings returns null', async () => {
    const provider = createEmbeddingProvider({ provider: 'none' });
    const result = await provider.generateEmbeddings(['a', 'b']);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Graceful Degradation
// ---------------------------------------------------------------------------

describe('Graceful degradation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('generateEmbedding returns null when no key configured', async () => {
    delete process.env.AZURE_AI_API_KEY;
    const provider = createEmbeddingProvider({
      provider: 'azure',
      apiKeyEnv: 'AZURE_AI_API_KEY',
      endpoint: 'https://test.cognitiveservices.azure.com',
    });
    const result = await provider.generateEmbedding('test text');
    expect(result).toBeNull();
  });

  it('generateEmbeddings returns null when no key configured', async () => {
    delete process.env.AZURE_AI_API_KEY;
    const provider = createEmbeddingProvider({
      provider: 'azure',
      apiKeyEnv: 'AZURE_AI_API_KEY',
      endpoint: 'https://test.cognitiveservices.azure.com',
    });
    const result = await provider.generateEmbeddings(['a', 'b', 'c']);
    expect(result).toBeNull();
  });
});
