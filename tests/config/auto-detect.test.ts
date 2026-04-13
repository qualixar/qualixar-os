/**
 * Qualixar OS V2 -- Auto-Detect Tests
 *
 * Tests: detectLocalProviders with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectLocalProviders } from '../../src/config/auto-detect.js';
import type { DetectedProvider } from '../../src/config/auto-detect.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModelsResponse(models: string[], isOllama = false) {
  if (isOllama) {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models: models.map((name) => ({ name })) }),
    } as unknown as Response;
  }
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: models.map((id) => ({ id })) }),
  } as unknown as Response;
}

function makeHealthOk() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

function makeHealthFail() {
  return {
    ok: false,
    status: 503,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectLocalProviders', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when no servers are running', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'));

    const result = await detectLocalProviders(500);

    expect(result).toEqual([]);
  });

  it('detects a single running Ollama server', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://localhost:11434/api/tags') {
        return Promise.resolve(makeModelsResponse(['llama3:latest', 'mistral:latest'], true));
      }
      // All other ports fail
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'ollama',
      port: 11434,
      endpoint: 'http://localhost:11434',
      models: ['llama3:latest', 'mistral:latest'],
      healthy: true,
    });
  });

  it('detects LM Studio on port 1234', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://localhost:1234/v1/models') {
        return Promise.resolve(
          makeModelsResponse(['TheBloke/Llama-2-7B-GGUF', 'lmstudio-community/qwen2.5']),
        );
      }
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('lmstudio');
    expect(result[0]!.port).toBe(1234);
    expect(result[0]!.models).toEqual([
      'TheBloke/Llama-2-7B-GGUF',
      'lmstudio-community/qwen2.5',
    ]);
  });

  it('detects multiple servers simultaneously', async () => {
    fetchMock.mockImplementation((url: string) => {
      // Ollama health + models
      if (url === 'http://localhost:11434/api/tags') {
        return Promise.resolve(makeModelsResponse(['llama3'], true));
      }
      // LM Studio health + models (same endpoint)
      if (url === 'http://localhost:1234/v1/models') {
        return Promise.resolve(makeModelsResponse(['qwen2.5']));
      }
      // vLLM health
      if (url === 'http://localhost:8000/health') {
        return Promise.resolve(makeHealthOk());
      }
      // vLLM models
      if (url === 'http://localhost:8000/v1/models') {
        return Promise.resolve(makeModelsResponse(['meta-llama/Llama-3-8B']));
      }
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(3);
    const types = result.map((r) => r.type);
    expect(types).toContain('ollama');
    expect(types).toContain('lmstudio');
    expect(types).toContain('vllm');
  });

  it('handles partial failures gracefully (some ports up, some down)', async () => {
    fetchMock.mockImplementation((url: string) => {
      // Only vLLM is up
      if (url === 'http://localhost:8000/health') {
        return Promise.resolve(makeHealthOk());
      }
      if (url === 'http://localhost:8000/v1/models') {
        return Promise.resolve(makeModelsResponse(['llama3']));
      }
      // Ollama returns 503
      if (url === 'http://localhost:11434/api/tags') {
        return Promise.resolve(makeHealthFail());
      }
      // Others reject
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('vllm');
  });

  it('detects server even when models endpoint fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      // llama.cpp health succeeds
      if (url === 'http://localhost:8080/health') {
        return Promise.resolve(makeHealthOk());
      }
      // llama.cpp models fails
      if (url === 'http://localhost:8080/v1/models') {
        return Promise.reject(new Error('Not supported'));
      }
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('llamacpp');
    expect(result[0]!.models).toEqual([]);
    expect(result[0]!.healthy).toBe(true);
  });

  it('all providers report healthy: true when detected', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('11434')) {
        return Promise.resolve(makeModelsResponse([], true));
      }
      if (url.includes('1234')) {
        return Promise.resolve(makeModelsResponse([]));
      }
      if (url.includes(':8000')) {
        if (url.includes('/health')) return Promise.resolve(makeHealthOk());
        return Promise.resolve(makeModelsResponse([]));
      }
      if (url.includes(':8080')) {
        if (url.includes('/health')) return Promise.resolve(makeHealthOk());
        return Promise.resolve(makeModelsResponse([]));
      }
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);

    expect(result).toHaveLength(4);
    for (const provider of result) {
      expect(provider.healthy).toBe(true);
    }
  });

  it('returns immutable DetectedProvider objects', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://localhost:8000/health') {
        return Promise.resolve(makeHealthOk());
      }
      if (url === 'http://localhost:8000/v1/models') {
        return Promise.resolve(makeModelsResponse(['model-a']));
      }
      return Promise.reject(new Error('Connection refused'));
    });

    const result = await detectLocalProviders(500);
    const provider = result[0] as DetectedProvider;

    // Verify shape
    expect(provider.type).toBe('vllm');
    expect(provider.port).toBe(8000);
    expect(provider.endpoint).toBe('http://localhost:8000');
    expect(provider.models).toEqual(['model-a']);
    expect(provider.healthy).toBe(true);
  });
});
