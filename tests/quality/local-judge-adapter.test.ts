/**
 * Qualixar OS Phase 3 -- Local Judge Adapter Tests
 * TDD Sequence #9: Mock HTTP, tests request formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLocalJudgeAdapter, adaptConfigManager } from '../../src/quality/local-judge-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(local?: string) {
  return {
    getConfig: () => ({
      models: { local },
    }),
  };
}

describe('LocalJudgeAdapter', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // isAvailable
  // -------------------------------------------------------------------------

  it('returns false when not configured', async () => {
    const adapter = createLocalJudgeAdapter(makeConfig(undefined));
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });

  it('returns false when configured with empty string', async () => {
    const adapter = createLocalJudgeAdapter(makeConfig(''));
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });

  it('returns true after successful health check', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    const available = await adapter.isAvailable();
    expect(available).toBe(true);
  });

  it('returns false when health check fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });

  it('caches availability after first successful check', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    globalThis.fetch = mockFetch;

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    await adapter.isAvailable();
    await adapter.isAvailable();

    // fetch only called once for health check, second call returns cached
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // evaluate
  // -------------------------------------------------------------------------

  it('throws when not available', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    await expect(
      adapter.evaluate({
        taskId: 'task-1',
        prompt: 'Write hello world',
        output: 'print("hello")',
        round: 1,
      }),
    ).rejects.toThrow('Local judge adapter is not available');
  });

  it('formats correct OpenAI API request and parses response', async () => {
    const judgeResponse = {
      verdict: 'approve',
      score: 0.85,
      feedback: 'Good output',
      issues: [],
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify(judgeResponse),
                },
              },
            ],
          }),
        text: () => Promise.resolve(''),
      });

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    const result = await adapter.evaluate({
      taskId: 'task-1',
      prompt: 'Write hello world',
      output: 'print("hello")',
      round: 1,
    });

    expect(result.judgeModel).toBe('local:bitnet-3b');
    expect(result.verdict).toBe('approve');
    expect(result.score).toBeCloseTo(0.85);
    expect(result.feedback).toBe('Good output');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles non-JSON response gracefully', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: 'This is not JSON',
                },
              },
            ],
          }),
        text: () => Promise.resolve(''),
      });

    const adapter = createLocalJudgeAdapter(
      makeConfig('bitnet-3b@localhost:8000'),
    );
    const result = await adapter.evaluate({
      taskId: 'task-2',
      prompt: 'test',
      output: 'test output',
      round: 1,
    });

    expect(result.verdict).toBe('revise');
    expect(result.score).toBeCloseTo(0.3);
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    await expect(
      adapter.evaluate({
        taskId: 'task-3',
        prompt: 'test',
        output: 'test',
        round: 1,
      }),
    ).rejects.toThrow('Local judge HTTP 500');
  });

  it('clamps score to [0, 1]', async () => {
    const judgeResponse = {
      verdict: 'approve',
      score: 1.5,
      feedback: 'Great',
      issues: [],
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: JSON.stringify(judgeResponse) } },
            ],
          }),
        text: () => Promise.resolve(''),
      });

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    const result = await adapter.evaluate({
      taskId: 'task-4',
      prompt: 'test',
      output: 'test',
      round: 1,
    });

    expect(result.score).toBe(1.0);
  });

  it('parses model@host:port config format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const adapter = createLocalJudgeAdapter(
      makeConfig('my-model@192.168.1.100:9000'),
    );
    const available = await adapter.isAvailable();
    expect(available).toBe(true);

    // Check that fetch was called with the correct endpoint
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://192.168.1.100:9000/v1/models',
      expect.any(Object),
    );
  });

  it('returns false when health check returns non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const adapter = createLocalJudgeAdapter(makeConfig('bitnet-3b'));
    const available = await adapter.isAvailable();
    expect(available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// adaptConfigManager
// ---------------------------------------------------------------------------

describe('adaptConfigManager', () => {
  it('adapts a config manager to LocalJudgeConfigProvider interface', () => {
    const cm = {
      get: () => ({ models: { local: 'bitnet-3b@localhost:8000' } }),
    };
    const provider = adaptConfigManager(cm);
    expect(provider).toBeDefined();
    expect(provider.getConfig().models.local).toBe('bitnet-3b@localhost:8000');
  });

  it('adapts config manager without local model configured', () => {
    const cm = {
      get: () => ({ models: {} }),
    };
    const provider = adaptConfigManager(cm);
    expect(provider.getConfig().models.local).toBeUndefined();
  });
});
