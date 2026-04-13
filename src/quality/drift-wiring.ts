// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Drift Monitor ↔ EventBus Wiring
 *
 * Listens to judge pipeline events (judge:verdict, judge:approved,
 * judge:rejected) and security:violation to feed the DriftMonitor
 * automatically. Emits drift:warning and drift:critical when
 * thresholds are crossed.
 *
 * Patent formulas from TECHNICAL-ATTACHMENT.md:
 *   §5.1: D(t) = w_c × D_compliance + w_d × JSD(P_t || P_ref)
 *   Threshold: warning >= 0.3, critical >= 0.6
 */

import type { EventBus } from '../events/event-bus.js';
import type { DriftMonitor } from './drift-bounds.js';

/**
 * Wire a DriftMonitor to an EventBus.
 *
 * Subscribes to:
 *   - judge:verdict  → extracts compliance scores, calls recordTurn,
 *                       emits drift:warning or drift:critical as needed
 *   - security:violation → calls recordViolation
 *   - judge:rejected     → calls recordRecovery(false)
 *   - judge:approved     → calls recordRecovery(true)
 */
export function wireDriftToEventBus(
  monitor: DriftMonitor,
  eventBus: EventBus,
): () => void {
  // ------------------------------------------------------------------
  // judge:verdict → extract compliance, check drift thresholds
  // ------------------------------------------------------------------
  const onVerdict = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as {
      score?: number;
      verdict?: string;
      issues?: readonly { severity: string }[];
    };

    // Guard: skip if score is not a number
    if (typeof payload.score !== 'number') return;

    // Derive compliance from judge score:
    //   cHard = 1 if no critical issues, 0 if any critical issue
    //   cSoft = judge score (already normalized 0-1)
    //   cTotal = average of cHard and cSoft
    const hasCritical = (payload.issues ?? []).some(
      (i) => i.severity === 'critical',
    );
    const cHard = hasCritical ? 0 : 1;
    const cSoft = payload.score;
    const cTotal = (cHard + cSoft) / 2;

    monitor.recordTurn(cHard, cSoft, cTotal);

    // Check drift thresholds after each turn
    const summary = monitor.getSummary();

    if (summary.currentDrift >= 0.6) {
      eventBus.emit({
        type: 'drift:critical',
        payload: {
          theta: summary.theta,
          currentDrift: summary.currentDrift,
          meanDrift: summary.meanDrift,
          deploymentReady: summary.deploymentReady,
        },
        source: 'drift-monitor',
        taskId: event.taskId,
      });
    } else if (summary.currentDrift >= 0.3) {
      eventBus.emit({
        type: 'drift:warning',
        payload: {
          theta: summary.theta,
          currentDrift: summary.currentDrift,
          meanDrift: summary.meanDrift,
        },
        source: 'drift-monitor',
        taskId: event.taskId,
      });
    }
  };
  eventBus.on('judge:verdict', onVerdict);

  // ------------------------------------------------------------------
  // security:violation → track violation count
  // ------------------------------------------------------------------
  const onViolation = async () => { monitor.recordViolation(); };
  eventBus.on('security:violation', onViolation);

  // ------------------------------------------------------------------
  // judge:rejected → failed recovery attempt
  // ------------------------------------------------------------------
  const onRejected = async () => { monitor.recordRecovery(false); };
  eventBus.on('judge:rejected', onRejected);

  // ------------------------------------------------------------------
  // judge:approved → successful recovery attempt
  // ------------------------------------------------------------------
  const onApproved = async () => { monitor.recordRecovery(true); };
  eventBus.on('judge:approved', onApproved);

  // DEF-035: Return cleanup function to unsubscribe all handlers
  return () => {
    eventBus.off('judge:verdict', onVerdict);
    eventBus.off('security:violation', onViolation);
    eventBus.off('judge:rejected', onRejected);
    eventBus.off('judge:approved', onApproved);
  };
}
