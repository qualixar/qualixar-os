/**
 * Model Discovery Tests
 *
 * Tests provider-aware model discovery and strategy-based selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createModelDiscovery,
  type ModelDiscovery,
  type DiscoveredModel,
} from '../../src/router/model-discovery.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Discovery Tests
// ---------------------------------------------------------------------------

describe('ModelDiscovery', () => {
  it('discovers Azure models via /openai/models', async () => {
    process.env.TEST_AZURE_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4.1' },
          { id: 'gpt-4.1-mini' },
          { id: 'text-embedding-3-large' }, // Should be filtered (embedding)
          { id: 'whisper-001' }, // Should be filtered
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      azure: { type: 'azure-openai', endpoint: 'https://test.azure.com', api_key_env: 'TEST_AZURE_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models.length).toBe(2); // Only chat models
    expect(result.models[0].provider).toBe('azure');
    expect(result.models.find((m) => m.name === 'gpt-4.1')).toBeDefined();
    expect(result.models.find((m) => m.name === 'text-embedding-3-large')).toBeUndefined();

    delete process.env.TEST_AZURE_KEY;
  });

  it('discovers OpenAI models via /v1/models', async () => {
    process.env.TEST_OAI_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4.1' },
          { id: 'gpt-4.1-mini' },
          { id: 'dall-e-3' }, // Filtered
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openai: { type: 'openai', api_key_env: 'TEST_OAI_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models.length).toBe(2);
    expect(result.providers).toContain('openai');

    delete process.env.TEST_OAI_KEY;
  });

  it('discovers Ollama models via /api/tags', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'llama3:latest', size: 4000000000 },
          { name: 'mistral:latest', size: 4000000000 },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      ollama: { type: 'ollama', endpoint: 'http://localhost:11434' },
    });

    const result = await discovery.discover();

    expect(result.models.length).toBe(2);
    expect(result.models[0].name).toBe('ollama/llama3:latest');
    expect(result.models[0].costPerInputToken).toBe(0); // Local = free
  });

  it('uses static list for Anthropic (no models API)', async () => {
    process.env.TEST_ANT_KEY = 'test-key';

    const discovery = createModelDiscovery({
      anthropic: { type: 'anthropic', api_key_env: 'TEST_ANT_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models.length).toBe(3);
    expect(result.models.map((m) => m.name)).toContain('claude-sonnet-4-6');

    delete process.env.TEST_ANT_KEY;
  });

  it('handles provider discovery failure gracefully', async () => {
    process.env.TEST_KEY = 'test';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const discovery = createModelDiscovery({
      openai: { type: 'openai', api_key_env: 'TEST_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Network error');

    delete process.env.TEST_KEY;
  });

  it('discovers from multiple providers simultaneously', async () => {
    process.env.TEST_ANT = 'key';
    process.env.TEST_OAI = 'key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4.1' }] }),
    } as Response);

    const discovery = createModelDiscovery({
      anthropic: { type: 'anthropic', api_key_env: 'TEST_ANT' },
      openai: { type: 'openai', api_key_env: 'TEST_OAI' },
    });

    const result = await discovery.discover();

    expect(result.providers).toHaveLength(2);
    // Anthropic (3 static) + OpenAI (1 discovered)
    expect(result.models.length).toBe(4);

    delete process.env.TEST_ANT;
    delete process.env.TEST_OAI;
  });

  it('skips providers with no API key set', async () => {
    const discovery = createModelDiscovery({
      openai: { type: 'openai', api_key_env: 'NONEXISTENT_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(0);
  });

  it('deduplicates models by name', async () => {
    process.env.TEST_K1 = 'key';
    process.env.TEST_K2 = 'key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4.1' }] }),
    } as Response);

    const discovery = createModelDiscovery({
      openai: { type: 'openai', api_key_env: 'TEST_K1' },
      azure: { type: 'azure-openai', endpoint: 'https://x.com', api_key_env: 'TEST_K2' },
    });

    const result = await discovery.discover();

    const gpt41Count = result.models.filter((m) => m.name === 'gpt-4.1').length;
    expect(gpt41Count).toBe(1); // Deduplicated

    delete process.env.TEST_K1;
    delete process.env.TEST_K2;
  });
});

// ---------------------------------------------------------------------------
// OpenRouter Discovery Tests
// ---------------------------------------------------------------------------

describe('OpenRouter Discovery', () => {
  it('handles empty response from OpenRouter', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    delete process.env.TEST_OR_KEY;
  });

  it('maps pricing correctly from OpenRouter API response', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openai/gpt-4.1',
            pricing: { prompt: '0.000002', completion: '0.000008' },
            context_length: 128000,
          },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(1);
    const model = result.models[0];
    expect(model.costPerInputToken).toBe(0.000002);
    expect(model.costPerOutputToken).toBe(0.000008);
    expect(model.maxTokens).toBe(128000);
    expect(model.provider).toBe('openrouter');
    expect(model.source).toBe('discovered');

    delete process.env.TEST_OR_KEY;
  });

  it('filters non-chat models from OpenRouter', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/gpt-4.1', pricing: { prompt: '0.000002', completion: '0.000008' }, context_length: 128000 },
          { id: 'openai/text-embedding-3-large', pricing: { prompt: '0.0000001', completion: '0' }, context_length: 8192 },
          { id: 'openai/tts-1', pricing: { prompt: '0.000015', completion: '0' }, context_length: 4096 },
          { id: 'openai/dall-e-3', pricing: { prompt: '0.00004', completion: '0' }, context_length: 4096 },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(1);
    expect(result.models[0].name).toBe('gpt-4.1');

    delete process.env.TEST_OR_KEY;
  });

  it('filters beta/preview models but keeps major ones like gpt-5', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/gpt-5-preview', pricing: { prompt: '0.000003', completion: '0.000012' }, context_length: 200000 },
          { id: 'mistralai/mistral-small-beta', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 32000 },
          { id: 'anthropic/claude-sonnet-4-6', pricing: { prompt: '0.000003', completion: '0.000015' }, context_length: 200000 },
          { id: 'some-lab/random-model-preview', pricing: { prompt: '0.0000005', completion: '0.000002' }, context_length: 8192 },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    const names = result.models.map((m) => m.name);
    // gpt-5-preview kept (major model), claude kept (major), mistral-small-beta filtered, random-model-preview filtered
    expect(names).toContain('gpt-5-preview');
    expect(names).toContain('claude-sonnet-4-6');
    expect(names).not.toContain('mistral-small-beta');
    expect(names).not.toContain('random-model-preview');

    delete process.env.TEST_OR_KEY;
  });

  it('maps OpenRouter id format to cleaner routing name', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/gpt-4.1', pricing: { prompt: '0.000002', completion: '0.000008' }, context_length: 128000 },
          { id: 'anthropic/claude-opus-4-6', pricing: { prompt: '0.000015', completion: '0.000075' }, context_length: 200000 },
          { id: 'deepseek/deepseek-v3', pricing: { prompt: '0.00000027', completion: '0.0000011' }, context_length: 64000 },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    const names = result.models.map((m) => m.name);
    expect(names).toContain('gpt-4.1');
    expect(names).toContain('claude-opus-4-6');
    expect(names).toContain('deepseek-v3');
    // Should NOT contain provider prefix
    expect(names).not.toContain('openai/gpt-4.1');

    delete process.env.TEST_OR_KEY;
  });

  it('uses default pricing when pricing field is missing', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'meta/llama-3.1-70b', context_length: 131072 },
        ],
      }),
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(1);
    expect(result.models[0].costPerInputToken).toBe(0.000001);
    expect(result.models[0].costPerOutputToken).toBe(0.000004);

    delete process.env.TEST_OR_KEY;
  });

  it('returns empty array when OpenRouter API returns non-ok status', async () => {
    process.env.TEST_OR_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const discovery = createModelDiscovery({
      openrouter: { type: 'openrouter', api_key_env: 'TEST_OR_KEY' },
    });

    const result = await discovery.discover();

    expect(result.models).toHaveLength(0);

    delete process.env.TEST_OR_KEY;
  });
});

// ---------------------------------------------------------------------------
// Strategy Selection Tests
// ---------------------------------------------------------------------------

describe('ModelDiscovery.selectModel', () => {
  const MODELS: readonly DiscoveredModel[] = [
    { name: 'gpt-4.1', provider: 'openai', qualityScore: 0.93, costPerInputToken: 0.000002, costPerOutputToken: 0.000008, maxTokens: 32768, available: true, source: 'discovered' },
    { name: 'gpt-4.1-mini', provider: 'openai', qualityScore: 0.85, costPerInputToken: 0.0000004, costPerOutputToken: 0.0000016, maxTokens: 16384, available: true, source: 'discovered' },
    { name: 'claude-opus-4-6', provider: 'anthropic', qualityScore: 0.98, costPerInputToken: 0.000015, costPerOutputToken: 0.000075, maxTokens: 32000, available: true, source: 'static' },
    { name: 'deepseek-v3', provider: 'deepseek', qualityScore: 0.85, costPerInputToken: 0.00000027, costPerOutputToken: 0.0000011, maxTokens: 8192, available: true, source: 'static' },
  ];

  let discovery: ModelDiscovery;

  beforeEach(() => {
    discovery = createModelDiscovery({});
  });

  it('quality mode selects highest quality model', () => {
    const model = discovery.selectModel('quality', MODELS);
    expect(model?.name).toBe('claude-opus-4-6'); // 0.98
  });

  it('cost mode selects cheapest model', () => {
    const model = discovery.selectModel('cost', MODELS);
    expect(model?.name).toBe('deepseek-v3'); // cheapest per token
  });

  it('balanced mode selects best quality/cost ratio', () => {
    const model = discovery.selectModel('balanced', MODELS);
    // gpt-4.1-mini or deepseek-v3 — both have good ratio
    expect(model).toBeDefined();
    expect(model!.qualityScore).toBeGreaterThan(0.7);
  });

  it('returns null when no models available', () => {
    const model = discovery.selectModel('quality', []);
    expect(model).toBeNull();
  });

  it('filters out unavailable models', () => {
    const withUnavailable = [
      ...MODELS,
      { name: 'broken', provider: 'x', qualityScore: 1.0, costPerInputToken: 0, costPerOutputToken: 0, maxTokens: 999, available: false, source: 'fallback' as const },
    ];
    const model = discovery.selectModel('quality', withUnavailable);
    expect(model?.name).not.toBe('broken');
  });
});
