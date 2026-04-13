// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Cascade Routing Strategy
 *
 * Try cheapest model first, escalate to higher quality if threshold not met.
 * Source of truth: Phase 1 LLD Section 2.4.
 *
 * Algorithm:
 * 1. Filter available models
 * 2. Sort by cost ascending (cheapest first)
 * 3. Determine quality threshold from request.quality
 * 4. Pick first model that meets threshold
 * 5. If none meet threshold, fall back to highest-quality model
 *
 * WHY cascade: Most tasks don't need the most expensive model.
 * Start cheap, only escalate when quality demands it. This is the
 * default strategy -- it balances cost and quality adaptively.
 */

import type { ModelRequest } from '../../types/common.js';
import type { ModelInfo, RoutingStrategy, StrategyDecision } from './types.js';

// ---------------------------------------------------------------------------
// Quality thresholds per quality level
// ---------------------------------------------------------------------------

/** Maps request quality level to minimum qualityScore threshold. */
const QUALITY_THRESHOLDS: Readonly<Record<string, number>> = {
  low: 0.5,
  medium: 0.7,
  high: 0.85,
} as const;

const DEFAULT_QUALITY = 'medium';

// ---------------------------------------------------------------------------
// CascadeStrategy
// ---------------------------------------------------------------------------

export class CascadeStrategy implements RoutingStrategy {
  readonly name = 'cascade' as const;

  /**
   * Select cheapest model that meets the quality threshold.
   * Falls back to highest-quality model if none meet the threshold.
   */
  select(request: ModelRequest, models: readonly ModelInfo[]): StrategyDecision {
    const available = models.filter((m) => m.available);

    if (available.length === 0) {
      throw new Error('No models available for cascade strategy');
    }

    // Sort by cost ascending (cheapest first)
    const sortedByCost = [...available].sort(
      (a, b) => a.costPerOutputToken - b.costPerOutputToken,
    );

    // Determine threshold from request quality
    const qualityLevel = request.quality ?? DEFAULT_QUALITY;
    const threshold = QUALITY_THRESHOLDS[qualityLevel] ?? QUALITY_THRESHOLDS[DEFAULT_QUALITY];

    // Try cheapest first, escalate until quality threshold met
    for (let i = 0; i < sortedByCost.length; i++) {
      const model = sortedByCost[i];
      if (model.qualityScore >= threshold) {
        return {
          model: model.name,
          provider: model.provider,
          reasoning: `Cascade: selected ${model.name} (quality ${model.qualityScore} >= threshold ${threshold}, cost tier ${i + 1} of ${sortedByCost.length})`,
        };
      }
    }

    // No model meets threshold -- fall back to highest quality available
    const sortedByQuality = [...available].sort(
      (a, b) => b.qualityScore - a.qualityScore,
    );
    const best = sortedByQuality[0];

    return {
      model: best.name,
      provider: best.provider,
      reasoning: `Cascade: escalated to ${best.name} (best quality available, no model met threshold ${threshold})`,
    };
  }
}
