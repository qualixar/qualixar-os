/**
 * Qualixar OS V2 -- BudgetChecker Tests
 *
 * Phase 1 LLD Section 2.11, TDD Step 1.
 * Tests: check (allowed/warning/blocked), getRemaining, per-task budget.
 *
 * Uses :memory: database (Hard Rule #8).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../../src/db/database.js';
import type { QosDatabase } from '../../src/db/database.js';
import { QosConfigSchema } from '../../src/types/common.js';
import type { QosConfig, CostEntry } from '../../src/types/common.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import {
  createCostTracker,
  type CostTracker,
} from '../../src/cost/cost-tracker.js';
import {
  createBudgetChecker,
  type BudgetChecker,
} from '../../src/cost/budget-checker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfigManager(
  budgetOverrides: Partial<{ max_usd: number; warn_pct: number; per_task_max: number }> = {},
): ConfigManager {
  const raw = {
    budget: {
      max_usd: budgetOverrides.max_usd ?? 10,
      warn_pct: budgetOverrides.warn_pct ?? 0.8,
      ...(budgetOverrides.per_task_max !== undefined
        ? { per_task_max: budgetOverrides.per_task_max }
        : {}),
    },
  };
  const config = QosConfigSchema.parse(raw);
  return {
    get: () => structuredClone(config),
    getValue: <T = unknown>(path: string): T => {
      const segments = path.split('.');
      let current: unknown = config;
      for (const seg of segments) {
        if (current === null || current === undefined || typeof current !== 'object') {
          throw new Error(`Config path not found: ${path}`);
        }
        current = (current as Record<string, unknown>)[seg];
      }
      if (current === undefined) {
        throw new Error(`Config path not found: ${path}`);
      }
      return current as T;
    },
    reload: () => {
      /* no-op */
    },
  };
}

function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    id: overrides.id ?? 'ce-001',
    taskId: overrides.taskId ?? 'task-1',
    agentId: overrides.agentId ?? 'agent-1',
    model: overrides.model ?? 'claude-sonnet-4-6',
    amountUsd: overrides.amountUsd ?? 0.005,
    category: overrides.category ?? 'inference',
    createdAt: overrides.createdAt ?? '2026-03-30T12:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetChecker', () => {
  let db: QosDatabase;
  let costTracker: CostTracker;

  beforeEach(() => {
    db = createDatabase(':memory:');
    costTracker = createCostTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // #1: check() returns allowed when under budget
  // -------------------------------------------------------------------------

  it('#1 check() returns allowed when under budget', () => {
    // Budget: $10, warn at 80% ($8), spent $0, estimating $1
    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10, warn_pct: 0.8 }),
      costTracker,
    );

    const status = checker.check('task-1', 1.0);

    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(false);
    expect(status.remaining_usd).toBeCloseTo(10, 10);
  });

  // -------------------------------------------------------------------------
  // #2: check() returns warning when at 80% threshold
  // -------------------------------------------------------------------------

  it('#2 check() returns warning when at 80% threshold', () => {
    // Budget: $10, warn at 80%. Spend $8 first.
    for (let i = 0; i < 8; i++) {
      costTracker.record(makeCostEntry({
        id: `ce-${i}`,
        taskId: 'task-1',
        amountUsd: 1.0,
      }));
    }

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10, warn_pct: 0.8 }),
      costTracker,
    );

    // $8 spent, estimating $0.5 more = $8.5 (under $10, but 80% used)
    const status = checker.check('task-1', 0.5);

    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(true);
    expect(status.remaining_usd).toBeCloseTo(2.0, 10);
    expect(status.message).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // #3: check() returns blocked when at 100%
  // -------------------------------------------------------------------------

  it('#3 check() returns blocked when at 100%', () => {
    // Budget: $10. Spend $9 first.
    for (let i = 0; i < 9; i++) {
      costTracker.record(makeCostEntry({
        id: `ce-${i}`,
        taskId: 'task-1',
        amountUsd: 1.0,
      }));
    }

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10, warn_pct: 0.8 }),
      costTracker,
    );

    // $9 spent + $2 estimated = $11 > $10 -> blocked
    const status = checker.check('task-1', 2.0);

    expect(status.allowed).toBe(false);
    expect(status.warning).toBe(true);
    expect(status.remaining_usd).toBeCloseTo(1.0, 10);
    expect(status.message).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // #4: getRemaining() returns correct value
  // -------------------------------------------------------------------------

  it('#4 getRemaining() returns correct value for global budget', () => {
    costTracker.record(makeCostEntry({ id: 'ce-1', amountUsd: 3.0 }));
    costTracker.record(makeCostEntry({ id: 'ce-2', amountUsd: 2.0 }));

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10 }),
      costTracker,
    );

    const remaining = checker.getRemaining();
    expect(remaining).toBeCloseTo(5.0, 10);
  });

  it('#4b getRemaining() with taskId uses task-level budget', () => {
    costTracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-A', amountUsd: 1.0 }));

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10, per_task_max: 3 }),
      costTracker,
    );

    // Per-task: $3 max - $1 spent = $2 remaining
    const remaining = checker.getRemaining('task-A');
    expect(remaining).toBeCloseTo(2.0, 10);
  });

  it('#4c getRemaining() with taskId falls back to global when no per_task_max', () => {
    costTracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-A', amountUsd: 1.5 }));

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10 }),
      costTracker,
    );

    // No per_task_max set -> uses global max_usd ($10) - task cost ($1.5)
    const remaining = checker.getRemaining('task-A');
    expect(remaining).toBeCloseTo(8.5, 10);
  });

  // -------------------------------------------------------------------------
  // #5: per-task budget check works when per_task_max is set
  // -------------------------------------------------------------------------

  it('#5 per-task budget check blocks when task budget exceeded', () => {
    // Per-task: $2. Spend $1.5 on task-A.
    costTracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-A', amountUsd: 1.5 }));

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 100, per_task_max: 2 }),
      costTracker,
    );

    // $1.5 spent + $1 estimated = $2.5 > $2 per-task max -> blocked
    const status = checker.check('task-A', 1.0);

    expect(status.allowed).toBe(false);
    expect(status.warning).toBe(true);
  });

  it('#5b per-task budget allows when under per-task limit', () => {
    costTracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-A', amountUsd: 0.5 }));

    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 100, per_task_max: 2 }),
      costTracker,
    );

    // $0.5 spent + $0.5 estimated = $1 < $2 per-task max -> allowed
    const status = checker.check('task-A', 0.5);

    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Additional: zero estimated cost
  // -------------------------------------------------------------------------

  it('check with zero estimated cost returns allowed', () => {
    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10 }),
      costTracker,
    );

    const status = checker.check('task-1', 0);
    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Additional: getRemaining with no spending
  // -------------------------------------------------------------------------

  it('getRemaining with no spending returns full budget', () => {
    const checker = createBudgetChecker(
      createMockConfigManager({ max_usd: 10 }),
      costTracker,
    );

    const remaining = checker.getRemaining();
    expect(remaining).toBeCloseTo(10, 10);
  });
});
