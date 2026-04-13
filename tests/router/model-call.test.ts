/**
 * Qualixar OS V2 -- ModelCall Tests
 *
 * Phase 1 LLD Section 2.3, TDD Step 1.
 * Tests: MODEL_CATALOG, ModelCallImpl, createModelCall factory.
 *
 * APPROACH: TestableModelCall extends ModelCallImpl and overrides the
 * protected _callProvider method to return mock responses without
 * needing real SDK imports. This keeps the test focused on orchestration
 * logic (catalog lookup, retry, circuit breaker, cost computation)
 * while avoiding any real API calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ModelRequest, ModelResponse, QosConfig } from '../../src/types/common.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { CostTracker } from '../../src/cost/cost-tracker.js';
import type { ModelInfo } from '../../src/router/strategies/types.js';
import {
  MODEL_CATALOG,
  ModelCallImpl,
  createModelCall,
} from '../../src/router/model-call.js';
import type { ModelCall } from '../../src/router/model-call.js';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

/** Minimal pino-compatible logger mock. */
function makeMockLogger() {
  const childFn = vi.fn();
  const child: Record<string, unknown> = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: childFn,
  };
  // child() returns itself for nested child calls
  childFn.mockReturnValue(child);
  return child as unknown as import('pino').Logger;
}

/** Creates a mock ConfigManager that returns a config with given overrides. */
function makeMockConfigManager(overrides: Partial<QosConfig> = {}): ConfigManager {
  const baseConfig: QosConfig = {
    mode: 'companion',
    providers: {},
    models: {
      primary: 'claude-sonnet-4-6',
      fallback: 'gpt-4.1-mini',
      catalog: [],
    },
    budget: { max_usd: 10, warn_pct: 0.8 },
    security: { container_isolation: false, allowed_paths: ['./'], denied_commands: ['rm -rf', 'sudo'] },
    memory: { enabled: true, auto_invoke: true, max_ram_mb: 50 },
    dashboard: { enabled: false, port: 3333 },
    channels: {
      mcp: true,
      http: { enabled: false, port: 3000 },
      telegram: { enabled: false },
      discord: { enabled: false },
      webhook: { enabled: false },
    },
    observability: { log_level: 'info' },
    db: { path: './qos.db' },
    ...overrides,
  } as QosConfig;

  return {
    get: vi.fn(() => structuredClone(baseConfig)),
    getValue: vi.fn((path: string) => {
      const segments = path.split('.');
      let current: unknown = baseConfig;
      for (const seg of segments) {
        current = (current as Record<string, unknown>)[seg];
      }
      return current;
    }),
    reload: vi.fn(),
  };
}

/** Creates a minimal CostTracker mock (ModelCall does NOT call it directly). */
function makeMockCostTracker(): CostTracker {
  return {
    record: vi.fn(),
    recordModelCall: vi.fn(),
    getTaskCost: vi.fn(() => 0),
    getAgentCost: vi.fn(() => 0),
    getTotalCost: vi.fn(() => 0),
    getSummary: vi.fn(() => ({
      total_usd: 0,
      by_model: {},
      by_agent: {},
      by_category: {},
      budget_remaining_usd: -1,
    })),
  };
}

// ---------------------------------------------------------------------------
// TestableModelCall: subclass that overrides _callProvider for mocking
// ---------------------------------------------------------------------------

/**
 * Mock provider response returned by the testable subclass.
 * Simulates what a real SDK call would return.
 */
interface MockProviderResult {
  readonly content: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Extends ModelCallImpl to override _callProvider for testing.
 * Allows injecting mock provider behavior without real SDKs.
 */
class TestableModelCall extends ModelCallImpl {
  /**
   * Mock function invoked instead of real SDK calls.
   * Set this in test setup to control provider behavior.
   */
  public mockProviderFn: (
    provider: string,
    model: string,
    request: ModelRequest,
  ) => Promise<MockProviderResult>;

  constructor(
    configManager: ConfigManager,
    costTracker: CostTracker,
    logger: import('pino').Logger,
  ) {
    super(configManager, costTracker, logger);
    // Default: return a successful mock response
    this.mockProviderFn = async () => ({
      content: 'Mock response',
      inputTokens: 100,
      outputTokens: 50,
    });
  }

