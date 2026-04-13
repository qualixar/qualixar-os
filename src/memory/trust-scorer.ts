// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Trust Scorer
 * LLD Section 2.1
 *
 * Pure math component. No external dependencies.
 * Formula: score = credibility * (1 - contradiction) * decay * cross_validation
 * Clamped to [0.1, 1.0].
 *
 * Linear decay for memory trust: max(0.1, 1.0 - days * rate)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemorySource = 'agent' | 'user' | 'system' | 'behavioral';

export interface TrustFactors {
  readonly source: MemorySource;
  readonly contradictionCount: number;
  readonly supportCount: number;
  readonly daysSinceCreation: number;
  readonly confirmedByOtherSources: number;
  readonly decayRate: number;
}

export interface TrustBreakdown {
  readonly credibility: number;
  readonly contradictionFactor: number;
  readonly temporalDecay: number;
  readonly crossValidationBoost: number;
  readonly finalScore: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_CREDIBILITY: Record<MemorySource, number> = {
  user: 1.0,
  system: 0.9,
  agent: 0.7,
  behavioral: 0.6,
} as const;

const CONTRADICTION_WEIGHT = 0.2;
const MAX_CONTRADICTION_FACTOR = 0.8;
const DEFAULT_DECAY_RATE = 0.01;
const MIN_TRUST_SCORE = 0.1;
const MIN_DECAY_FLOOR = 0.1;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TrustScorer {
  calculateTrust(factors: TrustFactors): number;
  getBreakdown(factors: TrustFactors): TrustBreakdown;
  shouldArchive(trustScore: number): boolean;
  isPromotionEligible(trustScore: number): boolean;
  shouldSurface(trustScore: number, threshold: number): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TrustScorerImpl implements TrustScorer {
  calculateTrust(factors: TrustFactors): number {
    const breakdown = this._computeFactors(factors);
    return breakdown.finalScore;
  }

  getBreakdown(factors: TrustFactors): TrustBreakdown {
    return this._computeFactors(factors);
  }

  shouldArchive(trustScore: number): boolean {
    return trustScore < 0.15;
  }

  isPromotionEligible(trustScore: number): boolean {
    return trustScore >= 0.6;
  }

  shouldSurface(trustScore: number, threshold: number): boolean {
    return trustScore >= threshold;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _computeFactors(factors: TrustFactors): TrustBreakdown {
    // Step 1: Source credibility
    const credibility = SOURCE_CREDIBILITY[factors.source] ?? 0.5;

    // Step 2: Contradiction penalty
    const rawContradiction = factors.contradictionCount * CONTRADICTION_WEIGHT;
    const contradictionFactor = Math.min(rawContradiction, MAX_CONTRADICTION_FACTOR);

    // Step 3: Temporal decay (LINEAR for memory trust)
    const decayRate = factors.decayRate ?? DEFAULT_DECAY_RATE;
    const temporalDecay = Math.max(
      MIN_DECAY_FLOOR,
      1.0 - factors.daysSinceCreation * decayRate,
    );

    // Step 4: Cross-validation boost
    let crossValidationBoost = 1.0;
    if (factors.confirmedByOtherSources >= 2) {
      crossValidationBoost = 1.25;
    } else if (factors.confirmedByOtherSources >= 1) {
      crossValidationBoost = 1.15;
    }

    // Step 5: Combine all factors
    const score =
      credibility *
      (1.0 - contradictionFactor) *
      temporalDecay *
      crossValidationBoost;

    // Step 6: Clamp to valid range
    const finalScore = Math.max(MIN_TRUST_SCORE, Math.min(1.0, score));

    return {
      credibility,
      contradictionFactor,
      temporalDecay,
      crossValidationBoost,
      finalScore,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTrustScorer(): TrustScorer {
  return new TrustScorerImpl();
}
