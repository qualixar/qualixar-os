/**
 * Phase D2 -- Reliability Scorecard Tests
 */
import { describe, it, expect } from 'vitest';
import {
  computeReliabilityScore,
  getAxiomDefinitions,
  RELIABILITY_DIMENSIONS,
  type AgentSystemState,
} from '../../src/quality/reliability-scorecard.js';

describe('ReliabilityScorecard', () => {
  it('defines exactly 6 dimensions', () => {
    expect(RELIABILITY_DIMENSIONS).toHaveLength(6);
    expect(RELIABILITY_DIMENSIONS.map((d) => d.symbol)).toEqual(['C', 'S', 'R', 'E', 'H', 'G']);
  });

  it('all axioms satisfied for excellent system → deployment ready', () => {
    const state: AgentSystemState = {
      complianceRate: 0.95,
      driftScore: 0.1,
      recoveryRate: 0.85,
      costRatio: 0.6,
      contractsSatisfied: 0.9,
      externalGroundingScore: 0.75,
    };
    const score = computeReliabilityScore(state);
    expect(score.axiomsViolated).toHaveLength(0);
    expect(score.deploymentReady).toBe(true);
    expect(score.overallScore).toBeGreaterThan(0.8);
  });

  it('flags axiom violations for poor system', () => {
    const state: AgentSystemState = {
      complianceRate: 0.5,   // < 0.80 threshold
      driftScore: 0.5,       // S = 0.5, < 0.70
      recoveryRate: 0.3,     // < 0.60
      costRatio: 2.0,        // E = 0.5, < 0.80
      contractsSatisfied: 0.4, // < 0.75
      externalGroundingScore: 0.25, // < 0.50
    };
    const score = computeReliabilityScore(state);
    expect(score.axiomsViolated.length).toBeGreaterThanOrEqual(5);
    expect(score.deploymentReady).toBe(false);
  });

  it('partial axiom satisfaction shows specific violations', () => {
    const state: AgentSystemState = {
      complianceRate: 0.9,   // OK
      driftScore: 0.1,       // OK (S=0.9)
      recoveryRate: 0.4,     // FAIL (< 0.60)
      costRatio: 0.5,        // OK
      contractsSatisfied: 0.5, // FAIL (< 0.75)
      externalGroundingScore: 0.75, // OK
    };
    const score = computeReliabilityScore(state);
    expect(score.axiomsViolated).toHaveLength(2);
    expect(score.axiomsViolated[0]).toContain('R');
    expect(score.axiomsViolated[1]).toContain('H');
  });

  it('getAxiomDefinitions returns all 6 with thresholds', () => {
    const defs = getAxiomDefinitions();
    expect(defs).toHaveLength(6);
    for (const def of defs) {
      expect(def.threshold).toBeGreaterThan(0);
      expect(def.weight).toBeGreaterThan(0);
    }
    // Weights sum to 1.0
    const weightSum = defs.reduce((s, d) => s + d.weight, 0);
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it('clamps dimension values to [0, 1]', () => {
    const state: AgentSystemState = {
      complianceRate: 1.5,    // Over 1.0
      driftScore: -0.5,       // Negative
      recoveryRate: 2.0,
      costRatio: 0.001,
      contractsSatisfied: 1.0,
      externalGroundingScore: 1.0,
    };
    const score = computeReliabilityScore(state);
    for (const dim of score.dimensions) {
      expect(dim.value).toBeGreaterThanOrEqual(0);
      expect(dim.value).toBeLessThanOrEqual(1);
    }
  });
});