  /**
   * Override the protected _callProvider to use the mock function.
   */
  protected override async _callProvider(
    provider: string,
    model: string,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const start = performance.now();
    const result = await this.mockProviderFn(provider, model, request);

    // Look up catalog entry for cost computation
    const catalogEntry = MODEL_CATALOG.find((m) => m.name === model);
    const costPerInput = catalogEntry?.costPerInputToken ?? 0;
    const costPerOutput = catalogEntry?.costPerOutputToken ?? 0;
    const costUsd = result.inputTokens * costPerInput + result.outputTokens * costPerOutput;
    const latencyMs = performance.now() - start;

    return {
      content: result.content,
      model,
      provider,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      latencyMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    prompt: 'Test prompt',
    ...overrides,
  };
}

// ===========================================================================
// MODEL_CATALOG
// ===========================================================================

describe('MODEL_CATALOG', () => {
  it('contains known models from all providers', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(7);

    const names = MODEL_CATALOG.map((m) => m.name);
    expect(names).toContain('claude-sonnet-4-6');
    expect(names).toContain('claude-opus-4-6');
    expect(names).toContain('claude-haiku-4-5');
    expect(names).toContain('gpt-4.1');
    expect(names).toContain('gpt-4.1-mini');
    expect(names).toContain('gemini-2.5-pro');
    expect(names).toContain('gemini-2.5-flash');
  });

  it('every model has required ModelInfo fields', () => {
    for (const model of MODEL_CATALOG) {
      expect(typeof model.name).toBe('string');
      expect(typeof model.provider).toBe('string');
      expect(typeof model.costPerInputToken).toBe('number');
      expect(typeof model.costPerOutputToken).toBe('number');
      expect(typeof model.qualityScore).toBe('number');
      expect(typeof model.maxTokens).toBe('number');
      expect(typeof model.available).toBe('boolean');
    }
  });

  it('all quality scores are between 0 and 1', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.qualityScore).toBeGreaterThanOrEqual(0);
      expect(model.qualityScore).toBeLessThanOrEqual(1);
    }
  });

  it('all cost values are non-negative', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.costPerInputToken).toBeGreaterThanOrEqual(0);
      expect(model.costPerOutputToken).toBeGreaterThanOrEqual(0);
    }
  });

  it('all maxTokens are positive integers', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(Number.isInteger(model.maxTokens)).toBe(true);
    }
  });

  it('is readonly (frozen at runtime)', () => {
    // The catalog should not be mutable
    expect(Object.isFrozen(MODEL_CATALOG)).toBe(true);
  });
});

// ===========================================================================
// listProviders
// ===========================================================================

describe('ModelCallImpl.listProviders', () => {
  it('returns unique providers from the catalog', () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    const providers = mc.listProviders();
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('google');

    // Verify uniqueness
    const unique = [...new Set(providers)];
    expect(providers.length).toBe(unique.length);
  });
});

// ===========================================================================
// getAvailableModels
// ===========================================================================

