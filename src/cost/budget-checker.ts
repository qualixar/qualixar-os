// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Budget Checker
 *
 * Phase 1 LLD Section 2.11.
 * Threshold enforcement: warn at warn_pct (default 80%), block at 100%.
 * Supports both global and per-task budget limits.
 *
 * Events: None directly. Orchestrator/ModelRouter emits budget_warning
 * and budget_exceeded based on the returned BudgetStatus.
 */

import type { ConfigManager } from '../config/config-manager.js';
import type { CostTracker } from './cost-tracker.js';
import type { BudgetStatus } from '../types/common.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BudgetChecker {
  /**
   * Check whether a new expenditure of `estimatedCost` is allowed for a task.
   * Returns BudgetStatus with allowed/warning/remaining info.
   */
  check(taskId: string, estimatedCost: number): BudgetStatus;

  /**
   * Get remaining budget. If taskId is provided, returns per-task remaining
   * (uses per_task_max if set, otherwise global max_usd - task cost).
   * Without taskId, returns global remaining.
   */
  getRemaining(taskId?: string): number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class BudgetCheckerImpl implements BudgetChecker {
  private readonly _configManager: ConfigManager;
  private readonly _costTracker: CostTracker;

  constructor(configManager: ConfigManager, costTracker: CostTracker) {
    this._configManager = configManager;
    this._costTracker = costTracker;
  }

  check(taskId: string, estimatedCost: number): BudgetStatus {
    const config = this._configManager.get();

    // Global budget check
    const totalSpent = this._costTracker.getTotalCost();
    const globalRemaining = config.budget.max_usd - totalSpent;
    const projectedTotal = totalSpent + estimatedCost;

    // Per-task budget check
    const taskSpent = this._costTracker.getTaskCost(taskId);
    const perTaskMax = config.budget.per_task_max ?? Infinity;
    const taskRemaining = perTaskMax - taskSpent;
    const taskProjected = taskSpent + estimatedCost;

    const effectiveRemaining = Math.min(globalRemaining, taskRemaining);

    // Blocked: projected exceeds either global or per-task budget
    if (projectedTotal > config.budget.max_usd || taskProjected > perTaskMax) {
      return {
        allowed: false,
        remaining_usd: effectiveRemaining,
        warning: true,
        message: `Budget exceeded. Global: $${globalRemaining.toFixed(4)} remaining. Estimated cost: $${estimatedCost.toFixed(4)}`,
      };
    }

    // Warning: total spent has reached warn_pct of global budget
    if (totalSpent / config.budget.max_usd >= config.budget.warn_pct) {
      return {
        allowed: true,
        remaining_usd: effectiveRemaining,
        warning: true,
        message: `Budget warning: ${((totalSpent / config.budget.max_usd) * 100).toFixed(1)}% of global budget used`,
      };
    }

    // All clear
    return {
      allowed: true,
      remaining_usd: effectiveRemaining,
      warning: false,
    };
  }

  getRemaining(taskId?: string): number {
    const config = this._configManager.get();

    if (taskId !== undefined) {
      const taskSpent = this._costTracker.getTaskCost(taskId);
      const perTaskMax = config.budget.per_task_max ?? config.budget.max_usd;
      return perTaskMax - taskSpent;
    }

    return config.budget.max_usd - this._costTracker.getTotalCost();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a BudgetChecker with the given config and cost tracker.
 */
export function createBudgetChecker(
  configManager: ConfigManager,
  costTracker: CostTracker,
): BudgetChecker {
  return new BudgetCheckerImpl(configManager, costTracker);
}
