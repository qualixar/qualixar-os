// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Cheapest Routing Strategy
 *
 * Always select the lowest cost-per-token model.
 * Source of truth: Phase 1 LLD Section 2.5.
 *
 * Algorithm:
 * 1. Filter available models
 * 2. Sort by total cost (costPerInputToken + costPerOutputToken) ascending
 * 3. Return cheapest
 *
 * WHY cheapest: When budget is tight or the task is simple (e.g., formatting,
 * summarization), there's no reason to use an expensive model. This strategy
 * minimizes cost unconditionally.
 */

import type { ModelRequest } from '../../types/common.js';
import type { ModelInfo, RoutingStrategy, StrategyDecision } from './types.js';

// ---------------------------------------------------------------------------
// CheapestStrategy
// ---------------------------------------------------------------------------

export class CheapestStrategy implements RoutingStrategy {
  readonly name = 'cheapest' as const;

  /**
   * Select the model with the lowest total cost per token.
   */
  select(_request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision {
    const available = models.filter((m) => m.available);

    if (available.length === 0) {
      throw new Error('No models available for cheapest strategy');
    }

    // Sort by total cost per token (input + output)
    const sorted = [...available].sort(
      (a, b) =>
        (a.costPerInputToken + a.costPerOutputToken) -
        (b.costPerInputToken + b.costPerOutputToken),
    );

    const selected = sorted[0];

    return {
      model: selected.name,
      provider: selected.provider,
      reasoning: `Cheapest: selected ${selected.name} at $${selected.costPerOutputToken}/output token`,
    };
  }
}