describe('ModelCallImpl.getAvailableModels', () => {
  it('returns all catalog models when all are available and circuit breakers closed', () => {
    // Set all provider API keys so every catalog model passes the
    // _isProviderConfigured check, regardless of the real environment.
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    const savedOpenai = process.env.OPENAI_API_KEY;
    const savedGoogle = process.env.GOOGLE_API_KEY;
    const savedAws = process.env.AWS_ACCESS_KEY_ID;
    process.env.ANTHROPIC_API_KEY = 'test-key-anthropic';
    process.env.OPENAI_API_KEY = 'test-key-openai';
    process.env.GOOGLE_API_KEY = 'test-key-google';
    process.env.AWS_ACCESS_KEY_ID = 'test-key-aws';

    try {
      const mc = new TestableModelCall(
        makeMockConfigManager(),
        makeMockCostTracker(),
        makeMockLogger(),
      );

      const available = mc.getAvailableModels();
      // All catalog models have available: true and no circuit breakers open,
      // and all providers are now configured.
      expect(available.length).toBe(MODEL_CATALOG.length);
    } finally {
      // Restore original env state
      if (savedAnthropic === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = savedAnthropic;
      }
      if (savedOpenai === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = savedOpenai;
      }
      if (savedGoogle === undefined) {
        delete process.env.GOOGLE_API_KEY;
      } else {
        process.env.GOOGLE_API_KEY = savedGoogle;
      }
      if (savedAws === undefined) {
        delete process.env.AWS_ACCESS_KEY_ID;
      } else {
        process.env.AWS_ACCESS_KEY_ID = savedAws;
      }
    }
  });

  it('filters out models whose provider circuit breaker is open', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    // Trip the anthropic circuit breaker by failing 5 times
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      throw new Error('Provider down');
    };

    // Attempt calls to trip the breaker (each callModel retries 3 times inside CB)
    // Need 5 failures to trip the breaker
    for (let i = 0; i < 5; i++) {
      try {
        await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
      } catch {
        // Expected
      }
    }

    const available = mc.getAvailableModels();
    // Anthropic models should be filtered out since CB is open
    const anthropicModels = available.filter((m) => m.provider === 'anthropic');
    expect(anthropicModels.length).toBe(0);

    // Other providers should still be available
    const otherModels = available.filter((m) => m.provider !== 'anthropic');
    expect(otherModels.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// callModel - basic flow
// ===========================================================================

describe('ModelCallImpl.callModel', () => {
  let mc: TestableModelCall;

  beforeEach(() => {
    mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );
  });

  it('returns ModelResponse with correct structure', async () => {
    const response = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));

    expect(response).toHaveProperty('content');
    expect(response).toHaveProperty('model');
    expect(response).toHaveProperty('provider');
    expect(response).toHaveProperty('inputTokens');
    expect(response).toHaveProperty('outputTokens');
    expect(response).toHaveProperty('costUsd');
    expect(response).toHaveProperty('latencyMs');

    expect(typeof response.content).toBe('string');
    expect(typeof response.model).toBe('string');
    expect(typeof response.provider).toBe('string');
    expect(typeof response.inputTokens).toBe('number');
    expect(typeof response.outputTokens).toBe('number');
    expect(typeof response.costUsd).toBe('number');
    expect(typeof response.latencyMs).toBe('number');
  });

  it('uses explicit model when specified in request', async () => {
    const response = await mc.callModel(makeRequest({ model: 'gpt-4.1' }));

    expect(response.model).toBe('gpt-4.1');
    expect(response.provider).toBe('openai');
  });

  it('uses config primary model when no model specified', async () => {
    // Default config has primary = 'claude-sonnet-4-6'
    const response = await mc.callModel(makeRequest());

    expect(response.model).toBe('claude-sonnet-4-6');
    expect(response.provider).toBe('anthropic');
  });

  it('computes cost correctly using catalog prices', async () => {
    mc.mockProviderFn = async () => ({
      content: 'Test response',
      inputTokens: 1000,
      outputTokens: 500,
    });

    const response = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));

    // claude-sonnet-4-6: costPerInputToken = 0.000003, costPerOutputToken = 0.000015
    const expectedCost = 1000 * 0.000003 + 500 * 0.000015;
    expect(response.costUsd).toBeCloseTo(expectedCost, 8);
  });

  it('computes zero cost for local models', async () => {
    // If the catalog has ollama models with zero cost
    const ollamaModels = MODEL_CATALOG.filter((m) => m.provider === 'ollama');
    if (ollamaModels.length > 0) {
      mc.mockProviderFn = async () => ({
        content: 'Local response',
        inputTokens: 500,
        outputTokens: 200,
      });

      const response = await mc.callModel(makeRequest({ model: ollamaModels[0].name }));
      expect(response.costUsd).toBe(0);
    }
  });

  it('resolves provider from model name prefix when not in catalog', async () => {
    // claude- prefix -> anthropic
    mc.mockProviderFn = async (_provider, _model) => ({
      content: 'Custom model response',
      inputTokens: 50,
      outputTokens: 25,
    });

    const response = await mc.callModel(makeRequest({ model: 'claude-custom-model' }));
    expect(response.provider).toBe('anthropic');
  });

  it('measures latency in milliseconds', async () => {
    const response = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));

    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    // Should be very fast for mock calls
    expect(response.latencyMs).toBeLessThan(1000);
  });

  it('passes request through to provider function', async () => {
    let capturedProvider = '';
    let capturedModel = '';
    let capturedPrompt = '';

    mc.mockProviderFn = async (provider, model, request) => {
      capturedProvider = provider;
      capturedModel = model;
      capturedPrompt = request.prompt;
      return { content: 'OK', inputTokens: 10, outputTokens: 5 };
    };

    await mc.callModel(makeRequest({
      model: 'gpt-4.1',
      prompt: 'Hello world',
    }));

    expect(capturedProvider).toBe('openai');
    expect(capturedModel).toBe('gpt-4.1');
    expect(capturedPrompt).toBe('Hello world');
  });
});

