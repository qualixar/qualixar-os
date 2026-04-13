// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase C2 -- Self-Evolution Trilemma Navigation
 *
 * Wang et al. (2026) proved: self-evolution + isolation + safety are
 * mutually exclusive. A system cannot improve itself, evaluate itself
 * in isolation, AND guarantee safety — simultaneously.
 *
 * Qualixar OS navigates this by BREAKING ISOLATION:
 * 1. Different-model judges (not self-evaluating)
 * 2. Human escalation gates (external grounding)
 * 3. Drift bounds (mathematical safety constraints from AgentAssert)
 * 4. Calibration tasks (environment feedback via Goodhart detector)
 *
 * This guard monitors whether the trilemma escape hatches are active
 * and flags when the system risks operating without external grounding.
 *
 * Source: Phase C2, Wang et al. impossibility result, AgentAssert §5.4
 */

import type { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrilemmaStatus {
  readonly selfEvolution: boolean;      // Is Forge→Judge→RL loop active?
  readonly externalGrounding: {
    readonly differentModelJudges: boolean;  // Escape hatch 1
    readonly humanGatesActive: boolean;       // Escape hatch 2
    readonly driftBoundsActive: boolean;      // Escape hatch 3
    readonly calibrationActive: boolean;      // Escape hatch 4
  };
  readonly safetyLevel: 'safe' | 'degraded' | 'unsafe';
  readonly activeEscapeHatches: number;
  readonly reason: string;
}

export interface TrilemmaGuard {
  /** Record that a judge used a different model than agents */
  recordDifferentModelJudge(): void;
  /** Record that a human review gate was triggered */
  recordHumanGate(): void;
  /** Record that drift bounds checked and within limits */
  recordDriftCheck(withinBounds: boolean): void;
  /** Record that a calibration task was run */
  recordCalibration(): void;
  /** Record a Forge redesign cycle (self-evolution event) */
  recordRedesignCycle(): void;

  /** Get current trilemma navigation status */
  getStatus(): TrilemmaStatus;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class TrilemmaGuardImpl implements TrilemmaGuard {
  private readonly _eventBus: EventBus;
  private _redesignCount = 0;
  private _differentModelJudgeCount = 0;
  private _humanGateCount = 0;
  private _driftChecksInBounds = 0;
  private _driftChecksTotal = 0;
  private _calibrationCount = 0;

  constructor(eventBus: EventBus) {
    this._eventBus = eventBus;
  }

  recordDifferentModelJudge(): void {
    this._differentModelJudgeCount += 1;
  }

  recordHumanGate(): void {
    this._humanGateCount += 1;
  }

  recordDriftCheck(withinBounds: boolean): void {
    this._driftChecksTotal += 1;
    if (withinBounds) this._driftChecksInBounds += 1;
  }

  recordCalibration(): void {
    this._calibrationCount += 1;
  }

  recordRedesignCycle(): void {
    this._redesignCount += 1;
  }

  getStatus(): TrilemmaStatus {
    const selfEvolution = this._redesignCount > 0;

    const differentModelJudges = this._differentModelJudgeCount > 0;
    const humanGatesActive = this._humanGateCount > 0;
    const driftBoundsActive = this._driftChecksTotal > 0 &&
      (this._driftChecksInBounds / this._driftChecksTotal) > 0.5;
    const calibrationActive = this._calibrationCount > 0;

    const activeHatches = [
      differentModelJudges,
      humanGatesActive,
      driftBoundsActive,
      calibrationActive,
    ].filter(Boolean).length;

    let safetyLevel: TrilemmaStatus['safetyLevel'];
    let reason: string;

    if (!selfEvolution) {
      safetyLevel = 'safe';
      reason = 'Self-evolution not active — trilemma does not apply';
    } else if (activeHatches >= 2) {
      safetyLevel = 'safe';
      reason = `${activeHatches}/4 escape hatches active — isolation broken, trilemma navigated`;
    } else if (activeHatches === 1) {
      safetyLevel = 'degraded';
      reason = 'Only 1 escape hatch active — minimal external grounding';

      this._eventBus.emit({
        type: 'trilemma:degraded',
        payload: { activeHatches, redesignCount: this._redesignCount },
        source: 'trilemma-guard',
      });
    } else {
      safetyLevel = 'unsafe';
      reason = 'Self-evolution active with ZERO external grounding — trilemma violation risk';

      this._eventBus.emit({
        type: 'trilemma:unsafe',
        payload: { redesignCount: this._redesignCount },
        source: 'trilemma-guard',
      });
    }

    return {
      selfEvolution,
      externalGrounding: {
        differentModelJudges,
        humanGatesActive,
        driftBoundsActive,
        calibrationActive,
      },
      safetyLevel,
      activeEscapeHatches: activeHatches,
      reason,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTrilemmaGuard(eventBus: EventBus): TrilemmaGuard {
  return new TrilemmaGuardImpl(eventBus);
}
