// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireDriftToEventBus } from '../../src/quality/drift-wiring.js';
import type { DriftMonitor, DriftMonitorSummary } from '../../src/quality/drift-bounds.js';
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
// Mock DriftMonitor
// ---------------------------------------------------------------------------

function createMockDriftMonitor(overrides?: Partial<DriftMonitorSummary>): {
  monitor: DriftMonitor;
  calls: {
    recordTurn: Array<{ cHard: number; cSoft: number; cTotal: number; actionDist?: Record<string, number> }>;
    recordViolation: number;
    recordRecovery: boolean[];
  };
} {
  const calls = {
    recordTurn: [] as Array<{ cHard: number; cSoft: number; cTotal: number; actionDist?: Record<string, number> }>,
    recordViolation: 0,
    recordRecovery: [] as boolean[],
  };

  const defaultSummary: DriftMonitorSummary = {
    theta: 0.95,
    currentDrift: 0.1,
    meanDrift: 0.1,
    meanCompliance: 0.9,
    violations: 0,
    recoveryRate: 1.0,
    turnCount: 1,
    deploymentReady: true,
    ...overrides,
  };

  const monitor: DriftMonitor = {
    recordTurn(cHard: number, cSoft: number, cTotal: number, actionDist?: Record<string, number>): void {
      calls.recordTurn.push({ cHard, cSoft, cTotal, actionDist });
    },
    recordViolation(): void {
      calls.recordViolation += 1;
    },
    recordRecovery(success: boolean): void {
      calls.recordRecovery.push(success);
    },
    getTheta(): number {
      return defaultSummary.theta;
    },
    getSummary(): DriftMonitorSummary {
      return defaultSummary;
    },
  };

  return { monitor, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireDriftToEventBus', () => {
  let eventBus: MockEventBus;

  beforeEach(() => {
    eventBus = createMockEventBus();
  });

  it('subscribes to judge:verdict, security:violation, judge:rejected, judge:approved', () => {
    const { monitor } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    expect(eventBus.subscriptions.has('judge:verdict')).toBe(true);
    expect(eventBus.subscriptions.has('security:violation')).toBe(true);
    expect(eventBus.subscriptions.has('judge:rejected')).toBe(true);
    expect(eventBus.subscriptions.has('judge:approved')).toBe(true);
  });

  it('calls monitor.recordTurn when judge:verdict is emitted with a score', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', {
      score: 0.85,
      verdict: 'approved',
      issues: [],
    });

    expect(calls.recordTurn).toHaveLength(1);
    expect(calls.recordTurn[0]).toEqual({
      cHard: 1,
      cSoft: 0.85,
      cTotal: (1 + 0.85) / 2,
    });
  });

  it('sets cHard=0 when critical issues are present', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', {
      score: 0.4,
      verdict: 'rejected',
      issues: [{ severity: 'critical' }],
    });

    expect(calls.recordTurn).toHaveLength(1);
    expect(calls.recordTurn[0].cHard).toBe(0);
    expect(calls.recordTurn[0].cSoft).toBe(0.4);
    expect(calls.recordTurn[0].cTotal).toBe((0 + 0.4) / 2);
  });

  it('emits drift:warning when currentDrift >= 0.3 and < 0.6', async () => {
    const { monitor } = createMockDriftMonitor({ currentDrift: 0.35, meanDrift: 0.3 });
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', {
      score: 0.5,
      issues: [],
    }, 'task-42');

    expect(eventBus.emitted).toHaveLength(1);
    expect(eventBus.emitted[0].type).toBe('drift:warning');
    expect(eventBus.emitted[0].source).toBe('drift-monitor');
    expect(eventBus.emitted[0].taskId).toBe('task-42');
    const payload = eventBus.emitted[0].payload as Record<string, unknown>;
    expect(payload.currentDrift).toBe(0.35);
    expect(payload.meanDrift).toBe(0.3);
  });

  it('emits drift:critical when currentDrift >= 0.6', async () => {
    const { monitor } = createMockDriftMonitor({
      currentDrift: 0.7,
      meanDrift: 0.6,
      theta: 0.5,
      deploymentReady: false,
    });
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', {
      score: 0.2,
      issues: [],
    }, 'task-99');

    expect(eventBus.emitted).toHaveLength(1);
    expect(eventBus.emitted[0].type).toBe('drift:critical');
    expect(eventBus.emitted[0].source).toBe('drift-monitor');
    const payload = eventBus.emitted[0].payload as Record<string, unknown>;
    expect(payload.currentDrift).toBe(0.7);
    expect(payload.deploymentReady).toBe(false);
  });

  it('does not emit drift events when currentDrift < 0.3', async () => {
    const { monitor } = createMockDriftMonitor({ currentDrift: 0.1 });
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', {
      score: 0.9,
      issues: [],
    });

    expect(eventBus.emitted).toHaveLength(0);
  });

  it('calls monitor.recordViolation on security:violation', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('security:violation', { reason: 'bad stuff' });

    expect(calls.recordViolation).toBe(1);
  });

  it('calls monitor.recordRecovery(false) on judge:rejected', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:rejected', { reason: 'quality' });

    expect(calls.recordRecovery).toEqual([false]);
  });

  it('calls monitor.recordRecovery(true) on judge:approved', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:approved', { score: 0.95 });

    expect(calls.recordRecovery).toEqual([true]);
  });

  it('handles missing score in payload gracefully (no crash, no recordTurn)', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    // No score property at all
    await eventBus.fireEvent('judge:verdict', { verdict: 'approved' });

    expect(calls.recordTurn).toHaveLength(0);
  });

  it('handles missing issues array gracefully', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    // Score present but no issues array
    await eventBus.fireEvent('judge:verdict', { score: 0.9 });

    expect(calls.recordTurn).toHaveLength(1);
    // No issues = no critical = cHard=1
    expect(calls.recordTurn[0].cHard).toBe(1);
  });

  it('handles null score gracefully', async () => {
    const { monitor, calls } = createMockDriftMonitor();
    wireDriftToEventBus(monitor, eventBus);

    await eventBus.fireEvent('judge:verdict', { score: null });

    expect(calls.recordTurn).toHaveLength(0);
  });
});
