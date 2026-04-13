// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

/**
 * Qualixar OS -- TrilemmaGuard + BehavioralContractManager EventBus Wiring
 *
 * Connects the quality subsystem to live orchestrator events so that:
 *
 * TrilemmaGuard tracks escape hatches automatically:
 *   - forge:redesigning       → recordRedesignCycle()
 *   - judge:verdict (diff model) → recordDifferentModelJudge()
 *   - steering:hitl_approved/rejected → recordHumanGate()
 *   - drift:warning/critical  → recordDriftCheck(false)
 *   - judge:approved           → recordDriftCheck(true)
 *   - goodhart:risk_elevated  → recordCalibration()
 *
 * BehavioralContractManager captures/verifies contracts:
 *   - forge:designed          → captureContract() from team output
 *   - forge:redesigning       → pre-redesign contract check
 */

import type { EventBus } from '../events/event-bus.js';
import type { TrilemmaGuard } from './trilemma-guard.js';
import type { BehavioralContractManager } from './behavioral-contracts.js';

// ---------------------------------------------------------------------------
// TrilemmaGuard wiring
// ---------------------------------------------------------------------------

/**
 * Wire TrilemmaGuard to EventBus so escape hatches are tracked automatically.
 */
export function wireTrilemmaToEventBus(
  guard: TrilemmaGuard,
  eventBus: EventBus,
): () => void {
  // Forge redesign → self-evolution event + status check (may emit trilemma:unsafe)
  const onRedesigning = async () => {
    guard.recordRedesignCycle();
    guard.getStatus(); // triggers trilemma:degraded or trilemma:unsafe if escape hatches insufficient
  };
  eventBus.on('forge:redesigning', onRedesigning);

  // Judge verdict with model info → different-model judge check
  const onVerdict = async (event: { payload: Record<string, unknown> }) => {
    const payload = event.payload as {
      judgeModel?: string;
      agentModel?: string;
    };
    if (
      payload.judgeModel &&
      payload.agentModel &&
      payload.judgeModel !== payload.agentModel
    ) {
      guard.recordDifferentModelJudge();
    }
  };
  eventBus.on('judge:verdict', onVerdict);

  // Human-in-the-loop gates (both approved and rejected count as gate usage)
  const onHitlApproved = async () => { guard.recordHumanGate(); };
  const onHitlRejected = async () => { guard.recordHumanGate(); };
  eventBus.on('steering:hitl_approved', onHitlApproved);
  eventBus.on('steering:hitl_rejected', onHitlRejected);

  // Drift events → drift check recording (out-of-bounds)
  const onDriftWarning = async () => { guard.recordDriftCheck(false); };
  const onDriftCritical = async () => { guard.recordDriftCheck(false); };
  eventBus.on('drift:warning', onDriftWarning);
  eventBus.on('drift:critical', onDriftCritical);

  // Judge approval → drift check recording (within bounds)
  const onApproved = async () => { guard.recordDriftCheck(true); };
  eventBus.on('judge:approved', onApproved);

  // Goodhart detection as calibration signal
  const onGoodhartRisk = async () => { guard.recordCalibration(); };
  eventBus.on('goodhart:risk_elevated', onGoodhartRisk);

  // DEF-035: Return cleanup function to unsubscribe all handlers
  return () => {
    eventBus.off('forge:redesigning', onRedesigning);
    eventBus.off('judge:verdict', onVerdict);
    eventBus.off('steering:hitl_approved', onHitlApproved);
    eventBus.off('steering:hitl_rejected', onHitlRejected);
    eventBus.off('drift:warning', onDriftWarning);
    eventBus.off('drift:critical', onDriftCritical);
    eventBus.off('judge:approved', onApproved);
    eventBus.off('goodhart:risk_elevated', onGoodhartRisk);
  };
}

// ---------------------------------------------------------------------------
// BehavioralContractManager wiring
// ---------------------------------------------------------------------------

/**
 * Wire BehavioralContractManager to EventBus so contracts are captured
 * on design completion and checked before redesigns.
 */
export function wireContractsToEventBus(
  manager: BehavioralContractManager,
  eventBus: EventBus,
): () => void {
  // When a forge design completes, capture the behavioral contract
  const onDesigned = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as {
      taskType?: string;
      designId?: string;
      roles?: readonly string[];
      outputs?: Record<string, string>;
      totalCostUsd?: number;
      durationMs?: number;
      judgeScore?: number;
    };

    if (payload.taskType && payload.designId) {
      manager.captureContract(payload.taskType, payload.designId, {
        roles: (payload.roles ?? []) as string[],
        outputs: payload.outputs ?? {},
        totalCostUsd: payload.totalCostUsd ?? 0,
        durationMs: payload.durationMs ?? 0,
        judgeScore: payload.judgeScore ?? 0.5,
      });
    }
  };
  eventBus.on('forge:designed', onDesigned);

  // When a redesign starts, check if there's an existing contract
  const onRedesigning = async (event: { payload: Record<string, unknown>; taskId?: string }) => {
    const payload = event.payload as { taskType?: string };
    if (payload.taskType) {
      const contract = manager.getContract(payload.taskType);
      if (contract) {
        eventBus.emit({
          type: 'contract:captured',
          payload: {
            contractId: contract.id,
            taskType: contract.taskType,
            action: 'pre_redesign_check',
          },
          source: 'behavioral-contracts',
          taskId: event.taskId,
        });
      }
    }
  };
  eventBus.on('forge:redesigning', onRedesigning);

  // DEF-035: Return cleanup function to unsubscribe all handlers
  return () => {
    eventBus.off('forge:designed', onDesigned);
    eventBus.off('forge:redesigning', onRedesigning);
  };
}
