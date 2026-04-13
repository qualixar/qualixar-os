/**
 * Qualixar OS Phase 13 -- Budget Gate Tests
 * Tests 80% warning, 100% hard stop, and alert tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BudgetGateImpl,
  createBudgetGate,
  type BudgetAlert,
} from '../../src/engine/budget-gate.js';
import type { BudgetChecker } from '../../src/cost/budget-checker.js';
import type { BudgetStatus } from '../../src/types/common.js';
import type { EventBus } from '../../src/events/event-bus.js';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockBudgetChecker(
  checkFn: (taskId: string, est: number) => BudgetStatus,
): BudgetChecker {
  return {
    check: checkFn,
    getRemaining: () => 5.0,
  };
}

function createMockEventBus(): EventBus & { emitted: Array<{ type: string; payload: unknown }> } {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  return {
    emitted,
    emit(event) {
      emitted.push({ type: event.type, payload: event.payload });
    },
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetGateImpl', () => {
  let db: QosDatabase;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
    eventBus = createMockEventBus();
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // Normal (no warning, no stop)
  // -----------------------------------------------------------------------

  it('returns allowed with no warnings when budget is fine', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 8.0, warning: false,
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    const result = gate.check('task-1', 0.5);
    expect(result.allowed).toBe(true);
    expect(result.warningAt80).toBe(false);
    expect(result.hardStopAt100).toBe(false);
    expect(eventBus.emitted).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Warning at 80%
  // -----------------------------------------------------------------------

  it('emits warning event at 80% budget usage', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 1.5, warning: true,
      message: 'Budget warning: 85.0% used',
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    const result = gate.check('task-1', 0.5);
    expect(result.allowed).toBe(true);
    expect(result.warningAt80).toBe(true);
    expect(result.hardStopAt100).toBe(false);

    // Event emitted
    expect(eventBus.emitted).toHaveLength(1);
    expect(eventBus.emitted[0].type).toBe('cost:budget_warning');

    // Alert persisted
    const alerts = gate.getAlerts('task-1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning_80');
  });

  // -----------------------------------------------------------------------
  // Hard stop at 100%
  // -----------------------------------------------------------------------

  it('emits exceeded event and blocks at 100%', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: false, remaining_usd: -0.5, warning: true,
      message: 'Budget exceeded',
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    const result = gate.check('task-1', 1.0);
    expect(result.allowed).toBe(false);
    expect(result.hardStopAt100).toBe(true);

    // Event emitted
    const exceededEvents = eventBus.emitted.filter((e) => e.type === 'cost:budget_exceeded');
    expect(exceededEvents).toHaveLength(1);

    // Alert persisted
    const alerts = gate.getAlerts('task-1');
    const hardStops = alerts.filter((a) => a.type === 'hard_stop_100');
    expect(hardStops).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // getAlerts()
  // -----------------------------------------------------------------------

  it('getAlerts returns all alerts when no taskId', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 1.0, warning: true,
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    gate.check('task-1', 0.5);
    gate.check('task-2', 0.3);

    const allAlerts = gate.getAlerts();
    expect(allAlerts).toHaveLength(2);
  });

  it('getAlerts filters by taskId', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 1.0, warning: true,
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    gate.check('task-1', 0.5);
    gate.check('task-2', 0.3);

    const task1Alerts = gate.getAlerts('task-1');
    expect(task1Alerts).toHaveLength(1);
    expect(task1Alerts[0].taskId).toBe('task-1');
  });

  it('getAlerts returns empty when no alerts', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 8.0, warning: false,
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    expect(gate.getAlerts()).toEqual([]);
    expect(gate.getAlerts('task-1')).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Alert structure
  // -----------------------------------------------------------------------

  it('alert has correct structure', () => {
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 1.5, warning: true,
    }));
    const gate = new BudgetGateImpl(checker, eventBus, db);

    gate.check('task-1', 0.5);
    const alerts = gate.getAlerts('task-1');

    expect(alerts[0]).toHaveProperty('id');
    expect(alerts[0]).toHaveProperty('taskId', 'task-1');
    expect(alerts[0]).toHaveProperty('type', 'warning_80');
    expect(alerts[0]).toHaveProperty('budget');
    expect(alerts[0]).toHaveProperty('spent');
    expect(alerts[0]).toHaveProperty('timestamp');
  });

  // -----------------------------------------------------------------------
  // Multiple checks accumulate alerts
  // -----------------------------------------------------------------------

  it('multiple checks accumulate alerts', () => {
    let callCount = 0;
    const checker = createMockBudgetChecker(() => {
      callCount++;
      if (callCount <= 2) {
        return { allowed: true, remaining_usd: 1.0, warning: true };
      }
      return { allowed: false, remaining_usd: -0.5, warning: true };
    });
    const gate = new BudgetGateImpl(checker, eventBus, db);

    gate.check('task-1', 0.3);
    gate.check('task-1', 0.3);
    gate.check('task-1', 0.5);

    const alerts = gate.getAlerts('task-1');
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createBudgetGate', () => {
  it('creates a BudgetGate via factory', () => {
    const db = createDatabase(':memory:');
    db.runMigrations();
    const checker = createMockBudgetChecker(() => ({
      allowed: true, remaining_usd: 10, warning: false,
    }));
    const eventBus = createMockEventBus();

    const gate = createBudgetGate(checker, eventBus, db);
    expect(gate).toBeDefined();

    const result = gate.check('test', 0.1);
    expect(result.allowed).toBe(true);
    db.close();
  });
});