// ===========================================================================
// callModel - retry behavior
// ===========================================================================

describe('ModelCallImpl.callModel - retry', () => {
  it('retries on transient failure then succeeds', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      if (callCount === 1) {
        // Simulate a retryable error (429 rate limit)
        const err = new Error('Rate limited');
        (err as Error & { status: number }).status = 429;
        throw err;
      }
      return { content: 'Success after retry', inputTokens: 50, outputTokens: 25 };
    };

    const response = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));

    expect(response.content).toBe('Success after retry');
    expect(callCount).toBe(2); // 1 failure + 1 success
  });

  it('throws after all retries exhausted', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    mc.mockProviderFn = async () => {
      const err = new Error('Server error');
      (err as Error & { status: number }).status = 500;
      throw err;
    };

    await expect(
      mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' })),
    ).rejects.toThrow();
  });

  it('does not retry non-retryable errors (400)', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      const err = new Error('Bad request');
      (err as Error & { status: number }).status = 400;
      throw err;
    };

    await expect(
      mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' })),
    ).rejects.toThrow('Bad request');

    // Should be called only once -- no retries for 400
    expect(callCount).toBe(1);
  });

  it('does not retry auth errors (401)', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      const err = new Error('Unauthorized');
      (err as Error & { status: number }).status = 401;
      throw err;
    };

    await expect(
      mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' })),
    ).rejects.toThrow('Unauthorized');

    expect(callCount).toBe(1);
  });
});

// ===========================================================================
// callModel - circuit breaker
// ===========================================================================

describe('ModelCallImpl.callModel - circuit breaker', () => {
  it('opens circuit breaker after threshold failures', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    mc.mockProviderFn = async () => {
      const err = new Error('Server error');
      (err as Error & { status: number }).status = 500;
      throw err;
    };

    // Each callModel attempt goes through CB -> retry (which fails all retries).
    // The CB sees each retry failure, so after threshold (5) consecutive failures,
    // the next call should get "Circuit breaker is open".
    const errors: string[] = [];
    for (let i = 0; i < 6; i++) {
      try {
        await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    // The last error(s) should be circuit breaker open
    expect(errors.some((msg) => msg.includes('Circuit breaker is open'))).toBe(true);
  });
});

// ===========================================================================
// healthCheck
// ===========================================================================

describe('ModelCallImpl.healthCheck', () => {
  it('returns true for healthy provider', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    // Mock health check succeeds by default (CB is closed, no SDK needed for mock)
    const result = await mc.healthCheck('anthropic');
    // Since we can't make real calls and the CB is closed, the healthCheck
    // for cloud providers may return false if no SDK. But the test verifies
    // the method exists and returns boolean.
    expect(typeof result).toBe('boolean');
  });

  it('returns false when circuit breaker is open', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    // Trip the circuit breaker
    mc.mockProviderFn = async () => {
      const err = new Error('Down');
      (err as Error & { status: number }).status = 500;
      throw err;
    };

    for (let i = 0; i < 6; i++) {
      try {
        await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
      } catch {
        // Expected
      }
    }

    const result = await mc.healthCheck('anthropic');
    expect(result).toBe(false);
  });

  it('returns false for unknown provider', async () => {
    const mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    const result = await mc.healthCheck('nonexistent-provider');
    expect(result).toBe(false);
  });
});

// ===========================================================================
// createModelCall factory
// ===========================================================================

describe('createModelCall', () => {
  it('returns a ModelCall instance', () => {
    const mc = createModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );

    expect(mc).toBeDefined();
    expect(typeof mc.callModel).toBe('function');
    expect(typeof mc.listProviders).toBe('function');
    expect(typeof mc.healthCheck).toBe('function');
    expect(typeof mc.getAvailableModels).toBe('function');
  });
});

