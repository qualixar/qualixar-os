// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase B2 -- Goodhart Characterization for Judges
 *
 * Detects when judge models optimize for proxy metrics instead of
 * real quality (Goodhart's Law). Uses cross-model entropy tracking,
 * score trend analysis, and calibration task verification.
 *
 * Key signals:
 * 1. Cross-model entropy increasing → models disagree more over time
 * 2. Mean scores rising while entropy rises → proxy optimization
 * 3. Calibration delta > threshold → judges disconnected from ground truth
 *
 * Source: Phase B2 LLD Section 4.1
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoodhartSignal {
  readonly risk: 'none' | 'low' | 'medium' | 'high';
  readonly crossModelEntropy: number;
  readonly entropyTrend: number;
  readonly meanScore: number;
  readonly scoreTrend: number;
  readonly calibrationDelta: number | null;
  readonly reason: string;
}

export interface GoodhartDetectorOptions {
  readonly windowSize?: number;
  readonly minDataPoints?: number;
  readonly highCalibrationThreshold?: number;
}

export interface GoodhartDetector {
  recordVerdict(taskId: string, judgeModel: string, score: number): void;
  recordCalibration(taskId: string, judgeModel: string, expectedScore: number, actualScore: number): void;
  analyze(): GoodhartSignal;
  getHistory(limit?: number): readonly GoodhartSignal[];
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface VerdictEntry {
  readonly taskId: string;
  readonly model: string;
  readonly score: number;
  readonly index: number;
}

interface CalibrationEntry {
  readonly taskId: string;
  readonly model: string;
  readonly expected: number;
  readonly actual: number;
}

import { shannonEntropyLog2 as shannonEntropy, linearSlope } from '../utils/math.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class GoodhartDetectorImpl implements GoodhartDetector {
  private readonly _windowSize: number;
  private readonly _minDataPoints: number;
  private readonly _highCalThreshold: number;
  private readonly _verdicts: VerdictEntry[] = [];
  private readonly _calibrations: CalibrationEntry[] = [];
  private readonly _history: GoodhartSignal[] = [];
  private _nextIndex = 0;

  constructor(options: GoodhartDetectorOptions = {}) {
    this._windowSize = options.windowSize ?? 50;
    this._minDataPoints = options.minDataPoints ?? 10;
    this._highCalThreshold = options.highCalibrationThreshold ?? 0.2;
  }

  recordVerdict(taskId: string, judgeModel: string, score: number): void {
    this._verdicts.push({
      taskId,
      model: judgeModel,
      score: Math.max(0, Math.min(1, score)),
      index: this._nextIndex++,
    });

    // Keep only windowSize * 2 for trend computation
    const maxKeep = this._windowSize * 2;
    if (this._verdicts.length > maxKeep) {
      this._verdicts.splice(0, this._verdicts.length - maxKeep);
    }
  }

  recordCalibration(
    taskId: string,
    judgeModel: string,
    expectedScore: number,
    actualScore: number,
  ): void {
    this._calibrations.push({
      taskId,
      model: judgeModel,
      expected: expectedScore,
      actual: actualScore,
    });
  }

  analyze(): GoodhartSignal {
    // Insufficient data check
    if (this._verdicts.length < this._minDataPoints) {
      const signal: GoodhartSignal = {
        risk: 'none',
        crossModelEntropy: 0,
        entropyTrend: 0,
        meanScore: 0,
        scoreTrend: 0,
        calibrationDelta: null,
        reason: 'insufficient data (need 10+ verdicts)',
      };
      this._history.push(signal);
      return signal;
    }

    // Take the latest window
    const window = this._verdicts.slice(-this._windowSize);

    // Group by model
    const modelScores = new Map<string, number[]>();
    for (const v of window) {
      const existing = modelScores.get(v.model);
      if (existing) {
        existing.push(v.score);
      } else {
        modelScores.set(v.model, [v.score]);
      }
    }

    // Compute cross-model entropy
    const crossModelEntropy = this._computeCrossModelEntropy(modelScores);

    // Compute entropy trend from history
    const recentEntropies = [
      ...this._history.slice(-5).map((h) => h.crossModelEntropy),
      crossModelEntropy,
    ];
    const entropyTrend = linearSlope(recentEntropies);

    // Compute mean score and trend
    const allScores = window.map((v) => v.score);
    const meanScore = allScores.reduce((s, v) => s + v, 0) / allScores.length;
    const scoreTrend = linearSlope(allScores);

    // Compute calibration delta
    const calibrationDelta = this._computeCalibrationDelta();

    // Risk classification
    const risk = this._classifyRisk(
      entropyTrend,
      meanScore,
      scoreTrend,
      calibrationDelta,
    );

    const signal: GoodhartSignal = {
      risk,
      crossModelEntropy,
      entropyTrend,
      meanScore,
      scoreTrend,
      calibrationDelta,
      reason: this._buildReason(risk, entropyTrend, scoreTrend, calibrationDelta),
    };

    this._history.push(signal);
    // H-07: cap history to prevent unbounded growth
    if (this._history.length > this._windowSize * 2) {
      this._history.splice(0, this._history.length - this._windowSize * 2);
    }
    return signal;
  }

  getHistory(limit?: number): readonly GoodhartSignal[] {
    if (limit !== undefined) {
      return this._history.slice(-limit);
    }
    return [...this._history];
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private _computeCrossModelEntropy(
    modelScores: Map<string, number[]>,
  ): number {
    const modelCount = modelScores.size;
    if (modelCount <= 1) return 0;

    // For each task position, compute whether models agree (score within 0.15)
    // Then compute entropy of agreement distribution
    const modelArrays = [...modelScores.values()];
    const minLen = Math.min(...modelArrays.map((a) => a.length));

    if (minLen === 0) return 0;

    let agreeCount = 0;
    let disagreeCount = 0;

    for (let i = 0; i < minLen; i++) {
      const scores = modelArrays.map((arr) => arr[i]);
      const range = Math.max(...scores) - Math.min(...scores);
      if (range < 0.15) {
        agreeCount++;
      } else {
        disagreeCount++;
      }
    }

    const total = agreeCount + disagreeCount;
    if (total === 0) return 0;

    const pAgree = agreeCount / total;
    const pDisagree = disagreeCount / total;

    return shannonEntropy([pAgree, pDisagree]);
  }

  private _computeCalibrationDelta(): number | null {
    if (this._calibrations.length === 0) return null;

    const deltas = this._calibrations.map((c) =>
      Math.abs(c.actual - c.expected),
    );
    return deltas.reduce((s, d) => s + d, 0) / deltas.length;
  }

  private _classifyRisk(
    entropyTrend: number,
    meanScore: number,
    scoreTrend: number,
    calibrationDelta: number | null,
  ): GoodhartSignal['risk'] {
    // HIGH: calibration proves judges are disconnected from reality
    if (calibrationDelta !== null && calibrationDelta > this._highCalThreshold) {
      return 'high';
    }

    // HIGH: entropy rising + scores rising + mean already high
    if (entropyTrend > 0.01 && scoreTrend > 0.005 && meanScore > 0.85) {
      return 'high';
    }

    // MEDIUM: entropy rising AND scores rising (proxy optimization signal)
    if (entropyTrend > 0.005 && scoreTrend > 0.003) {
      return 'medium';
    }

    // LOW: entropy increasing but scores stable
    if (entropyTrend > 0.005) {
      return 'low';
    }

    return 'none';
  }

  private _buildReason(
    risk: GoodhartSignal['risk'],
    entropyTrend: number,
    scoreTrend: number,
    calibrationDelta: number | null,
  ): string {
    if (risk === 'none') return 'no Goodhart indicators detected';

    const parts: string[] = [];
    if (entropyTrend > 0.005) parts.push('cross-model divergence increasing');
    if (scoreTrend > 0.003) parts.push('scores trending upward');
    if (calibrationDelta !== null && calibrationDelta > this._highCalThreshold) {
      parts.push(`calibration gap ${calibrationDelta.toFixed(3)}`);
    }

    return parts.join(', ') || 'Goodhart risk detected';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGoodhartDetector(
  options?: GoodhartDetectorOptions,
): GoodhartDetector {
  return new GoodhartDetectorImpl(options);
}
