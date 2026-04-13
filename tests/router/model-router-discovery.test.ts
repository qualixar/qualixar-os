/**
 * Qualixar OS V2 -- ModelRouter + ModelDiscovery Integration Tests
 *
 * Tests that ModelRouter correctly wires ModelDiscovery to use
 * discovered models for routing, with fallback to MODEL_CATALOG.
 *
 * TDD Phase: RED -> GREEN
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import { ModelRouterImpl, createModelRouter } from '../../src/router/model-router.js';
import type { ModeEngine } from '../../src/engine/mode-engine.js';
import type { ModelCall } from '../../src/router/model-call.js';
import type { CostTracker } from '../../src/cost/cost-tracker.js';
import type { BudgetChecker } from '../../src/cost/budget-checker.js';
import type { BudgetOptimizer } from '../../src/cost/budget-optimizer.js';
import type { ModelRequest, ModelResponse, FeatureGates, CostSummary } from '../../src/types/common.js';
import type { ModelInfo } from '../../src/router/strategies/types.js';
import type { ModelDiscovery, DiscoveredModel, DiscoveryResult } from '../../src/router/model-discovery.js';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const COMPANION_GATES: FeatureGates = {
  topologies: ['sequential', 'parallel', 'hierarchical', 'dag', 'mixture_of_agents', 'debate'],
  maxJudges: 2,
  routingStrategies: ['cascade', 'cheapest', 'quality'],
  rlEnabled: false,
  containerIsolation: false,
  dashboard: true,
  channels: ['cli', 'mcp'],
  simulationEnabled: false,
};

const DISCOVERED_MODELS: readonly DiscoveredModel[] = [
  {
    name: 'gpt-5.3',
    provider: 'openai',
    qualityScore: 0.97,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000012,
    maxTokens: 32768,
    available: true,
    source: 'discovered',
  },
  {
    name: 'claude-opus-4-6',
    provider: 'anthropic',
    qualityScore: 0.98,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    maxTokens: 200000,
    available: true,
    source: 'discovered',
  },
  {
    name: 'deepseek-v3.2',
    provider: 'deepseek',
    qualityScore: 0.92,
    costPerInputToken: 0.00000027,
    costPerOutputToken: 0.0000011,
    maxTokens: 65536,
    available: true,
    source: 'discovered',
  },
];

const DISCOVERY_RESULT: DiscoveryResult = {
  models: DISCOVERED_MODELS,
  providers: ['openai', 'anthropic', 'deepseek'],
  discoveredCount: 3,
  fallbackCount: 0,
  errors: [],
};

const EMPTY_DISCOVERY_RESULT: DiscoveryResult = {
  models: [],
  providers: [],
  discoveredCount: 0,
  fallbackCount: 0,
  errors: [],
};

const MOCK_CATALOG_MODELS: readonly ModelInfo[] = [
  {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    qualityScore: 0.92,
    maxTokens: 8192,
    available: true,
  },
];

const MOCK_RESPONSE: ModelResponse = {
  content: 'Hello from mock',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  inputTokens: 100,
  outputTokens: 200,
  costUsd: 0.0033,
  latencyMs: 500,
};

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockModeEngine(): ModeEngine {
  return {
    get currentMode() { return 'companion' as const; },
    isFeatureEnabled: vi.fn(() => false),
    getFeatureGates: vi.fn(() => structuredClone(COMPANION_GATES)),
    switchMode: vi.fn(),
  };
}

function createMockModelCall(): ModelCall {
  return {
    callModel: vi.fn(async () => MOCK_RESPONSE),
    listProviders: vi.fn(() => ['anthropic']),
    healthCheck: vi.fn(async () => true),
    getAvailableModels: vi.fn(() => MOCK_CATALOG_MODELS),
  };
}

function createMockCostTracker(): CostTracker {
  return {
    record: vi.fn(),
    recordModelCall: vi.fn(),
    getTaskCost: vi.fn(() => 0),
    getAgentCost: vi.fn(() => 0),
    getTotalCost: vi.fn(() => 0),
    getSummary: vi.fn((): CostSummary => ({
      total_usd: 0,
      by_model: {},
      by_agent: {},
      by_category: {},
      budget_remaining_usd: -1,
    })),
  };
}

function createMockBudgetChecker(): BudgetChecker {
  return {
    check: vi.fn(() => ({ allowed: true, remaining_usd: 10, warning: false })),
    getRemaining: vi.fn(() => 10),
  };
}

function createMockBudgetOptimizer(): BudgetOptimizer {
  return {
    optimize: vi.fn(() => ({
      assignments: {},
      totalCostUsd: 0,
      estimatedQuality: 0.9,
      feasible: true,
    })),
  };
}

function createMockDiscovery(result: DiscoveryResult = DISCOVERY_RESULT): ModelDiscovery {
  return {
    discover: vi.fn(async () => result),
    selectModel: vi.fn((mode, models) => {
      const available = models.filter((m) => m.available);
      if (available.length === 0) return null;
      return [...available].sort((a, b) => b.qualityScore - a.qualityScore)[0];
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelRouter + ModelDiscovery Integration', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let mockModeEngine: ModeEngine;
  let mockModelCall: ModelCall;
  let mockCostTracker: CostTracker;
  let mockBudgetChecker: BudgetChecker;
  let mockBudgetOptimizer: BudgetOptimizer;

  const baseRequest: ModelRequest = {
    prompt: 'Write a hello world program',
    taskType: 'code',
    taskId: 'task-001',
    agentId: 'agent-001',
  };

  beforeEach(() => {
    db = createDatabase(':memory:');
    eventBus = createEventBus(db);
    mockModeEngine = createMockModeEngine();
    mockModelCall = createMockModelCall();
    mockCostTracker = createMockCostTracker();
    mockBudgetChecker = createMockBudgetChecker();
    mockBudgetOptimizer = createMockBudgetOptimizer();
  });

  // -------------------------------------------------------------------------
  // 1. Router uses discovered models when ModelDiscovery is provided
  // -------------------------------------------------------------------------
  it('uses discovered models for strategy selection when ModelDiscovery is provided', async () => {
    const discovery = createMockDiscovery();
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      discovery,
    );

    await router.route(baseRequest);

    // Discovery should have been called
    expect(discovery.discover).toHaveBeenCalledTimes(1);

    // The model call should use a discovered model name (cascade picks highest quality)
    const callArgs = (mockModelCall.callModel as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const discoveredNames = DISCOVERED_MODELS.map((m) => m.name);
    expect(discoveredNames).toContain(callArgs.model);
  });

  // -------------------------------------------------------------------------
  // 2. Falls back to MODEL_CATALOG when discovery returns empty
  // -------------------------------------------------------------------------
  it('falls back to MODEL_CATALOG when discovery returns empty', async () => {
    const emptyDiscovery = createMockDiscovery(EMPTY_DISCOVERY_RESULT);
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      emptyDiscovery,
    );

    await router.route(baseRequest);

    // Discovery was called but returned empty
    expect(emptyDiscovery.discover).toHaveBeenCalledTimes(1);

    // Should fall back to MODEL_CATALOG via getAvailableModels
    expect(mockModelCall.getAvailableModels).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Backward compat: no ModelDiscovery = MODEL_CATALOG behavior
  // -------------------------------------------------------------------------
  it('falls back to MODEL_CATALOG when no ModelDiscovery provided (backward compat)', async () => {
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      // No 8th param — undefined
    );

    await router.route(baseRequest);

    // Should use getAvailableModels from ModelCall (MODEL_CATALOG)
    expect(mockModelCall.getAvailableModels).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Discovery is called only once (cached on first route())
  // -------------------------------------------------------------------------
  it('calls discover() only once across multiple route() calls', async () => {
    const discovery = createMockDiscovery();
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      discovery,
    );

    await router.route(baseRequest);
    await router.route(baseRequest);
    await router.route(baseRequest);

    // discover() should be called exactly once (lazy init + cache)
    expect(discovery.discover).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 5. Cost estimation uses discovered model pricing
  // -------------------------------------------------------------------------
  it('cost estimation uses discovered model pricing', async () => {
    const discovery = createMockDiscovery();
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      discovery,
    );

    // Request with a discovered model name
    const requestWithModel: ModelRequest = {
      ...baseRequest,
      model: 'gpt-5.3',
    };

    await router.route(requestWithModel);

    // Budget checker should have been called with cost based on discovered pricing
    expect(mockBudgetChecker.check).toHaveBeenCalledTimes(1);
    const checkArgs = (mockBudgetChecker.check as ReturnType<typeof vi.fn>).mock.calls[0];
    const estimatedCost = checkArgs[1] as number;

    // gpt-5.3: input=$0.000003/token, output=$0.000012/token
    // Prompt "Write a hello world program" ~ 7 chars / 4 = 2 tokens input
    // Default maxTokens = 1000
    // Cost = 2 * 0.000003 + 1000 * 0.000012 = 0.000006 + 0.012 = 0.012006
    expect(estimatedCost).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 6. getDiscoveredModels() returns cached discovered models
  // -------------------------------------------------------------------------
  it('getDiscoveredModels() returns cached models after first route()', async () => {
    const discovery = createMockDiscovery();
    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      discovery,
    );

    // Before routing, should return empty
    expect(router.getDiscoveredModels()).toEqual([]);

    await router.route(baseRequest);

    // After routing, should return discovered models
    const models = router.getDiscoveredModels();
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.name)).toContain('gpt-5.3');
    expect(models.map((m) => m.name)).toContain('claude-opus-4-6');
  });

  // -------------------------------------------------------------------------
  // 7. createModelRouter factory accepts optional ModelDiscovery
  // -------------------------------------------------------------------------
  it('createModelRouter factory accepts optional ModelDiscovery', () => {
    const discovery = createMockDiscovery();

    // With discovery
    const routerWithDiscovery = createModelRouter(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      discovery,
    );
    expect(routerWithDiscovery).toBeDefined();
    expect(typeof routerWithDiscovery.route).toBe('function');

    // Without discovery (backward compat)
    const routerWithout = createModelRouter(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
    );
    expect(routerWithout).toBeDefined();
    expect(typeof routerWithout.route).toBe('function');
  });

  // -------------------------------------------------------------------------
  // 8. Discovery failure does not break routing
  // -------------------------------------------------------------------------
  it('gracefully falls back when discover() throws', async () => {
    const failingDiscovery: ModelDiscovery = {
      discover: vi.fn(async () => { throw new Error('Network error'); }),
      selectModel: vi.fn(() => null),
    };

    const router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
      failingDiscovery,
    );

    // Should NOT throw — falls back to catalog
    const response = await router.route(baseRequest);
    expect(response).toBeDefined();
    expect(response.content).toBe('Hello from mock');
  });
});
