// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Balanced Routing Strategy
 *
 * Pareto-optimal weighted selection balancing cost and quality.
 * Source of truth: Phase 1 LLD Section 2.7.
 *
 * Algorithm:
 * 1. Filter available models
 * 2. Normalize costs to [0, 1] (min-max normalization on costPerOutputToken)
 * 3. Compute Pareto score: weightQuality * qualityScore + weightCost * (1 - costNorm)
 * 4. Return model with highest score
 *
 * WHY balanced: Most production workloads need BOTH good quality AND
 * reasonable cost. The weight parameter lets operators tune the tradeoff.
 * Default 0.6 quality / 0.4 cost is quality-leaning -- reflecting that
 * in enterprise settings, correctness usually matters more than saving
 * a few cents per request.
 */

import type { ModelRequest } from '../../types/common.js';
import type { ModelInfo, RoutingStrategy, StrategyDecision } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHT_QUALITY = 0.6;

/**
 * When all models have the same cost, normalization would produce 0/0.
 * Use 0.5 as a neutral midpoint so cost doesn't dominate or vanish.
 */
const EQUAL_COST_NORM = 0.5;

// ---------------------------------------------------------------------------
// BalancedStrategy
// ---------------------------------------------------------------------------

export class BalancedStrategy implements RoutingStrategy {
  readonly name = 'balanced' as const;

  private readonly _weightQuality: number;
  private readonly _weightCost: number;

  /**
   * @param weightQuality - Quality weight in [0, 1]. Default 0.6.
   *   Cost weight is automatically (1 - weightQuality).
   */
  constructor(weightQuality?: number) {
    this._weightQuality = weightQuality ?? DEFAULT_WEIGHT_QUALITY;
    this._weightCost = 1 - this._weightQuality;
  }

  /**
   * Select the Pareto-optimal model based on weighted cost/quality score.
   */
  select(_request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision {
    const available = models.filter((m) => m.available);

    if (available.length === 0) {
      throw new Error('No models available for balanced strategy');
    }

    // Step 1: Find min/max cost for normalization
    const costs = available.map((m) => m.costPerOutputToken);
    const maxCost = Math.max(...costs);
    const minCost = Math.min(...costs);
    const costRange = maxCost - minCost;

    // Step 2: Score each model
    const scored = available.map((m) => {
      // Normalize cost to [0, 1]. 0 = cheapest, 1 = most expensive.
      const costNorm =
        costRange === 0
          ? EQUAL_COST_NORM
          : (m.costPerOutputToken - minCost) / costRange;

      // Pareto score: high quality AND low cost both contribute positively
      const score =
        m.qualityScore * this._weightQuality +
        (1 - costNorm) * this._weightCost;

      return { model: m, costNorm, score };
    });

    // Step 3: Sort by score descending, pick best
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      model: best.model.name,
      provider: best.model.provider,
      reasoning: `Balanced: selected ${best.model.name} (Pareto score ${best.score.toFixed(3)}, quality ${best.model.qualityScore}, cost-norm ${best.costNorm.toFixed(3)}, weights q=${this._weightQuality}/c=${this._weightCost})`,
    };
  }
}
