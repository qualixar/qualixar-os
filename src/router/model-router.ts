// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- ModelRouter: Strategy Selection Facade
 *
 * Phase 1 LLD Section 2.2.
 * Ties together ModeEngine, ModelCall, CostTracker, BudgetChecker,
 * BudgetOptimizer, QosDatabase, and EventBus into a unified
 * routing interface.
 *
 * Key responsibilities:
 * - Budget check BEFORE model call (fail fast)
 * - Strategy selection (cascade default, Q-learning in power mode)
 * - Model call delegation to ModelCall
 * - Cost recording via CostTracker.record() AND CostTracker.recordModelCall()
 * - Event emission: model:call_started, model:call_completed, model:call_failed
 *
 * RESOLUTION (H6): All model:* events emitted by ModelRouter, not ModelCall.
 * RESOLUTION (C2): Constructor takes 7 params.
 *
 * Hard Rule #7: no global state -- all state via constructor DI.
 * Hard Rule #10: ESM .js extensions on imports.
 */

import type { ModelRequest, ModelResponse } from '../types/common.js';
import type { ModeEngine } from '../engine/mode-engine.js';
import type { ModelCall } from './model-call.js';
import type { ModelInfo, RoutingStrategy } from './strategies/types.js';
import type { CostTracker } from '../cost/cost-tracker.js';
import type { BudgetChecker } from '../cost/budget-checker.js';
import type { BudgetOptimizer } from '../cost/budget-optimizer.js';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { ModelDiscovery, DiscoveredModel } from './model-discovery.js';

import { MODEL_CATALOG } from './model-call.js';
import { CascadeStrategy } from './strategies/cascade.js';
import { CheapestStrategy } from './strategies/cheapest.js';
import { QualityStrategy } from './strategies/quality.js';
import { BalancedStrategy } from './strategies/balanced.js';
import { PomdpStrategy } from './strategies/pomdp.js';
import { QLearningRouter } from './q-learning-router.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Interface (matches REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

/**
 * Strategy selection facade for LLM routing.
 *
 * Pattern: Facade -- encapsulates budget checking, strategy selection,
 * model calling, cost recording, and event emission behind a single
 * route() method.
 */
