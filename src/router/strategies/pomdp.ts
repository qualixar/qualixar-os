// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- POMDP Routing Strategy
 *
 * Simplified belief-state MDP routing using Bayesian belief updates.
 * Source of truth: Phase 1 LLD Section 2.8.
 *
 * WHY POMDP: The "true" quality of a task context is hidden (partially
 * observable). We maintain a belief distribution over 3 hidden states
 * (low/medium/high quality context) and use that belief to select
 * models that maximize expected reward minus cost.
 *
 * This is a SIMPLIFIED POMDP -- equivalent to a context-dependent bandit
 * (LLD Note H2). Full transition model is deferred to Phase 3 when
 * action tracking is available.
 *
 * States: low=0, medium=1, high=2
 * Observations: poor=0, fair=1, good=2
 * Actions: selecting a model from the catalog
 */

import type { ModelRequest } from '../../types/common.js';
import type { ModelInfo, RoutingStrategy, StrategyDecision } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of hidden states in the POMDP. */
const NUM_STATES = 3;

/** Cost penalty weight (30% of decision). */
const COST_PENALTY_WEIGHT = 0.3;

/** Minimum belief value to prevent degenerate distributions. */
const BELIEF_FLOOR = 0.01;

/** Maximum belief value to prevent degenerate distributions. */
const BELIEF_CEILING = 0.98;

/** Maps observation labels to indices. */
const OBSERVATION_INDEX: Readonly<Record<string, number>> = {
  poor: 0,
  fair: 1,
  good: 2,
} as const;

/**
 * Observation model: P(observation | true_state)
 * Rows = true state (low, medium, high)
 * Cols = observation (poor, fair, good)
 */
const OBSERVATION_MODEL: readonly (readonly number[])[] = [
  [0.7, 0.2, 0.1],  // low quality state: mostly poor observations
  [0.2, 0.6, 0.2],  // medium quality state: mostly fair observations
  [0.1, 0.2, 0.7],  // high quality state: mostly good observations
] as const;

// ---------------------------------------------------------------------------
// PomdpStrategy
// ---------------------------------------------------------------------------

export class PomdpStrategy implements RoutingStrategy {
  readonly name = 'pomdp' as const;

  /**
   * Belief distribution over hidden states [P(low), P(medium), P(high)].
   * Mutable -- this is the ONE stateful strategy.
   */
  private _belief: number[];

  constructor() {
    // Uniform prior: equal probability for each state
    this._belief = [1 / NUM_STATES, 1 / NUM_STATES, 1 / NUM_STATES];
  }

  /**
   * Select model with highest expected reward under current belief.
   *
   * For each model, computes:
   *   V(model) = sum_s(belief[s] * qualityReward(s, model)) - costPenalty * cost
   *
   * Then returns the model with highest V.
   */
  select(_request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision {
    const available = models.filter((m) => m.available);

    if (available.length === 0) {
      throw new Error('No models available for POMDP strategy');
    }

    // Find max cost for normalization
    const maxCost = Math.max(
      ...available.map((m) => m.costPerOutputToken),
    );

    let bestModel: ModelInfo = available[0];
    let bestValue = -Infinity;

    for (const model of available) {
      const value = this._computeExpectedValue(model, maxCost);
      if (value > bestValue) {
        bestValue = value;
        bestModel = model;
      }
    }

    const beliefStr = this._belief.map((b) => b.toFixed(2)).join(', ');

    return {
      model: bestModel.name,
      provider: bestModel.provider,
      reasoning: `POMDP: selected ${bestModel.name} (belief=[${beliefStr}], value=${bestValue.toFixed(3)})`,
    };
  }

  /**
   * Update belief distribution based on an observed quality signal.
   *
   * Uses simplified Bayesian update (no transition model -- tasks are
   * independent per LLD Note H2):
   *   b'(s) = P(obs|s) * b(s) / normalization
   *
   * Then clamps to [BELIEF_FLOOR, BELIEF_CEILING] and re-normalizes.
   */
  updateBelief(observation: 'poor' | 'fair' | 'good'): void {
    const obsIdx = OBSERVATION_INDEX[observation];

    // Bayesian update: b'(s) proportional to P(obs|s) * b(s)
    const unnormalized = new Array<number>(NUM_STATES);
    for (let s = 0; s < NUM_STATES; s++) {
      unnormalized[s] = OBSERVATION_MODEL[s][obsIdx] * this._belief[s];
    }

    // Normalize
    const total = unnormalized.reduce((sum, v) => sum + v, 0);
    for (let s = 0; s < NUM_STATES; s++) {
      this._belief[s] = unnormalized[s] / total;
    }

    // Clamp to prevent degenerate beliefs
    this._clampAndNormalize();
  }

  /**
   * Get a copy of the current belief distribution.
   * Returns [P(low), P(medium), P(high)].
   */
  getBelief(): readonly number[] {
    return [...this._belief];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Compute expected value for a model under the current belief.
   *
   * V(a) = sum_s(belief[s] * qualityReward(s, a)) - costPenalty * normalizedCost
   */
  private _computeExpectedValue(model: ModelInfo, maxCost: number): number {
    let expectedReward = 0;

    for (let s = 0; s < NUM_STATES; s++) {
      const reward = this._qualityReward(s, model);
      expectedReward += this._belief[s] * reward;
    }

    // Cost penalty normalized to [0, 1]
    const costPenalty = maxCost > 0
      ? model.costPerOutputToken / maxCost
      : 0;

    return expectedReward - COST_PENALTY_WEIGHT * costPenalty;
  }

  /**
   * Quality reward function: how well does this model serve a given state?
   *
   * Per LLD Section 2.8:
   * - High state (s=2) + high quality model (>= 0.8): reward = 1.0
   * - Medium state (s=1) + adequate model (>= 0.6): reward = 0.8
   * - Low state (s=0): reward = qualityScore (any model helps)
   * - Otherwise: reward = qualityScore * 0.7
   */
  private _qualityReward(state: number, model: ModelInfo): number {
    const q = model.qualityScore;

    if (state === 2 && q >= 0.8) {
      return 1.0;
    }
    if (state === 1 && q >= 0.6) {
      return 0.8;
    }
    if (state === 0) {
      return q;
    }

    return q * 0.7;
  }

  /**
   * Clamp each belief component to [BELIEF_FLOOR, BELIEF_CEILING]
   * and re-normalize so the distribution sums to 1.
   */
  private _clampAndNormalize(): void {
    for (let s = 0; s < NUM_STATES; s++) {
      this._belief[s] = Math.max(BELIEF_FLOOR, Math.min(BELIEF_CEILING, this._belief[s]));
    }

    const total = this._belief.reduce((sum, v) => sum + v, 0);
    for (let s = 0; s < NUM_STATES; s++) {
      this._belief[s] = this._belief[s] / total;
    }
  }
}
