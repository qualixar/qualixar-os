// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

/**
 * Tests for TrilemmaGuard + BehavioralContractManager EventBus wiring.
 *
 * Verifies that event subscriptions correctly drive the guard's escape-hatch
 * tracking and the contract manager's capture/verify lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  wireTrilemmaToEventBus,
  wireContractsToEventBus,
} from '../../src/quality/trilemma-contracts-wiring.js';
import type { TrilemmaGuard } from '../../src/quality/trilemma-guard.js';
import type { BehavioralContractManager, BehavioralContract } from '../../src/quality/behavioral-contracts.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { QosEvent } from '../../src/types/common.js';
import type { QosEventType } from '../../src/types/events.js';

// ---------------------------------------------------------------------------
// Mock EventBus — tracks subscriptions and lets us fire events manually
// ---------------------------------------------------------------------------

type EventHandler = (event: QosEvent) => Promise<void>;

interface MockEventBus extends EventBus {
  readonly subscriptions: Map<string, EventHandler[]>;
  readonly emitted: Array<Omit<QosEvent, 'id' | 'timestamp'>>;
  fireEvent(type: QosEventType, payload: Record<string, unknown>, taskId?: string): Promise<void>;
}

function createMockEventBus(): MockEventBus {
  const subscriptions = new Map<string, EventHandler[]>();
  const emitted: Array<Omit<QosEvent, 'id' | 'timestamp'>> = [];

  return {
    subscriptions,
    emitted,

    on(type: QosEventType | '*', handler: EventHandler): void {
      const handlers = subscriptions.get(type) ?? [];
      handlers.push(handler);
      subscriptions.set(type, handlers);
    },

    off(_type: QosEventType | '*', _handler: EventHandler): void {
      // Not needed for tests
    },

    emit(event: Omit<QosEvent, 'id' | 'timestamp'>): void {
      emitted.push({ ...event });
    },

    async replay(): Promise<number> {
      return 0;
    },

    getLastEventId(): number {
      return 0;
    },

    async fireEvent(
      type: QosEventType,
      payload: Record<string, unknown>,
      taskId?: string,
    ): Promise<void> {
      const fullEvent: QosEvent = {
        id: 1,
        type,
        payload,
        source: 'test',
        taskId,
        timestamp: new Date().toISOString(),
      };
      const handlers = subscriptions.get(type) ?? [];
      for (const handler of handlers) {
        await handler(fullEvent);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mock TrilemmaGuard
// ---------------------------------------------------------------------------

interface MockTrilemmaGuard extends TrilemmaGuard {
  readonly calls: {
    recordRedesignCycle: number;
    recordDifferentModelJudge: number;
    recordHumanGate: number;
    recordDriftCheck: boolean[];
    recordCalibration: number;
  };
}

function createMockTrilemmaGuard(): MockTrilemmaGuard {
  const calls = {
    recordRedesignCycle: 0,
    recordDifferentModelJudge: 0,
    recordHumanGate: 0,
    recordDriftCheck: [] as boolean[],
    recordCalibration: 0,
  };

  return {
    calls,
    recordRedesignCycle(): void {
      calls.recordRedesignCycle += 1;
    },
    recordDifferentModelJudge(): void {
      calls.recordDifferentModelJudge += 1;
    },
    recordHumanGate(): void {
      calls.recordHumanGate += 1;
    },
    recordDriftCheck(withinBounds: boolean): void {
      calls.recordDriftCheck.push(withinBounds);
    },
    recordCalibration(): void {
      calls.recordCalibration += 1;
    },
    getStatus() {
      return {
        selfEvolution: false,
        externalGrounding: {
          differentModelJudges: false,
          humanGatesActive: false,
          driftBoundsActive: false,
          calibrationActive: false,
        },
        safetyLevel: 'safe' as const,
        activeEscapeHatches: 0,
        reason: 'mock',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock BehavioralContractManager
// ---------------------------------------------------------------------------

interface MockContractManager extends BehavioralContractManager {
  readonly calls: {
    captureContract: Array<{ taskType: string; designId: string; output: unknown }>;
    verify: Array<{ contractId: string; newOutput: unknown }>;
    getContract: string[];
  };
  setContract(taskType: string, contract: BehavioralContract): void;
}

function createMockContractManager(): MockContractManager {
  const calls = {
    captureContract: [] as Array<{ taskType: string; designId: string; output: unknown }>,
    verify: [] as Array<{ contractId: string; newOutput: unknown }>,
    getContract: [] as string[],
  };

  const contracts = new Map<string, BehavioralContract>();

  return {
    calls,
    setContract(taskType: string, contract: BehavioralContract): void {
      contracts.set(taskType, contract);
    },
    captureContract(taskType: string, designId: string, output: unknown): BehavioralContract {
      calls.captureContract.push({ taskType, designId, output });
      const contract: BehavioralContract = {
        id: `contract-${calls.captureContract.length}`,
        taskType,
        capturedFromDesignId: designId,
        invariants: [],
        capturedAt: new Date().toISOString(),
      };
      contracts.set(taskType, contract);
      return contract;
    },
    verify(contractId: string, newOutput: unknown) {
      calls.verify.push({ contractId, newOutput });
      return {
        contractId,
        allSatisfied: true,
        results: [],
        blocksRedesign: false,
      };
    },
    getContract(taskType: string): BehavioralContract | null {
      calls.getContract.push(taskType);
      return contracts.get(taskType) ?? null;
    },
    listContracts(): readonly BehavioralContract[] {
      return [...contracts.values()];
    },
  };
}

// ===========================================================================
// TrilemmaGuard Wiring Tests
// ===========================================================================

describe('wireTrilemmaToEventBus', () => {
  let eventBus: MockEventBus;
  let guard: MockTrilemmaGuard;

  beforeEach(() => {
    eventBus = createMockEventBus();
    guard = createMockTrilemmaGuard();
    wireTrilemmaToEventBus(guard, eventBus);
  });

  it('forge:redesigning calls recordRedesignCycle()', async () => {
    await eventBus.fireEvent('forge:redesigning', {});
    expect(guard.calls.recordRedesignCycle).toBe(1);
  });

  it('judge:verdict with different judgeModel/agentModel calls recordDifferentModelJudge()', async () => {
    await eventBus.fireEvent('judge:verdict', {
      judgeModel: 'gpt-4o',
      agentModel: 'claude-sonnet-4-6',
    });
    expect(guard.calls.recordDifferentModelJudge).toBe(1);
  });

  it('judge:verdict with same models does NOT call recordDifferentModelJudge()', async () => {
    await eventBus.fireEvent('judge:verdict', {
      judgeModel: 'claude-sonnet-4-6',
      agentModel: 'claude-sonnet-4-6',
    });
    expect(guard.calls.recordDifferentModelJudge).toBe(0);
  });

  it('judge:verdict without model info does NOT call recordDifferentModelJudge()', async () => {
    await eventBus.fireEvent('judge:verdict', { score: 0.9 });
    expect(guard.calls.recordDifferentModelJudge).toBe(0);
  });

  it('steering:hitl_approved calls recordHumanGate()', async () => {
    await eventBus.fireEvent('steering:hitl_approved', {});
    expect(guard.calls.recordHumanGate).toBe(1);
  });

  it('steering:hitl_rejected calls recordHumanGate()', async () => {
    await eventBus.fireEvent('steering:hitl_rejected', {});
    expect(guard.calls.recordHumanGate).toBe(1);
  });

  it('drift:warning calls recordDriftCheck(false)', async () => {
    await eventBus.fireEvent('drift:warning', {});
    expect(guard.calls.recordDriftCheck).toEqual([false]);
  });

  it('drift:critical calls recordDriftCheck(false)', async () => {
    await eventBus.fireEvent('drift:critical', {});
    expect(guard.calls.recordDriftCheck).toEqual([false]);
  });

  it('judge:approved calls recordDriftCheck(true)', async () => {
    await eventBus.fireEvent('judge:approved', {});
    expect(guard.calls.recordDriftCheck).toEqual([true]);
  });

  it('goodhart:risk_elevated calls recordCalibration()', async () => {
    await eventBus.fireEvent('goodhart:risk_elevated', {});
    expect(guard.calls.recordCalibration).toBe(1);
  });

  it('multiple events accumulate correctly', async () => {
    await eventBus.fireEvent('forge:redesigning', {});
    await eventBus.fireEvent('forge:redesigning', {});
    await eventBus.fireEvent('judge:verdict', {
      judgeModel: 'gpt-4o',
      agentModel: 'claude-sonnet-4-6',
    });
    await eventBus.fireEvent('goodhart:risk_elevated', {});
    await eventBus.fireEvent('drift:warning', {});
    await eventBus.fireEvent('judge:approved', {});

    expect(guard.calls.recordRedesignCycle).toBe(2);
    expect(guard.calls.recordDifferentModelJudge).toBe(1);
    expect(guard.calls.recordCalibration).toBe(1);
    expect(guard.calls.recordDriftCheck).toEqual([false, true]);
  });
});

// ===========================================================================
// BehavioralContractManager Wiring Tests
// ===========================================================================

describe('wireContractsToEventBus', () => {
  let eventBus: MockEventBus;
  let manager: MockContractManager;

  beforeEach(() => {
    eventBus = createMockEventBus();
    manager = createMockContractManager();
    wireContractsToEventBus(manager, eventBus);
  });

  it('forge:designed calls captureContract() with payload fields', async () => {
    await eventBus.fireEvent('forge:designed', {
      taskType: 'code',
      designId: 'design-1',
      roles: ['coder', 'reviewer'],
      outputs: { coder: 'function foo() {}' },
      totalCostUsd: 0.05,
      durationMs: 3000,
      judgeScore: 0.85,
    });

    expect(manager.calls.captureContract).toHaveLength(1);
    expect(manager.calls.captureContract[0].taskType).toBe('code');
    expect(manager.calls.captureContract[0].designId).toBe('design-1');
    expect(manager.calls.captureContract[0].output).toEqual({
      roles: ['coder', 'reviewer'],
      outputs: { coder: 'function foo() {}' },
      totalCostUsd: 0.05,
      durationMs: 3000,
      judgeScore: 0.85,
    });
  });

  it('forge:designed without taskType/designId does NOT call captureContract()', async () => {
    await eventBus.fireEvent('forge:designed', { roles: ['coder'] });
    expect(manager.calls.captureContract).toHaveLength(0);
  });

  it('forge:designed uses defaults for missing optional fields', async () => {
    await eventBus.fireEvent('forge:designed', {
      taskType: 'research',
      designId: 'design-2',
    });

    expect(manager.calls.captureContract).toHaveLength(1);
    expect(manager.calls.captureContract[0].output).toEqual({
      roles: [],
      outputs: {},
      totalCostUsd: 0,
      durationMs: 0,
      judgeScore: 0.5,
    });
  });

  it('forge:redesigning with existing contract emits contract:captured', async () => {
    // Set up an existing contract
    manager.setContract('code', {
      id: 'existing-contract',
      taskType: 'code',
      capturedFromDesignId: 'design-old',
      invariants: [],
      capturedAt: new Date().toISOString(),
    });

    await eventBus.fireEvent('forge:redesigning', { taskType: 'code' }, 'task-1');

    expect(manager.calls.getContract).toContain('code');
    const emitted = eventBus.emitted.filter((e) => e.type === 'contract:captured');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload).toEqual({
      contractId: 'existing-contract',
      taskType: 'code',
      action: 'pre_redesign_check',
    });
    expect(emitted[0].source).toBe('behavioral-contracts');
    expect(emitted[0].taskId).toBe('task-1');
  });

  it('forge:redesigning without existing contract does nothing', async () => {
    await eventBus.fireEvent('forge:redesigning', { taskType: 'unknown' });

    expect(manager.calls.getContract).toContain('unknown');
    const emitted = eventBus.emitted.filter((e) => e.type === 'contract:captured');
    expect(emitted).toHaveLength(0);
  });

  it('forge:redesigning without taskType does nothing', async () => {
    await eventBus.fireEvent('forge:redesigning', {});

    expect(manager.calls.getContract).toHaveLength(0);
    expect(eventBus.emitted.filter((e) => e.type === 'contract:captured')).toHaveLength(0);
  });
});
