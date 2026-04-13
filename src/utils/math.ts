// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Shared math utilities
 *
 * Extracted from goodhart-detector.ts and drift-bounds.ts to eliminate
 * duplication (audit M-03). Two entropy variants coexist because the
 * Goodhart detector uses base-2 log (information theory convention)
 * while JSD/drift-bounds uses natural log (scipy convention).
 */

// ---------------------------------------------------------------------------
// Shannon Entropy
// ---------------------------------------------------------------------------

/**
 * Shannon entropy H(P) = -Sigma p_i * log2(p_i), base-2 log.
 * Used by Goodhart detector for cross-model entropy analysis.
 * Returns 0 for a single-element distribution [1].
 */
export function shannonEntropyLog2(probs: readonly number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 0) {
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * Shannon entropy H(P) = -Sigma p_i * ln(p_i), natural log base.
 * Used by JSD computation in drift-bounds (matches scipy convention).
 * Returns 0 for a single-element distribution [1].
 */
export function shannonEntropyLn(p: readonly number[]): number {
  let h = 0;
  for (const pi of p) {
    if (pi > 0) {
      h -= pi * Math.log(pi);
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Linear Regression
// ---------------------------------------------------------------------------

/**
 * Simple linear regression slope via least-squares.
 * X-values are implicit indices [0, 1, 2, ...].
 * Returns 0 for fewer than 2 data points.
 */
export function linearSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}
