// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase B1 -- ABC Drift Bounds
 *
 * Ported from AgentAssert Phase 3 (Python canonical implementation).
 * Paper reference: Θ=0.877 is the empirical threshold from AgentAssert (arXiv:2602.22302)
 * Empirical formulas from TECHNICAL-ATTACHMENT.md:
 *   §5.1: D(t) = w_c × D_compliance + w_d × JSD(P_t || P_ref)
 *   §5.7: Θ = 0.35C̄ + 0.25(1-D̄) + 0.20(1/(1+E)) + 0.20S
 *
 * Provides: DriftTracker, ComplianceTracker, computeTheta, DriftMonitor
 * JSD computed in pure TypeScript (no scipy dependency).
 */

import { shannonEntropyLn as shannonEntropy } from '../utils/math.js';

// ---------------------------------------------------------------------------
// Configuration Types (empirical defaults from AgentAssert)
// ---------------------------------------------------------------------------

export interface DriftWeights {
  readonly compliance: number;    // w_c (default 0.6)
  readonly distributional: number; // w_d (default 0.4)
}

export interface DriftThresholds {
  readonly warning: number;  // default 0.3
  readonly critical: number; // default 0.6
}

export interface DriftConfig {
  readonly weights: DriftWeights;
  readonly thresholds: DriftThresholds;
  readonly window: number;
}

export interface ReliabilityWeights {
  readonly compliance: number;      // 0.35
  readonly drift: number;           // 0.25
  readonly eventFreq: number;       // 0.20
  readonly recoverySuccess: number; // 0.20
}

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  weights: { compliance: 0.6, distributional: 0.4 },
  thresholds: { warning: 0.3, critical: 0.6 },
  window: 50,
} as const;

export const DEFAULT_RELIABILITY_WEIGHTS: ReliabilityWeights = {
  compliance: 0.35,
  drift: 0.25,
  eventFreq: 0.20,
  recoverySuccess: 0.20,
} as const;

// ---------------------------------------------------------------------------
// JSD — Pure TypeScript (no scipy)
// ---------------------------------------------------------------------------

/**
 * Jensen-Shannon Divergence between distributions p and q.
 * Returns JSD in [0, ln(2)]. Uses natural log (base e) like scipy.
 *
 * JSD(P||Q) = H(M) - (H(P) + H(Q))/2 where M = (P+Q)/2
 *
 * Normalizes inputs to valid probability distributions.
 * Patent: §5.1 — D_distributional(t) = JSD(P_t || P_ref).
 */
export function computeJsd(p: readonly number[], q: readonly number[]): number {
  if (p.length !== q.length) {
    throw new Error(`Distribution lengths must match: ${p.length} vs ${q.length}`);
  }

  // Normalize
  const pSum = p.reduce((s, v) => s + v, 0);
  const qSum = q.reduce((s, v) => s + v, 0);

  const pNorm = pSum > 0 ? p.map((v) => v / pSum) : p;
  const qNorm = qSum > 0 ? q.map((v) => v / qSum) : q;

  // M = (P + Q) / 2
  const m = pNorm.map((pi, i) => (pi + qNorm[i]) / 2);

  // JSD = H(M) - (H(P) + H(Q)) / 2
  return shannonEntropy(m) - (shannonEntropy(pNorm) + shannonEntropy(qNorm)) / 2;
}

// ---------------------------------------------------------------------------
// ComplianceTracker (patent §3.1)
// ---------------------------------------------------------------------------

export interface ComplianceTracker {
  record(cHard: number, cSoft: number): void;
  readonly meanCHard: number;
  readonly meanCSoft: number;
  readonly turnCount: number;
}

class ComplianceTrackerImpl implements ComplianceTracker {
  private _cHardSum = 0;
  private _cSoftSum = 0;
  private _turnCount = 0;

  record(cHard: number, cSoft: number): void {
    this._cHardSum += cHard;
    this._cSoftSum += cSoft;
    this._turnCount += 1;
  }

  get meanCHard(): number {
    return this._turnCount === 0 ? 1.0 : this._cHardSum / this._turnCount;
  }

  get meanCSoft(): number {
    return this._turnCount === 0 ? 1.0 : this._cSoftSum / this._turnCount;
  }

  get turnCount(): number {
    return this._turnCount;
  }
}

export function createComplianceTracker(): ComplianceTracker {
  return new ComplianceTrackerImpl();
}

// ---------------------------------------------------------------------------
// DriftTracker (patent §5.1)
// ---------------------------------------------------------------------------

export interface DriftTracker {
  setReference(distribution: Record<string, number>): void;
  computeDrift(cTotal: number, actionDist?: Record<string, number>): number;
  isWarning(d: number): boolean;
  isCritical(d: number): boolean;
  readonly meanDrift: number;
  readonly history: readonly number[];
}

class DriftTrackerImpl implements DriftTracker {
  private readonly _config: DriftConfig;
  private _reference: Record<string, number> | null = null;
  private readonly _history: number[] = [];

  constructor(config?: Partial<DriftConfig>) {
    this._config = { ...DEFAULT_DRIFT_CONFIG, ...config };
  }

  setReference(distribution: Record<string, number>): void {
    this._reference = { ...distribution };
  }

