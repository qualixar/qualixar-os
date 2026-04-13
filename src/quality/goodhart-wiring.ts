// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Goodhart Detector ↔ EventBus Wiring
 *
 * Listens to judge:verdict, judge:approved, and judge:rejected events
 * and feeds them to the GoodhartDetector for Goodhart analysis.
 *
 * Emits goodhart:risk_elevated when risk reaches medium or high.
 */

import type { EventBus } from '../events/event-bus.js';
import type { GoodhartDetector } from './goodhart-detector.js';

// ---------------------------------------------------------------------------
// Payload shape for judge events
// ---------------------------------------------------------------------------

interface JudgePayload {
  readonly judgeModel?: string;
  readonly score?: number;
  readonly taskId?: string;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Wire a GoodhartDetector to an EventBus so that judge events
 * are automatically tracked for Goodhart risk analysis.
 *
 * Subscribes to: judge:verdict, judge:approved, judge:rejected
 * Emits: goodhart:risk_elevated (when risk is medium or high)
 */
export function wireGoodhartToEventBus(
  detector: GoodhartDetector,
  eventBus: EventBus,
): () => void {
  // judge:verdict — record + auto-analyze + emit if elevated
  const onVerdict = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as JudgePayload;
    if (!payload.judgeModel || typeof payload.score !== 'number') {
      return;
    }

    const taskId = event.taskId ?? payload.taskId ?? 'unknown';
    detector.recordVerdict(taskId, payload.judgeModel, payload.score);

    const signal = detector.analyze();
    if (signal.risk === 'medium' || signal.risk === 'high') {
      eventBus.emit({
        type: 'goodhart:risk_elevated',
        payload: {
          risk: signal.risk,
          crossModelEntropy: signal.crossModelEntropy,
          entropyTrend: signal.entropyTrend,
          calibrationDelta: signal.calibrationDelta,
          reason: signal.reason,
        },
        source: 'goodhart-detector',
        taskId: event.taskId,
      });
    }
  };
  eventBus.on('judge:verdict', onVerdict);

  // judge:approved — record only (broader coverage)
  const onApproved = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as JudgePayload;
    if (!payload.judgeModel || typeof payload.score !== 'number') {
      return;
    }
    const taskId = event.taskId ?? payload.taskId ?? 'unknown';
    detector.recordVerdict(taskId, payload.judgeModel, payload.score);
  };
  eventBus.on('judge:approved', onApproved);

  // judge:rejected — record only (broader coverage)
  const onRejected = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as JudgePayload;
    if (!payload.judgeModel || typeof payload.score !== 'number') {
      return;
    }
    const taskId = event.taskId ?? payload.taskId ?? 'unknown';
    detector.recordVerdict(taskId, payload.judgeModel, payload.score);
  };
  eventBus.on('judge:rejected', onRejected);

  // DEF-035: Return cleanup function to unsubscribe all handlers
  return () => {
    eventBus.off('judge:verdict', onVerdict);
    eventBus.off('judge:approved', onApproved);
    eventBus.off('judge:rejected', onRejected);
  };
}
