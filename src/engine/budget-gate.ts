// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 13 -- Budget Gate
 *
 * Wraps existing BudgetChecker with alert tracking and event emission.
 * Emits cost:budget_warning at 80% and cost:budget_exceeded at 100%.
 * Persists alerts to the budget_alerts table.
 *
 * Hard Rule: All SQL parameterized with ? placeholders.
 */

import type { BudgetChecker } from '../cost/budget-checker.js';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetGateResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly warningAt80: boolean;
  readonly hardStopAt100: boolean;
}

export interface BudgetAlert {
  readonly id: string;
  readonly taskId: string;
  readonly type: 'warning_80' | 'hard_stop_100';
  readonly budget: number;
  readonly spent: number;
  readonly timestamp: string;
}

export interface BudgetGate {
  check(taskId: string, estimatedCost: number): BudgetGateResult;
  getAlerts(taskId?: string): readonly BudgetAlert[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class BudgetGateImpl implements BudgetGate {
  private readonly budgetChecker: BudgetChecker;
  private readonly eventBus: EventBus;
  private readonly db: QosDatabase;

  constructor(
    budgetChecker: BudgetChecker,
    eventBus: EventBus,
    db: QosDatabase,
  ) {
    this.budgetChecker = budgetChecker;
    this.eventBus = eventBus;
    this.db = db;
  }

  check(taskId: string, estimatedCost: number): BudgetGateResult {
    const status = this.budgetChecker.check(taskId, estimatedCost);
    const warningAt80 = status.warning && status.allowed;
    const hardStopAt100 = !status.allowed;

    if (warningAt80) {
      const alert = this.createAlert(taskId, 'warning_80', status.remaining_usd, estimatedCost);
      this.persistAlert(alert);
      this.eventBus.emit({
        type: 'cost:budget_warning',
        payload: { taskId, remaining: status.remaining_usd, alert },
        source: 'budget-gate',
        taskId,
      });
    }

    if (hardStopAt100) {
      const alert = this.createAlert(taskId, 'hard_stop_100', status.remaining_usd, estimatedCost);
      this.persistAlert(alert);
      this.eventBus.emit({
        type: 'cost:budget_exceeded',
        payload: { taskId, remaining: status.remaining_usd, alert },
        source: 'budget-gate',
        taskId,
      });
    }

    return {
      allowed: status.allowed,
      remaining: status.remaining_usd,
      warningAt80,
      hardStopAt100,
    };
  }

  getAlerts(taskId?: string): readonly BudgetAlert[] {
    if (taskId) {
      return this.db.query<BudgetAlert>(
        `SELECT id, task_id AS taskId, type, budget_usd AS budget,
                spent_usd AS spent, created_at AS timestamp
         FROM budget_alerts WHERE task_id = ? ORDER BY created_at ASC`,
        [taskId],
      );
    }
    return this.db.query<BudgetAlert>(
      `SELECT id, task_id AS taskId, type, budget_usd AS budget,
              spent_usd AS spent, created_at AS timestamp
       FROM budget_alerts ORDER BY created_at ASC`,
      [],
    );
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private createAlert(
    taskId: string,
    type: 'warning_80' | 'hard_stop_100',
    remaining: number,
    estimatedCost: number,
  ): BudgetAlert {
    return {
      id: generateId(),
      taskId,
      type,
      budget: remaining + estimatedCost,
      spent: estimatedCost,
      timestamp: now(),
    };
  }

  private persistAlert(alert: BudgetAlert): void {
    this.db.insert('budget_alerts', {
      id: alert.id,
      task_id: alert.taskId,
      type: alert.type,
      budget_usd: alert.budget,
      spent_usd: alert.spent,
      created_at: alert.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBudgetGate(
  budgetChecker: BudgetChecker,
  eventBus: EventBus,
  db: QosDatabase,
): BudgetGate {
  return new BudgetGateImpl(budgetChecker, eventBus, db);
}