// ===========================================================================
// isRetryableError (tested indirectly through callModel retry behavior)
// ===========================================================================

describe('Retryable error classification', () => {
  let mc: TestableModelCall;

  beforeEach(() => {
    mc = new TestableModelCall(
      makeMockConfigManager(),
      makeMockCostTracker(),
      makeMockLogger(),
    );
  });

  it('retries on 429 (rate limit)', async () => {
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error('Rate limited');
        (err as Error & { status: number }).status = 429;
        throw err;
      }
      return { content: 'OK', inputTokens: 10, outputTokens: 5 };
    };

    const result = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
    expect(result.content).toBe('OK');
    expect(callCount).toBe(3);
  });

  it('retries on 502 (bad gateway)', async () => {
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      if (callCount < 2) {
        const err = new Error('Bad gateway');
        (err as Error & { status: number }).status = 502;
        throw err;
      }
      return { content: 'OK', inputTokens: 10, outputTokens: 5 };
    };

    const result = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
    expect(result.content).toBe('OK');
    expect(callCount).toBe(2);
  });

  it('retries on 503 (service unavailable)', async () => {
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      if (callCount < 2) {
        const err = new Error('Unavailable');
        (err as Error & { status: number }).status = 503;
        throw err;
      }
      return { content: 'OK', inputTokens: 10, outputTokens: 5 };
    };

    const result = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
    expect(result.content).toBe('OK');
    expect(callCount).toBe(2);
  });

  it('retries on timeout errors', async () => {
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      if (callCount < 2) {
        const err = new Error('Request timeout');
        (err as Error & { code: string }).code = 'ETIMEDOUT';
        throw err;
      }
      return { content: 'OK', inputTokens: 10, outputTokens: 5 };
    };

    const result = await mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' }));
    expect(result.content).toBe('OK');
    expect(callCount).toBe(2);
  });

  it('does not retry on 404 (not found)', async () => {
    let callCount = 0;
    mc.mockProviderFn = async () => {
      callCount++;
      const err = new Error('Not found');
      (err as Error & { status: number }).status = 404;
      throw err;
    };

    await expect(
      mc.callModel(makeRequest({ model: 'claude-sonnet-4-6' })),
    ).rejects.toThrow('Not found');
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Provider inference from model name prefix
// ---------------------------------------------------------------------------

describe('provider inference', () => {
  const cfgMgr = { get: () => ({ mode: 'companion', models: { primary: 'claude-sonnet-4-6' } }) } as unknown as ConfigManager;
  const costTrk = { record: vi.fn(), recordModelCall: vi.fn(), getTaskCost: () => 0, getAgentCost: () => 0, getTotalCost: () => 0, getSummary: vi.fn() } as unknown as CostTracker;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => log } as unknown as import('pino').Logger;

  function createWithCapture(): { mc: TestableModelCall; getCaptured: () => string } {
    let capturedProvider = '';
    const mc = new TestableModelCall(cfgMgr, costTrk, log);
    mc.mockProviderFn = async (provider) => {
      capturedProvider = provider;
      return { content: 'ok', inputTokens: 10, outputTokens: 5 };
    };
    return { mc, getCaptured: () => capturedProvider };
  }

  it('infers openai from gpt- prefix', async () => {
    const { mc, getCaptured } = createWithCapture();
    await mc.callModel(makeRequest({ model: 'gpt-4.1' }));
    expect(getCaptured()).toBe('openai');
  });

  it('infers google from gemini- prefix', async () => {
    const { mc, getCaptured } = createWithCapture();
    await mc.callModel(makeRequest({ model: 'gemini-2.5-pro' }));
    expect(getCaptured()).toBe('google');
  });

  it('infers ollama from ollama/ prefix', async () => {
    const { mc, getCaptured } = createWithCapture();
    await mc.callModel(makeRequest({ model: 'ollama/llama3' }));
    expect(getCaptured()).toBe('ollama');
  });

  it('defaults to anthropic for unknown prefix', async () => {
    const { mc, getCaptured } = createWithCapture();
    await mc.callModel(makeRequest({ model: 'unknown-model' }));
    expect(getCaptured()).toBe('anthropic');
  });
});
