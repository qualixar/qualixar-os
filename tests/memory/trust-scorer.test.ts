/**
 * Qualixar OS Phase 5 -- Trust Scorer Tests
 * LLD Section 6.1 + 6.2
 */

import { describe, it, expect } from 'vitest';
import { TrustScorerImpl, createTrustScorer, type TrustFactors } from '../../src/memory/trust-scorer.js';

describe('TrustScorerImpl', () => {
  const scorer = new TrustScorerImpl();

  const baseFact: TrustFactors = {
    source: 'user',
    contradictionCount: 0,
    supportCount: 0,
    daysSinceCreation: 0,
    confirmedByOtherSources: 0,
    decayRate: 0.01,
  };

  // -----------------------------------------------------------------------
  // Source credibility
  // -----------------------------------------------------------------------

  it('user source credibility = 1.0', () => {
    const result = scorer.getBreakdown({ ...baseFact, source: 'user' });
    expect(result.credibility).toBe(1.0);
  });

  it('system source credibility = 0.9', () => {
    const result = scorer.getBreakdown({ ...baseFact, source: 'system' });
    expect(result.credibility).toBe(0.9);
  });

  it('agent source credibility = 0.7', () => {
    const result = scorer.getBreakdown({ ...baseFact, source: 'agent' });
    expect(result.credibility).toBe(0.7);
  });

  it('behavioral source credibility = 0.6', () => {
    const result = scorer.getBreakdown({ ...baseFact, source: 'behavioral' });
    expect(result.credibility).toBe(0.6);
  });

  // -----------------------------------------------------------------------
  // Contradiction factor
  // -----------------------------------------------------------------------

  it('0 contradictions: factor = 0', () => {
    const result = scorer.getBreakdown({ ...baseFact, contradictionCount: 0 });
    expect(result.contradictionFactor).toBe(0);
  });

  it('3 contradictions: factor = 0.6', () => {
    const result = scorer.getBreakdown({ ...baseFact, contradictionCount: 3 });
    expect(result.contradictionFactor).toBeCloseTo(0.6, 5);
  });

  it('5 contradictions: capped at 0.8', () => {
    const result = scorer.getBreakdown({ ...baseFact, contradictionCount: 5 });
    expect(result.contradictionFactor).toBe(0.8);
  });

  // -----------------------------------------------------------------------
  // Temporal decay (linear)
  // -----------------------------------------------------------------------

  it('0 days decay: factor = 1.0', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 0 });
    expect(result.temporalDecay).toBe(1.0);
  });

  it('1 day decay at 0.01: ~0.99', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 1 });
    expect(result.temporalDecay).toBeCloseTo(0.99, 2);
  });

  it('7 days decay at 0.01: ~0.93', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 7 });
    expect(result.temporalDecay).toBeCloseTo(0.93, 2);
  });

  it('30 days decay at 0.01: ~0.70', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 30 });
    expect(result.temporalDecay).toBeCloseTo(0.70, 2);
  });

  it('90 days: minimum floor 0.1', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 90 });
    expect(result.temporalDecay).toBe(0.1);
  });

  it('100 days: minimum floor 0.1', () => {
    const result = scorer.getBreakdown({ ...baseFact, daysSinceCreation: 100 });
    expect(result.temporalDecay).toBe(0.1);
  });

  it('custom rate 0.05: faster decay', () => {
    const result = scorer.getBreakdown({
      ...baseFact,
      daysSinceCreation: 10,
      decayRate: 0.05,
    });
    expect(result.temporalDecay).toBeCloseTo(0.5, 2);
  });

  it('zero rate: no decay', () => {
    const result = scorer.getBreakdown({
      ...baseFact,
      daysSinceCreation: 100,
      decayRate: 0,
    });
    expect(result.temporalDecay).toBe(1.0);
  });

  // -----------------------------------------------------------------------
  // Cross-validation boost
  // -----------------------------------------------------------------------

  it('0 cross-validations: boost = 1.0', () => {
    const result = scorer.getBreakdown({ ...baseFact, confirmedByOtherSources: 0 });
    expect(result.crossValidationBoost).toBe(1.0);
  });

  it('1 cross-validation: boost = 1.15', () => {
    const result = scorer.getBreakdown({ ...baseFact, confirmedByOtherSources: 1 });
    expect(result.crossValidationBoost).toBe(1.15);
  });

  it('2+ cross-validations: boost = 1.25', () => {
    const result = scorer.getBreakdown({ ...baseFact, confirmedByOtherSources: 2 });
    expect(result.crossValidationBoost).toBe(1.25);
  });

  it('3 cross-validations: boost = 1.25', () => {
    const result = scorer.getBreakdown({ ...baseFact, confirmedByOtherSources: 3 });
    expect(result.crossValidationBoost).toBe(1.25);
  });

  // -----------------------------------------------------------------------
  // Combined & clamping
  // -----------------------------------------------------------------------

  it('all factors combined correctly', () => {
    const score = scorer.calculateTrust({
      source: 'agent',
      contradictionCount: 1,
      supportCount: 0,
      daysSinceCreation: 10,
      confirmedByOtherSources: 1,
      decayRate: 0.01,
    });
    // credibility=0.7, contradiction=0.2, decay=0.9, cross=1.15
    // 0.7 * (1-0.2) * 0.9 * 1.15 = 0.7 * 0.8 * 0.9 * 1.15 = 0.5796
    expect(score).toBeCloseTo(0.5796, 3);
  });

  it('clamped to minimum 0.1', () => {
    const score = scorer.calculateTrust({
      source: 'behavioral',
      contradictionCount: 4,
      supportCount: 0,
      daysSinceCreation: 90,
      confirmedByOtherSources: 0,
      decayRate: 0.01,
    });
    expect(score).toBe(0.1);
  });

  it('clamped to maximum 1.0', () => {
    const score = scorer.calculateTrust({
      source: 'user',
      contradictionCount: 0,
      supportCount: 0,
      daysSinceCreation: 0,
      confirmedByOtherSources: 3,
      decayRate: 0,
    });
    // 1.0 * 1.0 * 1.0 * 1.25 = 1.25 -> clamped to 1.0
    expect(score).toBe(1.0);
  });

  // -----------------------------------------------------------------------
  // Threshold methods
  // -----------------------------------------------------------------------

  it('shouldArchive(0.14) = true', () => {
    expect(scorer.shouldArchive(0.14)).toBe(true);
  });

  it('shouldArchive(0.15) = false', () => {
    expect(scorer.shouldArchive(0.15)).toBe(false);
  });

  it('shouldArchive(0.149) = true', () => {
    expect(scorer.shouldArchive(0.149)).toBe(true);
  });

  it('isPromotionEligible(0.6) = true', () => {
    expect(scorer.isPromotionEligible(0.6)).toBe(true);
  });

  it('isPromotionEligible(0.59) = false', () => {
    expect(scorer.isPromotionEligible(0.59)).toBe(false);
  });

  it('isPromotionEligible(0.8) = true', () => {
    expect(scorer.isPromotionEligible(0.8)).toBe(true);
  });

  it('shouldSurface(0.5, 0.3) = true', () => {
    expect(scorer.shouldSurface(0.5, 0.3)).toBe(true);
  });

  it('shouldSurface(0.2, 0.3) = false', () => {
    expect(scorer.shouldSurface(0.2, 0.3)).toBe(false);
  });

  it('shouldSurface(0.3, 0.3) = true', () => {
    expect(scorer.shouldSurface(0.3, 0.3)).toBe(true);
  });
});

describe('createTrustScorer factory', () => {
  it('returns TrustScorer instance', () => {
    const ts = createTrustScorer();
    expect(ts).toBeDefined();
    expect(typeof ts.calculateTrust).toBe('function');
    expect(typeof ts.getBreakdown).toBe('function');
    expect(typeof ts.shouldArchive).toBe('function');
    expect(typeof ts.isPromotionEligible).toBe('function');
    expect(typeof ts.shouldSurface).toBe('function');
  });
});
