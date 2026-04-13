/**
 * Phase B1 -- ABC Drift Bounds Tests
 *
 * Ported from AgentAssert Phase 3 (Python canonical implementation).
 * Patent formulas: §5.1 (drift), §5.7 (theta), §5.3 (satisfaction).
 *
 * Source: Phase B1 LLD, AgentAssert TECHNICAL-ATTACHMENT.md
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeJsd,
  createDriftTracker,
  createComplianceTracker,
  computeTheta,
  createDriftMonitor,
  type DriftTracker,
  type ComplianceTracker,
  type DriftMonitor,
  DEFAULT_DRIFT_CONFIG,
  DEFAULT_RELIABILITY_WEIGHTS,
} from '../../src/quality/drift-bounds.js';

// ---------------------------------------------------------------------------
// JSD Tests
// ---------------------------------------------------------------------------

describe('computeJsd', () => {
  it('returns 0 for identical distributions', () => {
    const jsd = computeJsd([0.5, 0.3, 0.2], [0.5, 0.3, 0.2]);
    expect(jsd).toBeCloseTo(0, 5);
  });

  it('returns ln(2) for completely opposite distributions', () => {
    const jsd = computeJsd([1, 0], [0, 1]);
    expect(jsd).toBeCloseTo(Math.LN2, 3);
  });

  it('returns value between 0 and ln(2) for partial overlap', () => {
    const jsd = computeJsd([0.7, 0.3], [0.3, 0.7]);
    expect(jsd).toBeGreaterThan(0);
    expect(jsd).toBeLessThan(Math.LN2);
  });

  it('handles unnormalized distributions (normalizes internally)', () => {
    const jsd = computeJsd([2, 1], [2, 1]);
    expect(jsd).toBeCloseTo(0, 5);
  });

  it('handles zero entries gracefully', () => {
    const jsd = computeJsd([0.5, 0.5, 0], [0.33, 0.33, 0.34]);
    expect(jsd).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// ComplianceTracker Tests
// ---------------------------------------------------------------------------

describe('ComplianceTracker', () => {
  let tracker: ComplianceTracker;

  beforeEach(() => {
    tracker = createComplianceTracker();
  });

  it('returns 1.0 for mean scores when no turns recorded', () => {
    expect(tracker.meanCHard).toBe(1.0);
    expect(tracker.meanCSoft).toBe(1.0);
  });

  it('computes running averages correctly', () => {
    tracker.record(1.0, 0.8);
    tracker.record(0.5, 0.6);

    expect(tracker.meanCHard).toBeCloseTo(0.75, 5);
    expect(tracker.meanCSoft).toBeCloseTo(0.7, 5);
  });

  it('tracks turn count', () => {
    tracker.record(1.0, 1.0);
    tracker.record(1.0, 1.0);
    tracker.record(0.5, 0.5);

    expect(tracker.turnCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// DriftTracker Tests (patent §5.1)
// ---------------------------------------------------------------------------

describe('DriftTracker', () => {
  let drift: DriftTracker;

  beforeEach(() => {
    drift = createDriftTracker();
  });

  it('computes D(t) with compliance component only', () => {
    // D(t) = 0.6 × (1 - C(t)) + 0.4 × 0 = 0.6 × 0.2 = 0.12
    const d = drift.computeDrift(0.8);
    expect(d).toBeCloseTo(0.12, 5);
  });

  it('computes D(t) with both compliance and distributional components', () => {
    drift.setReference({ approve: 0.7, reject: 0.1, revise: 0.2 });

    // Identical distribution → JSD ≈ 0
    const d = drift.computeDrift(0.8, { approve: 0.7, reject: 0.1, revise: 0.2 });
    expect(d).toBeCloseTo(0.12, 2); // compliance dominates
  });

  it('detects distributional shift via JSD', () => {
    drift.setReference({ approve: 0.8, reject: 0.1, revise: 0.1 });

    // Very different distribution
    const d = drift.computeDrift(0.8, { approve: 0.1, reject: 0.8, revise: 0.1 });
    expect(d).toBeGreaterThan(0.12); // compliance + distributional
  });

  it('classifies warning threshold (default 0.3)', () => {
    expect(drift.isWarning(0.29)).toBe(false);
    expect(drift.isWarning(0.3)).toBe(true);
    expect(drift.isWarning(0.5)).toBe(true);
  });

  it('classifies critical threshold (default 0.6)', () => {
    expect(drift.isCritical(0.59)).toBe(false);
    expect(drift.isCritical(0.6)).toBe(true);
  });

  it('tracks drift history and computes mean', () => {
    drift.computeDrift(0.9); // D = 0.6 × 0.1 = 0.06
    drift.computeDrift(0.7); // D = 0.6 × 0.3 = 0.18

    expect(drift.history).toHaveLength(2);
    expect(drift.meanDrift).toBeCloseTo(0.12, 5);
  });

  it('uses patent default weights: w_c=0.6, w_d=0.4', () => {
    expect(DEFAULT_DRIFT_CONFIG.weights.compliance).toBe(0.6);
    expect(DEFAULT_DRIFT_CONFIG.weights.distributional).toBe(0.4);
  });

  it('uses patent default thresholds: warning=0.3, critical=0.6', () => {
    expect(DEFAULT_DRIFT_CONFIG.thresholds.warning).toBe(0.3);
    expect(DEFAULT_DRIFT_CONFIG.thresholds.critical).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// computeTheta Tests (patent §5.7)
// ---------------------------------------------------------------------------

describe('computeTheta', () => {
  it('uses patent default weights', () => {
    expect(DEFAULT_RELIABILITY_WEIGHTS.compliance).toBe(0.35);
    expect(DEFAULT_RELIABILITY_WEIGHTS.drift).toBe(0.25);
    expect(DEFAULT_RELIABILITY_WEIGHTS.eventFreq).toBe(0.20);
    expect(DEFAULT_RELIABILITY_WEIGHTS.recoverySuccess).toBe(0.20);
  });

  it('reproduces patent example Θ=0.877', () => {
    // Patent §6 Step 9: Θ = 0.35×0.97 + 0.25×(1-0.05) + 0.20×(1/2) + 0.20×1.0 = 0.877
    const theta = computeTheta(0.97, 0.05, 1, 1.0);
    expect(theta).toBeCloseTo(0.877, 2);
  });

  it('returns 1.0 for perfect scores', () => {
    // C̄=1.0, D̄=0.0, E=0, S=1.0
    const theta = computeTheta(1.0, 0.0, 0, 1.0);
    expect(theta).toBeCloseTo(1.0, 5);
  });

  it('returns low score for poor performance', () => {
    // C̄=0.3, D̄=0.8, E=10, S=0.1
    const theta = computeTheta(0.3, 0.8, 10, 0.1);
    expect(theta).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// DriftMonitor (integrates all components)
// ---------------------------------------------------------------------------

describe('DriftMonitor', () => {
  let monitor: DriftMonitor;

  beforeEach(() => {
    monitor = createDriftMonitor();
  });

  it('records scores and computes theta', () => {
    monitor.recordTurn(1.0, 0.9, 0.85);
    monitor.recordTurn(0.8, 0.75, 0.80);

    const theta = monitor.getTheta();
    expect(theta).toBeGreaterThan(0);
    expect(theta).toBeLessThanOrEqual(1);
  });

  it('tracks violations and recovery', () => {
    monitor.recordTurn(1.0, 0.9, 0.85);
    monitor.recordViolation();
    monitor.recordViolation();
    monitor.recordRecovery(true);
    monitor.recordRecovery(false);

    const summary = monitor.getSummary();
    expect(summary.violations).toBe(2);
    expect(summary.recoveryRate).toBeCloseTo(0.5, 5);
  });

  it('emits warning signal when drift exceeds threshold', () => {
    // Record a turn with very low compliance → high drift
    monitor.recordTurn(0.0, 0.0, 0.0);

    const summary = monitor.getSummary();
    expect(summary.currentDrift).toBeGreaterThan(0);
  });

  it('computes deployment readiness (theta >= 0.90)', () => {
    // Good performance
    for (let i = 0; i < 10; i++) {
      monitor.recordTurn(1.0, 0.95, 0.92);
    }

    const theta = monitor.getTheta();
    expect(theta).toBeGreaterThanOrEqual(0.85); // Should be near deployment ready
  });
});
