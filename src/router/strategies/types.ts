// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Routing Strategy Shared Types
 *
 * Shared interfaces for all 5 routing strategies.
 * Source of truth: Phase 1 LLD Section 2.4 (M1 refactor note).
 *
 * WHY a separate types file: Avoids circular imports. All 5 strategies
 * and ModelRouter import from here instead of importing from each other.
 *
 * LLD DEVIATIONS (intentional):
 *   L-01: ModelInfo uses `.name` instead of LLD's `.model`. Rationale:
 *         `.name` is the standard identifier convention across Qualixar OS; the
 *         LLD's `.model` would create confusion with the `model` field in
 *         StrategyDecision and ModelRequest.
 *   L-02: RoutingStrategy.select() is synchronous, not async as in the LLD.
 *         Rationale: All 5 strategies perform pure computation (filtering +
 *         sorting) with no I/O. Making them sync simplifies the call chain
 *         and avoids unnecessary Promise overhead in the hot path.
 */

import type { ModelRequest } from '../../types/common.js';

// ---------------------------------------------------------------------------
// ModelInfo -- describes a model's capabilities and cost
// ---------------------------------------------------------------------------

/**
 * Metadata about an LLM model used for routing decisions.
 *
 * Pattern: Value Object -- immutable, no identity, pure data.
 */
export interface ModelInfo {
  /** Model identifier (e.g., 'claude-sonnet-4-6') */
  readonly name: string;

  /** Provider identifier (e.g., 'anthropic', 'openai') */
  readonly provider: string;

  /** Cost in USD per input token */
  readonly costPerInputToken: number;

  /** Cost in USD per output token */
  readonly costPerOutputToken: number;

  /** Quality score normalized to [0, 1]. Higher = better. */
  readonly qualityScore: number;

  /** Maximum token output capacity */
  readonly maxTokens: number;

  /** Whether the model is currently available (healthy, not rate-limited) */
  readonly available: boolean;
}

// ---------------------------------------------------------------------------
// StrategyDecision -- the output of a routing strategy
// ---------------------------------------------------------------------------

/**
 * The result of a strategy's model selection.
 *
 * Pattern: Value Object -- immutable routing decision.
 */
export interface StrategyDecision {
  /** Selected model name */
  readonly model: string;

  /** Selected model's provider */
  readonly provider: string;

  /** Human-readable explanation of why this model was selected */
  readonly reasoning: string;
}

// ---------------------------------------------------------------------------
// RoutingStrategy -- the contract all strategies implement
// ---------------------------------------------------------------------------

/**
 * Interface for model routing strategies.
 *
 * Pattern: Strategy Pattern -- interchangeable algorithms behind a
 * common interface. ModelRouter selects which strategy to use; the
 * strategy decides which model to use.
 *
 * All strategies MUST:
 * - Filter out models with available === false
 * - Throw Error when no models are available
 * - Return a deterministic StrategyDecision
 */
export interface RoutingStrategy {
  /** Strategy identifier (e.g., 'cascade', 'cheapest') */
  readonly name: string;

  /**
   * Select the best model for the given request.
   *
   * @param request - The incoming model request with quality hints
   * @param models - Available model catalog (may include unavailable models)
   * @returns The selected model and reasoning
   * @throws Error if no available models exist
   */
  select(request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision;
}
