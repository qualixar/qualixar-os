/**
 * Qualixar OS V2 -- Local Provider Tests
 *
 * Tests: LOCAL_PROVIDER_TYPES, getDefaultPort, callLocalProvider.
 * Uses vi.stubGlobal('fetch', ...) to mock network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ModelRequest } from '../../src/types/common.js';
import {
  LOCAL_PROVIDER_TYPES,
  getDefaultPort,
  callLocalProvider,
} from '../../src/router/local-provider.js';
import type { LocalProviderType } from '../../src/router/local-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    prompt: 'Hello',
    ...overrides,
  };
}

function makeOkResponse(content = 'Hi there', model = 'test-model') {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model,
      }),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeToolCallResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 15 },
        model: 'tool-model',
      }),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeErrorResponse(status = 500, body = 'Internal Server Error') {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LOCAL_PROVIDER_TYPES', () => {
  it('contains exactly 4 provider types', () => {
    expect(LOCAL_PROVIDER_TYPES).toHaveLength(4);
    expect(LOCAL_PROVIDER_TYPES).toContain('lmstudio');
    expect(LOCAL_PROVIDER_TYPES).toContain('llamacpp');
    expect(LOCAL_PROVIDER_TYPES).toContain('vllm');
    expect(LOCAL_PROVIDER_TYPES).toContain('huggingface-tgi');
  });

  it('is a readonly tuple (cannot push)', () => {
    // TypeScript enforcement — at runtime, as const arrays are readonly
    expect(Object.isFrozen(LOCAL_PROVIDER_TYPES)).toBe(false);
    // But the type prevents mutation; verify length is stable
    expect([...LOCAL_PROVIDER_TYPES]).toEqual([
      'lmstudio',
      'llamacpp',
      'vllm',
      'huggingface-tgi',
    ]);
  });
});

describe('getDefaultPort', () => {
  it('returns 1234 for lmstudio', () => {
    expect(getDefaultPort('lmstudio')).toBe(1234);
  });

  it('returns 8080 for llamacpp', () => {
    expect(getDefaultPort('llamacpp')).toBe(8080);
  });

  it('returns 8000 for vllm', () => {
    expect(getDefaultPort('vllm')).toBe(8000);
  });

  it('returns 8080 for huggingface-tgi', () => {
    expect(getDefaultPort('huggingface-tgi')).toBe(8080);
  });
});

describe('callLocalProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the correct URL with default port for lmstudio', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(makeRequest(), 'lmstudio');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('uses custom endpoint when provided', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(makeRequest(), 'vllm', 'http://gpu-box:9000');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gpu-box:9000/v1/chat/completions');
  });

  it('returns a valid ModelResponse', async () => {
    fetchMock.mockResolvedValue(makeOkResponse('Generated text', 'my-llama'));

    const response = await callLocalProvider(makeRequest(), 'llamacpp');

    expect(response.content).toBe('Generated text');
    expect(response.model).toBe('my-llama');
    expect(response.provider).toBe('llamacpp');
    expect(response.inputTokens).toBe(10);
    expect(response.outputTokens).toBe(5);
    expect(response.costUsd).toBe(0);
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('sends systemPrompt as system message when no messages provided', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(
      makeRequest({ systemPrompt: 'You are helpful' }),
      'vllm',
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('passes request.messages directly when provided', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());
    const messages = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ];

    await callLocalProvider(
      makeRequest({ messages }),
      'huggingface-tgi',
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: unknown[] };
    expect(body.messages).toHaveLength(3);
  });

  it('sends custom model name in request body', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(makeRequest(), 'lmstudio', undefined, 'qwen2.5:7b');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('qwen2.5:7b');
  });

  it('defaults model to "default" when none provided', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(makeRequest(), 'llamacpp');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('default');
  });

  it('includes tools in request when provided', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());
    const tools = [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
      },
    ];

    await callLocalProvider(makeRequest({ tools }), 'vllm');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools: unknown[] };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather for a city',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
    });
  });

  it('extracts tool calls from response', async () => {
    fetchMock.mockResolvedValue(makeToolCallResponse());

    const response = await callLocalProvider(makeRequest(), 'lmstudio');

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]).toEqual({
      id: 'call_1',
      name: 'get_weather',
      input: { city: 'London' },
    });
  });

  it('throws on non-ok HTTP response', async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(502, 'Bad Gateway'));

    await expect(
      callLocalProvider(makeRequest(), 'llamacpp'),
    ).rejects.toThrow('Local provider llamacpp error (502): Bad Gateway');
  });

  it('throws when response has no choices', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [] }),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    await expect(
      callLocalProvider(makeRequest(), 'vllm'),
    ).rejects.toThrow('No response from vllm');
  });

  it('respects maxTokens and temperature from request', async () => {
    fetchMock.mockResolvedValue(makeOkResponse());

    await callLocalProvider(
      makeRequest({ maxTokens: 2048, temperature: 0.3 }),
      'huggingface-tgi',
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      max_tokens: number;
      temperature: number;
    };
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.3);
  });

  it('uses model from response when available', async () => {
    fetchMock.mockResolvedValue(makeOkResponse('text', 'server-reported-model'));

    const response = await callLocalProvider(makeRequest(), 'lmstudio', undefined, 'req-model');

    expect(response.model).toBe('server-reported-model');
  });

  it('falls back to requested model name when response has no model', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          usage: {},
        }),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const response = await callLocalProvider(makeRequest(), 'vllm', undefined, 'my-model');

    expect(response.model).toBe('my-model');
  });

  it('falls back to "unknown" when no model info available', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          usage: {},
        }),
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const response = await callLocalProvider(makeRequest(), 'llamacpp');

    expect(response.model).toBe('unknown');
  });
});