export interface ModelRouter {
  route(request: ModelRequest): Promise<ModelResponse>;
  getStrategy(): string;
  getCostTracker(): CostTracker;
  getDiscoveredModels(): readonly DiscoveredModel[];
  /** Get models from the runtime catalog that are available (configured + healthy). */
  getAvailableModels(): readonly { name: string; provider: string; qualityScore: number }[];
  /**
   * Update POMDP belief state with a judge observation.
   * H-05: Wires judge results to the POMDP strategy so belief
   * evolves beyond the uniform prior.
   */
  updatePomdpBelief(observation: 'poor' | 'fair' | 'good'): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ModelRouterImpl implements ModelRouter {
  private readonly _modeEngine: ModeEngine;
  private readonly _modelCall: ModelCall;
  private readonly _costTracker: CostTracker;
  private readonly _budgetChecker: BudgetChecker;
  private readonly _budgetOptimizer: BudgetOptimizer;
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;
  private readonly _strategies: Map<string, RoutingStrategy>;
  private readonly _qRouter: QLearningRouter;
  private readonly _discovery: ModelDiscovery | undefined;
  private _currentStrategy: string;
  private _discoveredModels: readonly DiscoveredModel[] = [];
  private _discoveryDone = false;

  constructor(
    modeEngine: ModeEngine,
    modelCall: ModelCall,
    costTracker: CostTracker,
    budgetChecker: BudgetChecker,
    budgetOptimizer: BudgetOptimizer,
    db: QosDatabase,
    eventBus: EventBus,
    discovery?: ModelDiscovery,
  ) {
    // Step 1: Store all injected dependencies
    this._modeEngine = modeEngine;
    this._modelCall = modelCall;
    this._costTracker = costTracker;
    this._budgetChecker = budgetChecker;
    this._budgetOptimizer = budgetOptimizer;
    this._db = db;
    this._eventBus = eventBus;
    this._discovery = discovery;

    // Step 2: Initialize 5 strategy instances
    this._strategies = new Map<string, RoutingStrategy>();
    this._strategies.set('cascade', new CascadeStrategy());
    this._strategies.set('cheapest', new CheapestStrategy());
    this._strategies.set('quality', new QualityStrategy());
    this._strategies.set('balanced', new BalancedStrategy());
    this._strategies.set('pomdp', new PomdpStrategy());

    // Step 3: Initialize Q-Learning router for power mode
    this._qRouter = new QLearningRouter(db, eventBus);

    // Step 4: Default strategy
    this._currentStrategy = 'cascade';

    // G-04: Listen for config:changed events and force model re-discovery
    // M-12: Also propagate config changes to ModelCall provider configs
    this._eventBus.on('config:changed', async () => {
      this._discoveryDone = false;
      this._discoveredModels = [];
      try {
        this._modelCall.reloadProviderConfigs();
      } catch { /* non-fatal: ModelCall may not support reload in all implementations */ }
    });
  }

  // -------------------------------------------------------------------------
  // route
  // -------------------------------------------------------------------------

  async route(request: ModelRequest): Promise<ModelResponse> {
    const taskId = request.taskId ?? '__global__';
    const startTime = performance.now();

    // ------------------------------------------------------------------
    // 0. Lazy discovery init (first call only)
    // ------------------------------------------------------------------
    await this._ensureDiscovery();

    // ------------------------------------------------------------------
    // 1. Budget check (BEFORE model call -- fail fast)
    // ------------------------------------------------------------------
    const estimatedCost = this._estimateCost(request);
    const budgetStatus = this._budgetChecker.check(taskId, estimatedCost);

    if (!budgetStatus.allowed) {
      throw new Error('Budget exceeded');
    }

    // ------------------------------------------------------------------
    // 2. Emit model:call_started
    // ------------------------------------------------------------------
    this._eventBus.emit({
      type: 'model:call_started',
      payload: {
        model: request.model ?? 'auto',
        taskType: request.taskType ?? 'general',
        strategy: this._currentStrategy,
      },
      source: 'ModelRouter',
      taskId: request.taskId,
    });

    try {
      // ----------------------------------------------------------------
      // 3. Determine final model request
      // ----------------------------------------------------------------
      let finalRequest: ModelRequest;

      if (request.model) {
        // Model is explicitly set -- skip strategy selection
        finalRequest = request;
      } else {
        // Strategy selection
        const selectedModel = this._selectModel(request);
        finalRequest = { ...request, model: selectedModel };
      }

      // ----------------------------------------------------------------
      // 4. Call model (with fallback to next available on failure)
      // ----------------------------------------------------------------
      let response: ModelResponse;
      try {
        response = await this._modelCall.callModel(finalRequest);
      } catch (firstError) {
        // If strategy-selected model fails and we're in auto mode,
        // try the next available models in quality order.
        if (request.model) {
          throw firstError; // Explicit model: don't fallback
        }
        const available = this._modelCall.getAvailableModels()
          .filter((m) => m.name !== finalRequest.model)
          .sort((a, b) => b.qualityScore - a.qualityScore);
        let succeeded = false;
        let lastError: unknown = firstError;
        for (const fallback of available) {
          try {
            response = await this._modelCall.callModel({
              ...request,
              model: fallback.name,
            });
            succeeded = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!succeeded) {
          throw lastError;
        }
        response = response!;
      }

      // ----------------------------------------------------------------
      // 5. Record cost via costTracker
      // ----------------------------------------------------------------
      this._costTracker.record({
        id: generateId(),
        taskId: request.taskId,
        agentId: request.agentId,
        model: response.model,
        amountUsd: response.costUsd,
        category: request.taskType ?? 'general',
        createdAt: now(),
      });

      // Record model call entry
      this._costTracker.recordModelCall({
        id: generateId(),
        taskId: request.taskId,
        agentId: request.agentId,
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
        latencyMs: response.latencyMs,
        status: 'success',
        createdAt: now(),
      });

      // ----------------------------------------------------------------
      // 6. Emit model:call_completed
      // ----------------------------------------------------------------
      this._eventBus.emit({
        type: 'model:call_completed',
        payload: {
          model: response.model,
          provider: response.provider,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          costUsd: response.costUsd,
          latencyMs: response.latencyMs,
          strategy: this._currentStrategy,
        },
        source: 'ModelRouter',
        taskId: request.taskId,
      });

      // ----------------------------------------------------------------
      // 7. If RL enabled, record reward for Q-learning
      // ----------------------------------------------------------------
      if (this._modeEngine.isFeatureEnabled('rl')) {
        const reward = this._computeReward(response);
        const models = this._modelCall.getAvailableModels();
        const remaining = this._budgetChecker.getRemaining(request.taskId);

        this._qRouter.recordReward(
          request.taskType ?? 'general',
          models.length,
          remaining,
          this._currentStrategy,
          reward,
        );
      }

      return response;
    } catch (error: unknown) {
      const latencyMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failed model call
      this._costTracker.recordModelCall({
        id: generateId(),
        taskId: request.taskId,
        agentId: request.agentId,
        provider: 'unknown',
        model: request.model ?? 'auto',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status: 'error',
        error: errorMessage,
        createdAt: now(),
      });

      // Emit model:call_failed
      this._eventBus.emit({
        type: 'model:call_failed',
        payload: {
          model: request.model ?? 'auto',
          error: errorMessage,
          latencyMs,
          strategy: this._currentStrategy,
        },
        source: 'ModelRouter',
        taskId: request.taskId,
      });

      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // getStrategy
  // -------------------------------------------------------------------------

  getStrategy(): string {
    return this._currentStrategy;
  }

  // -------------------------------------------------------------------------
  // getCostTracker
  // -------------------------------------------------------------------------

  getCostTracker(): CostTracker {
    return this._costTracker;
  }

  // -------------------------------------------------------------------------
  // getDiscoveredModels
  // -------------------------------------------------------------------------

  getDiscoveredModels(): readonly DiscoveredModel[] {
    return this._discoveredModels;
  }

  getAvailableModels(): readonly { name: string; provider: string; qualityScore: number }[] {
    return this._modelCall.getAvailableModels();
  }

  /**
   * H-05: Update the POMDP strategy's belief distribution based on a judge observation.
   * Called by the orchestrator after each judge verdict so the belief state
   * evolves from the uniform prior and influences future routing decisions.
   */
  updatePomdpBelief(observation: 'poor' | 'fair' | 'good'): void {
    const pomdp = this._strategies.get('pomdp');
    if (pomdp && 'updateBelief' in pomdp) {
      (pomdp as PomdpStrategy).updateBelief(observation);
    }
  }

  // -------------------------------------------------------------------------
  // Private: Lazy Discovery Init
  // -------------------------------------------------------------------------

  /**
   * Lazily discover models on first route() call. Results are cached.
   * If discovery fails or returns empty, _discoveredModels stays empty
   * and the router falls back to MODEL_CATALOG.
   */
  private async _ensureDiscovery(): Promise<void> {
    if (this._discoveryDone || !this._discovery) return;
    this._discoveryDone = true;

    try {
      const result = await this._discovery.discover();
      if (result.models.length > 0) {
        this._discoveredModels = result.models;
      }
    } catch {
      // Discovery failed — fall back to MODEL_CATALOG silently
      this._discoveredModels = [];
    }
  }

  // -------------------------------------------------------------------------
  // Private: Convert DiscoveredModel[] to ModelInfo[]
  // -------------------------------------------------------------------------

  private _discoveredToModelInfo(): readonly ModelInfo[] {
    return this._discoveredModels.map((dm) => ({
      name: dm.name,
      provider: dm.provider,
      costPerInputToken: dm.costPerInputToken,
      costPerOutputToken: dm.costPerOutputToken,
      qualityScore: dm.qualityScore,
      maxTokens: dm.maxTokens,
      available: dm.available,
    }));
  }

  // -------------------------------------------------------------------------
  // Private: Model Selection via Strategy
  // -------------------------------------------------------------------------

  /**
   * Select a model using the appropriate routing strategy.
   *
   * In companion mode: uses cascade (default).
   * In power mode with RL: uses Q-learning to select strategy, then
   * delegates to that strategy for model selection.
   */
  private _selectModel(request: ModelRequest): string {
    const gates = this._modeEngine.getFeatureGates();
    const allowedStrategies = gates.routingStrategies;

    let strategyName: string;

    if (this._modeEngine.isFeatureEnabled('rl')) {
      // Power mode: ask Q-learning router
      const models = this._modelCall.getAvailableModels();
      const remaining = this._budgetChecker.getRemaining(request.taskId);

      const recommended = this._qRouter.selectStrategy(
        request.taskType ?? 'general',
        models.length,
        remaining,
      );

      // Use recommended if allowed, else fall back to cascade
      strategyName = allowedStrategies.includes(recommended)
        ? recommended
        : 'cascade';
    } else {
      // Companion mode: default to cascade
      strategyName = 'cascade';
    }

    this._currentStrategy = strategyName;

    // Get strategy instance
    const strategy = this._strategies.get(strategyName);
    /* v8 ignore start -- defensive: strategy map is populated in constructor */
    if (!strategy) {
      this._currentStrategy = 'cascade';
      const cascadeStrategy = this._strategies.get('cascade')!;
      const models = this._modelCall.getAvailableModels();
      const decision = cascadeStrategy.select(request, models);
      return decision.model;
    }
    /* v8 ignore stop */

    // Get available models: merge discovered models WITH catalog.
    // SCN-001 fix: never discard catalog — it has provider fallback logic
    // (e.g., openai→azure) that discovery doesn't replicate.
    const catalogModels = this._modelCall.getAvailableModels();
    const discoveredModels = this._discoveredToModelInfo().filter((m) => m.available);
    // Merge: discovered models take precedence by name, catalog fills gaps
    const byName = new Map<string, ModelInfo>();
    for (const m of catalogModels) byName.set(m.name, m);
    for (const m of discoveredModels) byName.set(m.name, m);
    const availableModels = [...byName.values()];
    const decision = strategy.select(request, availableModels);

    return decision.model;
  }

  // -------------------------------------------------------------------------
  // Private: Cost Estimation
  // -------------------------------------------------------------------------

  /**
   * Estimate the cost of a model request for budget checking.
   *
   * Uses the request's model if specified, otherwise the primary model
   * from the catalog. Estimates based on maxTokens and prompt length.
   */
  private _estimateCost(request: ModelRequest): number {
    const modelName = request.model;
    let costPerInput = 0.000003;  // Default: Sonnet pricing
    let costPerOutput = 0.000015;

    if (modelName) {
      // Check discovered models first, then fall back to MODEL_CATALOG
      const discoveredEntry = this._discoveredModels.find((m) => m.name === modelName);
      if (discoveredEntry) {
        costPerInput = discoveredEntry.costPerInputToken;
        costPerOutput = discoveredEntry.costPerOutputToken;
      } else {
        const catalogEntry = MODEL_CATALOG.find((m) => m.name === modelName);
        if (catalogEntry) {
          costPerInput = catalogEntry.costPerInputToken;
          costPerOutput = catalogEntry.costPerOutputToken;
        }
      }
    }

    // Rough token estimate; actual count from response used for billing.
    const estimatedInputTokens = Math.ceil(request.prompt.length / 3.5);
    const estimatedOutputTokens = request.maxTokens ?? 1000;

    return estimatedInputTokens * costPerInput + estimatedOutputTokens * costPerOutput;
  }

  // -------------------------------------------------------------------------
  // Private: Reward Computation
  // -------------------------------------------------------------------------

  /**
   * Compute a reward signal from a model response for Q-learning.
   *
   * Reward is normalized to [0, 1] based on:
   * - Lower cost -> higher reward
   * - Lower latency -> higher reward
   * - Content length as proxy for completion quality
   */
  private _computeReward(response: ModelResponse): number {
    // Simple reward heuristic:
    // - Content length bonus (0 to 0.15): weak proxy until judge scores are available inline
    // - Cost efficiency (0 to 0.3): lower cost = better
    // - Latency bonus (0 to 0.2): faster = better

    // M-15: Content length is a poor quality proxy; cap its contribution low.
    // Proper quality signal comes from judge scores in the strategy scorer.
    const contentBonus = Math.min(0.15, response.content.length / 5000);
    const costBonus = response.costUsd <= 0.001 ? 0.3 : response.costUsd <= 0.01 ? 0.2 : 0.1;
    const latencyBonus = response.latencyMs <= 1000 ? 0.2 : response.latencyMs <= 5000 ? 0.1 : 0;

    return Math.min(1.0, contentBonus + costBonus + latencyBonus);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ModelRouter from all required dependencies.
 *
 * @param modeEngine - Companion/Power mode and feature gates
 * @param modelCall - Multi-provider LLM call abstraction
 * @param costTracker - Per-model/agent/task cost recording
 * @param budgetChecker - Budget threshold enforcement
 * @param budgetOptimizer - LP budget optimizer
 * @param db - QosDatabase for Q-learning persistence
 * @param eventBus - Event bus for model:* events
 * @param discovery - Optional ModelDiscovery for live model discovery
 */
export function createModelRouter(
  modeEngine: ModeEngine,
  modelCall: ModelCall,
  costTracker: CostTracker,
  budgetChecker: BudgetChecker,
  budgetOptimizer: BudgetOptimizer,
  db: QosDatabase,
  eventBus: EventBus,
  discovery?: ModelDiscovery,
): ModelRouter {
  return new ModelRouterImpl(
    modeEngine,
    modelCall,
    costTracker,
    budgetChecker,
    budgetOptimizer,
    db,
    eventBus,
    discovery,
  );
}
