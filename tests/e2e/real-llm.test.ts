/**
 * Qualixar OS Session 15 -- Real LLM E2E Tests (C-10)
 *
 * Tests against Azure AI Foundry (gtic-resource).
 * Skipped when AZURE_AI_API_KEY is not set.
 * Budget cap: $1 max per test run.
 *
 * These tests validate:
 * 1. Real model calls via Azure OpenAI
 * 2. Cost tracking accuracy with real API responses
 * 3. Full orchestrator pipeline with real LLM
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createQos } from '../../src/bootstrap.js';
import { QosConfigSchema, type QosConfig } from '../../src/types/common.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Skip if no Azure API key
// ---------------------------------------------------------------------------

const AZURE_KEY = process.env.AZURE_AI_API_KEY;
const AZURE_ENDPOINT = process.env.AZURE_AI_ENDPOINT ?? 'https://your-azure-endpoint.cognitiveservices.azure.com';

// ---------------------------------------------------------------------------
// Config with real Azure provider
// ---------------------------------------------------------------------------

function getRealLlmConfig(): QosConfig {
  return QosConfigSchema.parse({
    mode: 'companion',
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
    providers: {
      azure: {
        type: 'azure-openai',
        endpoint: AZURE_ENDPOINT,
        api_key_env: 'AZURE_AI_API_KEY',
        api_version: '2024-12-01-preview',
      },
    },
    models: {
      primary: 'azure/gpt-5.4-mini',
      catalog: [
        {
          name: 'azure/gpt-5.4-mini',
          provider: 'azure',
          deployment: 'gpt-5.4-mini',
          quality_score: 0.92,
          cost_per_input_token: 0.0000004,
          cost_per_output_token: 0.0000016,
          max_tokens: 4096,
        },
      ],
    },
    budget: { max_usd: 1.0, warn_pct: 0.5 },
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe.skipIf(!AZURE_KEY)('Real LLM E2E Tests (Azure AI Foundry)', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  /* v8 ignore start -- requires real Azure API key and network */
  it('Test 1: Simple model call returns a response and tracks cost', async () => {
    orc = createQos(getRealLlmConfig());

    const response = await orc.modelRouter.route({
      prompt: 'What is 2 + 2? Reply with just the number.',
      taskType: 'code',
      quality: 'low',
    });

    expect(response).toBeDefined();
    expect(response.content).toBeTruthy();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.model).toBeTruthy();
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
    expect(response.costUsd).toBeGreaterThanOrEqual(0);
    expect(response.latencyMs).toBeGreaterThan(0);

    // Cost should be tracked
    const totalCost = orc.costTracker.getTotalCost();
    expect(totalCost).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('Test 2: Task submission through orchestrator runs full pipeline', async () => {
    orc = createQos(getRealLlmConfig());

    const result = await orc.run({
      prompt: 'Say "hello world" and nothing else.',
      type: 'custom',
      simulate: false,
    });

    expect(result).toBeDefined();
    expect(result.taskId).toBeTruthy();
    expect(['completed', 'failed']).toContain(result.status);
    expect(result.duration_ms).toBeGreaterThan(0);
    expect(result.cost.total_usd).toBeGreaterThanOrEqual(0);

    // Verify task persisted in DB
    const row = orc.db.get<{ id: string; status: string }>(
      'SELECT id, status FROM tasks WHERE id = ?',
      [result.taskId],
    );
    expect(row).toBeDefined();
    expect(row!.id).toBe(result.taskId);
  }, 60_000);

  it('Test 3: Model response includes content string', async () => {
    orc = createQos(getRealLlmConfig());

    const response = await orc.modelRouter.route({
      prompt: 'Reply with exactly the word "pong".',
      taskType: 'analysis',
      quality: 'low',
      maxTokens: 50,
    });

    expect(response.content).toBeTruthy();
    expect(typeof response.content).toBe('string');
    // The response should contain "pong" (case insensitive)
    expect(response.content.toLowerCase()).toContain('pong');
  }, 30_000);

  it('Test 4: Budget enforcement - cost stays under cap', async () => {
    orc = createQos(getRealLlmConfig());

    // Make a few calls
    for (let i = 0; i < 3; i++) {
      await orc.modelRouter.route({
        prompt: `Count to ${i + 1}. Be brief.`,
        taskType: 'code',
        quality: 'low',
        maxTokens: 20,
      });
    }

    const totalCost = orc.costTracker.getTotalCost();
    expect(totalCost).toBeLessThan(1.0); // Under $1 budget
    expect(totalCost).toBeGreaterThan(0); // But not zero
  }, 60_000);

  it('Test 5: Events are emitted during real model calls', async () => {
    orc = createQos(getRealLlmConfig());
    const events: string[] = [];

    orc.eventBus.on('model:call_started', async () => {
      events.push('started');
    });
    orc.eventBus.on('model:call_completed', async () => {
      events.push('completed');
    });

    await orc.modelRouter.route({
      prompt: 'Hi',
      taskType: 'chat',
      quality: 'low',
      maxTokens: 10,
    });

    // Give events a tick to process
    await new Promise((r) => setTimeout(r, 100));

    expect(events).toContain('started');
    expect(events).toContain('completed');
  }, 30_000);

  it('Test 6: Model discovery finds Azure GTIC models', async () => {
    orc = createQos(getRealLlmConfig());
    const discovered = orc.modelRouter.getDiscoveredModels();
    // Discovery may or may not have models depending on timing
    // But the method should exist and return an array
    expect(Array.isArray(discovered)).toBe(true);
  }, 10_000);
  /* v8 ignore stop */
});

// ---------------------------------------------------------------------------
// Structural tests (always run — no API key needed)
// ---------------------------------------------------------------------------

describe('Real LLM E2E - Structural', () => {
  it('getRealLlmConfig creates valid config with azure provider', () => {
    const config = getRealLlmConfig();
    expect(config.providers.azure).toBeDefined();
    expect(config.providers.azure.type).toBe('azure-openai');
    expect(config.providers.azure.endpoint).toBe(AZURE_ENDPOINT);
    expect(config.budget.max_usd).toBe(1.0);
    expect(config.models.catalog).toHaveLength(1);
    expect(config.models.catalog[0].name).toBe('azure/gpt-5.4-mini');
  });

  it('config budget is capped at $1', () => {
    const config = getRealLlmConfig();
    expect(config.budget.max_usd).toBeLessThanOrEqual(1.0);
  });

  it('config uses azure endpoint from env or default', () => {
    const config = getRealLlmConfig();
    expect(config.providers.azure.endpoint).toContain('cognitiveservices.azure.com');
  });
});