  computeDrift(cTotal: number, actionDist?: Record<string, number>): number {
    const wC = this._config.weights.compliance;
    const wD = this._config.weights.distributional;

    // D_compliance = 1 - C(t)
    const dCompliance = 1.0 - cTotal;

    // D_distributional = JSD(P_t || P_ref)
    let dDistributional = 0.0;
    if (actionDist && this._reference) {
      dDistributional = this._computeJsdFromDicts(actionDist, this._reference);
    }

    const dT = wC * dCompliance + wD * dDistributional;
    this._history.push(dT);
    // H-08: cap history to prevent unbounded growth
    const maxHistory = this._config.window * 2;
    if (this._history.length > maxHistory) {
      this._history.splice(0, this._history.length - maxHistory);
    }
    return dT;
  }

  isWarning(d: number): boolean {
    return d >= this._config.thresholds.warning;
  }

  isCritical(d: number): boolean {
    return d >= this._config.thresholds.critical;
  }

  get meanDrift(): number {
    if (this._history.length === 0) return 0;
    return this._history.reduce((s, v) => s + v, 0) / this._history.length;
  }

  get history(): readonly number[] {
    return [...this._history];
  }

  private _computeJsdFromDicts(
    current: Record<string, number>,
    reference: Record<string, number>,
  ): number {
    const allKeys = [...new Set([...Object.keys(current), ...Object.keys(reference)])].sort();
    const p = allKeys.map((k) => current[k] ?? 0);
    const q = allKeys.map((k) => reference[k] ?? 0);
    return computeJsd(p, q);
  }
}

export function createDriftTracker(config?: Partial<DriftConfig>): DriftTracker {
  return new DriftTrackerImpl(config);
}

// ---------------------------------------------------------------------------
// Reliability Index Θ (patent §5.7)
// ---------------------------------------------------------------------------

/**
 * Compute Reliability Index Θ.
 *
 * Θ = 0.35 × C̄ + 0.25 × (1 - D̄) + 0.20 × (1/(1+E)) + 0.20 × S
 *
 * Patent §5.7. Θ >= 0.90 = deployment ready.
 */
export function computeTheta(
  cBar: number,
  dBar: number,
  events: number,
  recoveryRate: number,
  weights?: ReliabilityWeights,
): number {
  const w = weights ?? DEFAULT_RELIABILITY_WEIGHTS;

  return (
    w.compliance * cBar +
    w.drift * (1.0 - dBar) +
    w.eventFreq * (1.0 / (1.0 + events)) +
    w.recoverySuccess * recoveryRate
  );
}

// ---------------------------------------------------------------------------
// DriftMonitor (integrates all components)
// ---------------------------------------------------------------------------

export interface DriftMonitorSummary {
  readonly theta: number;
  readonly currentDrift: number;
  readonly meanDrift: number;
  readonly meanCompliance: number;
  readonly violations: number;
  readonly recoveryRate: number;
  readonly turnCount: number;
  readonly deploymentReady: boolean;
}

export interface DriftMonitor {
  recordTurn(cHard: number, cSoft: number, cTotal: number, actionDist?: Record<string, number>): void;
  recordViolation(): void;
  recordRecovery(success: boolean): void;
  getTheta(): number;
  getSummary(): DriftMonitorSummary;
}

class DriftMonitorImpl implements DriftMonitor {
  private readonly _compliance = new ComplianceTrackerImpl();
  private readonly _drift: DriftTrackerImpl;
  private _violations = 0;
  private _recoveryAttempts = 0;
  private _recoverySuccesses = 0;

  constructor(config?: Partial<DriftConfig>) {
    this._drift = new DriftTrackerImpl(config);
  }

  recordTurn(
    cHard: number,
    cSoft: number,
    cTotal: number,
    actionDist?: Record<string, number>,
  ): void {
    this._compliance.record(cHard, cSoft);
    this._drift.computeDrift(cTotal, actionDist);
  }

  recordViolation(): void {
    this._violations += 1;
  }

  recordRecovery(success: boolean): void {
    this._recoveryAttempts += 1;
    if (success) this._recoverySuccesses += 1;
  }

  getTheta(): number {
    const cBar = (this._compliance.meanCHard + this._compliance.meanCSoft) / 2;
    const dBar = this._drift.meanDrift;
    const recoveryRate = this._recoveryAttempts > 0
      ? this._recoverySuccesses / this._recoveryAttempts
      : 1.0;

    return computeTheta(cBar, dBar, this._violations, recoveryRate);
  }

  getSummary(): DriftMonitorSummary {
    const theta = this.getTheta();
    const history = this._drift.history;

    return {
      theta,
      currentDrift: history.length > 0 ? history[history.length - 1] : 0,
      meanDrift: this._drift.meanDrift,
      meanCompliance: (this._compliance.meanCHard + this._compliance.meanCSoft) / 2,
      violations: this._violations,
      recoveryRate: this._recoveryAttempts > 0
        ? this._recoverySuccesses / this._recoveryAttempts
        : 1.0,
      turnCount: this._compliance.turnCount,
      deploymentReady: theta >= 0.90,
    };
  }
}

export function createDriftMonitor(config?: Partial<DriftConfig>): DriftMonitor {
  return new DriftMonitorImpl(config);
}
