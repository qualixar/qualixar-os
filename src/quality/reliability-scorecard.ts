// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase D2 -- Reliability Scorecard
 *
 * Extends the 4D framework (arXiv:2602.16666) to 6 dimensions.
 * Defines configurable threshold checks that a reliable agent system should satisfy.
 * This is the scoring foundation for the paper.
 *
 * The 6 Dimensions:
 * 1. Compliance (C) — constraint satisfaction rate
 * 2. Stability (S) — drift bounded over time
 * 3. Recoverability (R) — recovery success rate
 * 4. Efficiency (E) — cost within budget
 * 5. Coherence (H) — behavioral contract preservation across redesigns
 * 6. Grounding (G) — external validation (trilemma navigation)
 *
 * Source: Phase D2, AgentAssert paper, Master Synthesis §10
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReliabilityDimension {
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly compute: (state: AgentSystemState) => number;
  /** Threshold rule description (e.g. "C >= 0.80: ..."). */
  readonly axiom: string;
}

export interface AgentSystemState {
  readonly complianceRate: number;      // C̄ across session
  readonly driftScore: number;          // D̄ across session
  readonly recoveryRate: number;        // fraction of successful recoveries
  readonly costRatio: number;           // actual_cost / budget (< 1 = under budget)
  readonly contractsSatisfied: number;  // fraction of behavioral contracts met
  readonly externalGroundingScore: number; // trilemma escape hatch coverage (0-1)
}

export interface ReliabilityScore {
  readonly dimensions: readonly { readonly name: string; readonly symbol: string; readonly value: number }[];
  readonly overallScore: number;        // weighted composite
  readonly axiomsViolated: readonly string[];
  readonly deploymentReady: boolean;    // all thresholds satisfied AND score >= 0.80
}

// ---------------------------------------------------------------------------
// The 6 Dimensions (Threshold Checks)
// ---------------------------------------------------------------------------

export const RELIABILITY_DIMENSIONS: readonly ReliabilityDimension[] = [
  {
    name: 'Compliance',
    symbol: 'C',
    description: 'Fraction of constraints satisfied across all turns',
    axiom: 'C ≥ 0.80: A reliable agent satisfies at least 80% of its constraints',
    compute: (s) => s.complianceRate,
  },
  {
    name: 'Stability',
    symbol: 'S',
    description: 'Behavioral stability (inverse of drift)',
    axiom: 'S ≥ 0.70: Drift must remain bounded below 0.30',
    compute: (s) => 1.0 - s.driftScore,
  },
  {
    name: 'Recoverability',
    symbol: 'R',
    description: 'Rate of successful recovery from violations',
    axiom: 'R ≥ 0.60: At least 60% of violations must be recoverable',
    compute: (s) => s.recoveryRate,
  },
  {
    name: 'Efficiency',
    symbol: 'E',
    description: 'Cost efficiency relative to budget',
    axiom: 'E ≥ 0.80: Efficiency score (inverse of cost ratio) must exceed 0.80',
    compute: (s) => Math.min(1.0, 1.0 / Math.max(s.costRatio, 0.01)),
  },
  {
    name: 'Coherence',
    symbol: 'H',
    description: 'Behavioral contract preservation across team redesigns',
    axiom: 'H ≥ 0.75: Team redesigns must preserve 75%+ of behavioral contracts',
    compute: (s) => s.contractsSatisfied,
  },
  {
    name: 'Grounding',
    symbol: 'G',
    description: 'External validation coverage (trilemma navigation)',
    axiom: 'G ≥ 0.50: At least 2 of 4 external grounding mechanisms must be active',
    compute: (s) => s.externalGroundingScore,
  },
] as const;

// Dimension thresholds
const AXIOM_THRESHOLDS: Record<string, number> = {
  C: 0.80,
  S: 0.70,
  R: 0.60,
  E: 0.80,
  H: 0.75,
  G: 0.50,
};

// Dimension weights for overall score (sum = 1.0)
const DIMENSION_WEIGHTS: Record<string, number> = {
  C: 0.25,
  S: 0.20,
  R: 0.15,
  E: 0.15,
  H: 0.15,
  G: 0.10,
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Compute the 6-dimensional reliability score for an agent system.
 *
 * Returns per-dimension values, overall weighted score, and threshold violations.
 * Deployment-ready when: all thresholds satisfied AND overall >= 0.80.
 */
export function computeReliabilityScore(
  state: AgentSystemState,
): ReliabilityScore {
  const dimensions = RELIABILITY_DIMENSIONS.map((dim) => ({
    name: dim.name,
    symbol: dim.symbol,
    value: Math.max(0, Math.min(1, dim.compute(state))),
  }));

  const axiomsViolated: string[] = [];
  for (const dim of dimensions) {
    const threshold = AXIOM_THRESHOLDS[dim.symbol];
    if (threshold !== undefined && dim.value < threshold) {
      axiomsViolated.push(
        `${dim.symbol} = ${dim.value.toFixed(3)} < ${threshold} (${dim.name})`,
      );
    }
  }

  const overallScore = dimensions.reduce(
    (sum, dim) => sum + (DIMENSION_WEIGHTS[dim.symbol] ?? 0) * dim.value,
    0,
  );

  return {
    dimensions,
    overallScore,
    axiomsViolated,
    deploymentReady: axiomsViolated.length === 0 && overallScore >= 0.80,
  };
}

/**
 * Get the threshold definitions for paper/documentation.
 * Note: The field name "axiom" is kept for API compatibility.
 */
export function getAxiomDefinitions(): readonly {
  readonly dimension: string;
  readonly symbol: string;
  readonly axiom: string;
  readonly threshold: number;
  readonly weight: number;
}[] {
  return RELIABILITY_DIMENSIONS.map((dim) => ({
    dimension: dim.name,
    symbol: dim.symbol,
    axiom: dim.axiom,
    threshold: AXIOM_THRESHOLDS[dim.symbol] ?? 0,
    weight: DIMENSION_WEIGHTS[dim.symbol] ?? 0,
  }));
}
