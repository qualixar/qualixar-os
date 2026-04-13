// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Quality Routing Strategy
 *
 * Always select the highest quality-score model.
 * Source of truth: Phase 1 LLD Section 2.6.
 *
 * Algorithm:
 * 1. Filter available models
 * 2. Sort by qualityScore descending
 * 3. Return highest quality
 *
 * WHY quality: When correctness matters more than cost -- e.g., code generation,
 * complex reasoning, safety-critical tasks. Paired with a budget checker to
 * prevent runaway spend.
 */

import type { ModelRequest } from '../../types/common.js';
import type { ModelInfo, RoutingStrategy, StrategyDecision } from './types.js';

// ---------------------------------------------------------------------------
// QualityStrategy
// ---------------------------------------------------------------------------

export class QualityStrategy implements RoutingStrategy {
  readonly name = 'quality' as const;

  /**
   * Select the model with the highest quality score.
   */
  select(_request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision {
    const available = models.filter((m) => m.available);

    if (available.length === 0) {
      throw new Error('No models available for quality strategy');
    }

    // Sort by qualityScore descending
    const sorted = [...available].sort(
      (a, b) => b.qualityScore - a.qualityScore,
    );

    const selected = sorted[0];

    return {
      model: selected.name,
      provider: selected.provider,
      reasoning: `Quality: selected ${selected.name} with quality score ${selected.qualityScore}`,
    };
  }
}
