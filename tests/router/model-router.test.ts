/**
 * Qualixar OS V2 -- ModelRouter Unit Tests
 *
 * Integration layer tests: ModelRouter ties together ModeEngine, ModelCall,
 * CostTracker, BudgetChecker, BudgetOptimizer, QosDatabase, and EventBus.
 *
 * All dependencies are mocked. No real LLM calls.
 * Source of truth: Phase 1 LLD Section 2.2.
 * TDD Phase: RED -> GREEN
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import { ModelRouterImpl, createModelRouter, type ModelRouter } from '../../src/router/model-router.js';
import type { ModeEngine } from '../../src/engine/mode-engine.js';
import type { ModelCall } from '../../src/router/model-call.js';
import type { CostTracker } from '../../src/cost/cost-tracker.js';
import type { BudgetChecker } from '../../src/cost/budget-checker.js';
import type { BudgetOptimizer } from '../../src/cost/budget-optimizer.js';
import type { ModelRequest, ModelResponse, FeatureGates, BudgetStatus, CostSummary } from '../../src/types/common.js';
import type { ModelInfo } from '../../src/router/strategies/types.js';

// ---------------------------------------------------------------------------
// Mock Factories
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

const POWER_GATES: FeatureGates = {
  topologies: ['sequential', 'parallel', 'hierarchical', 'dag', 'mixture_of_agents', 'debate',
    'mesh', 'star', 'circular', 'grid', 'forest', 'maker'],
  maxJudges: 5,
  routingStrategies: ['cascade', 'cheapest', 'quality', 'balanced', 'pomdp'],
  rlEnabled: true,
  containerIsolation: true,
  dashboard: true,
  channels: ['cli', 'mcp', 'http', 'telegram', 'discord', 'webhook'],
  simulationEnabled: true,
};

const MOCK_MODEL_INFO: readonly ModelInfo[] = [
  {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    qualityScore: 0.92,
    maxTokens: 8192,
    available: true,
  },
  {
    name: 'gpt-4.1-mini',
    provider: 'openai',
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.0000016,
    qualityScore: 0.85,
    maxTokens: 16384,
    available: true,
  },
  {
    name: 'ollama/llama3',
    provider: 'ollama',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    qualityScore: 0.60,
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

function createMockModeEngine(mode: 'companion' | 'power' = 'companion'): ModeEngine {
  const gates = mode === 'companion' ? COMPANION_GATES : POWER_GATES;
  return {
    get currentMode() { return mode; },
    isFeatureEnabled: vi.fn((feature: string) => {
      if (feature === 'rl') return gates.rlEnabled;
      return false;
    }),
    getFeatureGates: vi.fn(() => structuredClone(gates)),
    switchMode: vi.fn(),
  };
}

function createMockModelCall(): ModelCall {
  return {
    callModel: vi.fn(async () => MOCK_RESPONSE),
    listProviders: vi.fn(() => ['anthropic', 'openai', 'google', 'ollama']),
    healthCheck: vi.fn(async () => true),
    getAvailableModels: vi.fn(() => MOCK_MODEL_INFO),
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

function createMockBudgetChecker(allowed = true): BudgetChecker {
  return {
    check: vi.fn((): BudgetStatus => ({
      allowed,
      remaining_usd: allowed ? 10 : 0,
      warning: !allowed,
      message: allowed ? undefined : 'Budget exceeded',
    })),
    getRemaining: vi.fn(() => allowed ? 10 : 0),
  };
}

function createMockBudgetOptimizer(): BudgetOptimizer {
  return {
    optimize: vi.fn(() => ({
      assignments: { subtask1: 'claude-sonnet-4-6' },
      totalCostUsd: 0.01,
      estimatedQuality: 0.92,
      feasible: true,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelRouter', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let mockModeEngine: ModeEngine;
  let mockModelCall: ModelCall;
  let mockCostTracker: CostTracker;
  let mockBudgetChecker: BudgetChecker;
  let mockBudgetOptimizer: BudgetOptimizer;
  let router: ModelRouter;

  const baseRequest: ModelRequest = {
    prompt: 'Write a hello world program',
    taskType: 'code',
    taskId: 'task-001',
    agentId: 'agent-001',
  };

  beforeEach(() => {
    db = createDatabase(':memory:');
    eventBus = createEventBus(db);
    mockModeEngine = createMockModeEngine('companion');
    mockModelCall = createMockModelCall();
    mockCostTracker = createMockCostTracker();
    mockBudgetChecker = createMockBudgetChecker(true);
    mockBudgetOptimizer = createMockBudgetOptimizer();

    router = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
    );
  });

  // -------------------------------------------------------------------------
  // 1. route() returns valid ModelResponse
  // -------------------------------------------------------------------------
  it('route() returns a valid ModelResponse', async () => {
    const response = await router.route(baseRequest);

    expect(response).toBeDefined();
    expect(response.content).toBe('Hello from mock');
    expect(response.model).toBe('claude-sonnet-4-6');
    expect(response.provider).toBe('anthropic');
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(200);
    expect(response.costUsd).toBe(0.0033);
    expect(response.latencyMs).toBe(500);
  });

  // -------------------------------------------------------------------------
  // 2. route() emits model:call_started and model:call_completed
  // -------------------------------------------------------------------------
  it('route() emits model:call_started and model:call_completed', async () => {
    const emittedEvents: string[] = [];
    eventBus.on('model:call_started', async (event) => {
      emittedEvents.push(event.type);
    });
    eventBus.on('model:call_completed', async (event) => {
      emittedEvents.push(event.type);
    });

    await router.route(baseRequest);

    // Events are fire-and-forget, give them a tick to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(emittedEvents).toContain('model:call_started');
    expect(emittedEvents).toContain('model:call_completed');
  });

  // -------------------------------------------------------------------------
  // 3. route() records cost via costTracker
  // -------------------------------------------------------------------------
  it('route() records cost via costTracker.record() and recordModelCall()', async () => {
    await router.route(baseRequest);

    expect(mockCostTracker.record).toHaveBeenCalledTimes(1);
    expect(mockCostTracker.recordModelCall).toHaveBeenCalledTimes(1);

    // Verify record was called with correct shape
    const recordCall = (mockCostTracker.record as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(recordCall.model).toBe('claude-sonnet-4-6');
    expect(recordCall.amountUsd).toBe(0.0033);
    expect(recordCall.taskId).toBe('task-001');

    // Verify recordModelCall was called with correct shape
    const modelCallRecord = (mockCostTracker.recordModelCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(modelCallRecord.model).toBe('claude-sonnet-4-6');
    expect(modelCallRecord.provider).toBe('anthropic');
    expect(modelCallRecord.inputTokens).toBe(100);
    expect(modelCallRecord.outputTokens).toBe(200);
    expect(modelCallRecord.status).toBe('success');
  });

  // -------------------------------------------------------------------------
  // 4. route() throws when budget exceeded
  // -------------------------------------------------------------------------
  it('route() throws when budget exceeded', async () => {
    const blockedBudgetChecker = createMockBudgetChecker(false);
    const blockedRouter = new ModelRouterImpl(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      blockedBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
    );

    await expect(blockedRouter.route(baseRequest)).rejects.toThrow('Budget exceeded');
  });

  // -------------------------------------------------------------------------
  // 5. route() emits model:call_failed on error
  // -------------------------------------------------------------------------
  it('route() emits model:call_failed on error', async () => {
    // Make ALL callModel attempts throw so the fallback loop also fails
    (mockModelCall.callModel as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Provider unavailable'),
    );

    const emittedEvents: string[] = [];
    eventBus.on('model:call_failed', async (event) => {
      emittedEvents.push(event.type);
    });

    await expect(router.route(baseRequest)).rejects.toThrow('Provider unavailable');

    await new Promise((r) => setTimeout(r, 50));
    expect(emittedEvents).toContain('model:call_failed');
  });

  // -------------------------------------------------------------------------
  // 6. getStrategy() returns current strategy name
  // -------------------------------------------------------------------------
  it('getStrategy() returns current strategy name', () => {
    // Default should be 'cascade'
    expect(router.getStrategy()).toBe('cascade');
  });

  // -------------------------------------------------------------------------
  // 7. getCostTracker() returns the cost tracker instance
  // -------------------------------------------------------------------------
  it('getCostTracker() returns the cost tracker instance', () => {
    const tracker = router.getCostTracker();
    expect(tracker).toBe(mockCostTracker);
  });

  // -------------------------------------------------------------------------
  // 8. route() uses cascade strategy by default in companion mode
  // -------------------------------------------------------------------------
  it('route() uses cascade strategy by default in companion mode', async () => {
    await router.route(baseRequest);

    expect(router.getStrategy()).toBe('cascade');

    // ModelCall should have been called with a model selected by cascade
    expect(mockModelCall.callModel).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 9. route() uses Q-learning strategy selection in power mode
  // -------------------------------------------------------------------------
  it('route() uses Q-learning strategy selection in power mode', async () => {
    const powerModeEngine = createMockModeEngine('power');
    const powerRouter = new ModelRouterImpl(
      powerModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
    );

    await powerRouter.route(baseRequest);

    // In power mode with RL enabled, Q-learning selects the strategy.
    // The selected strategy should be one of the valid strategy names.
    const strategy = powerRouter.getStrategy();
    expect(['cascade', 'cheapest', 'quality', 'balanced', 'pomdp']).toContain(strategy);
  });

  // -------------------------------------------------------------------------
  // 10. route() skips strategy selection when model is explicitly set
  // -------------------------------------------------------------------------
  it('route() skips strategy selection when model is explicitly set', async () => {
    const requestWithModel: ModelRequest = {
      ...baseRequest,
      model: 'gpt-4.1-mini',
    };

    await router.route(requestWithModel);

    // callModel should have been called with the explicit model
    const callArgs = (mockModelCall.callModel as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4.1-mini');
  });

  // -------------------------------------------------------------------------
  // 11. route() calls budgetChecker.check() before model call
  // -------------------------------------------------------------------------
  it('route() calls budgetChecker.check() before model call', async () => {
    const callOrder: string[] = [];

    (mockBudgetChecker.check as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('budget_check');
      return { allowed: true, remaining_usd: 10, warning: false };
    });

    (mockModelCall.callModel as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('model_call');
      return MOCK_RESPONSE;
    });

    await router.route(baseRequest);

    expect(callOrder.indexOf('budget_check')).toBeLessThan(callOrder.indexOf('model_call'));
  });

  // -------------------------------------------------------------------------
  // 12. createModelRouter factory returns a ModelRouter instance
  // -------------------------------------------------------------------------
  it('createModelRouter factory returns a ModelRouter instance', () => {
    const factoryRouter = createModelRouter(
      mockModeEngine,
      mockModelCall,
      mockCostTracker,
      mockBudgetChecker,
      mockBudgetOptimizer,
      db,
      eventBus,
    );

    expect(factoryRouter).toBeDefined();
    expect(typeof factoryRouter.route).toBe('function');
    expect(typeof factoryRouter.getStrategy).toBe('function');
    expect(typeof factoryRouter.getCostTracker).toBe('function');
  });

  // -------------------------------------------------------------------------
  // 13. route() records model call as 'error' status on failure
  // -------------------------------------------------------------------------
  it('route() records model call as error status on failure', async () => {
    // Make ALL callModel attempts throw so the fallback loop also fails
    (mockModelCall.callModel as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Provider timeout'),
    );

    await expect(router.route(baseRequest)).rejects.toThrow('Provider timeout');

    // recordModelCall should still be called with error status
    expect(mockCostTracker.recordModelCall).toHaveBeenCalledTimes(1);
    const errorRecord = (mockCostTracker.recordModelCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorRecord.status).toBe('error');
    expect(errorRecord.error).toBe('Provider timeout');
  });
});
