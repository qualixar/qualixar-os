// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Cost Tracker
 *
 * Phase 1 LLD Section 2.10.
 * Per-model, per-agent, per-task cost recording and aggregation.
 *
 * RESOLUTION (C3): recordModelCall() lives here (moved from ModelCall)
 * so ModelCall stays a pure LLM wrapper with no db dependency.
 *
 * RESOLUTION (C4): getSummary() returns budget_remaining_usd = -1 (sentinel).
 * The Orchestrator (Phase 6) computes the real value via BudgetChecker.
 *
 * Hard Rule: All SQL parameterized with ? placeholders.
 */

import type { QosDatabase } from '../db/database.js';
import type { CostEntry, ModelCallEntry, CostSummary } from '../types/common.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CostTracker {
  /** Insert a cost entry into cost_entries table. */
  record(entry: CostEntry): void;

  /** Insert a model call record into model_calls table. */
  recordModelCall(entry: ModelCallEntry): void;

  /** Sum of all cost entries for a given task. Returns 0 if none. */
  getTaskCost(taskId: string): number;

  /** Sum of all cost entries for a given agent. Returns 0 if none. */
  getAgentCost(agentId: string): number;

  /** Sum of all cost entries globally. Returns 0 if none. */
  getTotalCost(): number;

  /**
   * Aggregate cost breakdown. If taskId is provided, scopes to that task.
   * budget_remaining_usd is always -1 (sentinel -- see C4 resolution).
   */
  getSummary(taskId?: string): CostSummary;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class CostTrackerImpl implements CostTracker {
  private readonly _db: QosDatabase;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  record(entry: CostEntry): void {
    const sql = `INSERT INTO cost_entries (id, task_id, agent_id, model, amount_usd, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      entry.id,
      entry.taskId ?? null,
      entry.agentId ?? null,
      entry.model,
      entry.amountUsd,
      entry.category,
      entry.createdAt,
    ];
    this._db.db.prepare(sql).run(...params);
  }

  recordModelCall(entry: ModelCallEntry): void {
    const sql = `INSERT INTO model_calls (id, task_id, agent_id, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      entry.id,
      entry.taskId ?? null,
      entry.agentId ?? null,
      entry.provider,
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.costUsd,
      entry.latencyMs,
      entry.status,
      entry.error ?? null,
      entry.createdAt,
    ];
    this._db.db.prepare(sql).run(...params);
  }

  getTaskCost(taskId: string): number {
    const row = this._db.get<{ total: number }>(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM cost_entries WHERE task_id = ?',
      [taskId],
    );
    return row?.total ?? 0;
  }

  getAgentCost(agentId: string): number {
    const row = this._db.get<{ total: number }>(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM cost_entries WHERE agent_id = ?',
      [agentId],
    );
    return row?.total ?? 0;
  }

  getTotalCost(): number {
    const row = this._db.get<{ total: number }>(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM cost_entries',
      [],
    );
    return row?.total ?? 0;
  }

  getSummary(taskId?: string): CostSummary {
    // 1. Total
    const total_usd = taskId !== undefined
      ? this.getTaskCost(taskId)
      : this.getTotalCost();

    // 2. By model
    const modelRows = this._db.query<{ model: string; total: number }>(
      `SELECT model, COALESCE(SUM(amount_usd), 0) as total
       FROM cost_entries
       WHERE (? IS NULL OR task_id = ?)
       GROUP BY model`,
      [taskId ?? null, taskId ?? null],
    );
    const by_model: Record<string, number> = {};
    for (const row of modelRows) {
      by_model[row.model] = row.total;
    }

    // 3. By agent
    const agentRows = this._db.query<{ agent_id: string; total: number }>(
      `SELECT agent_id, COALESCE(SUM(amount_usd), 0) as total
       FROM cost_entries
       WHERE (? IS NULL OR task_id = ?) AND agent_id IS NOT NULL
       GROUP BY agent_id`,
      [taskId ?? null, taskId ?? null],
    );
    const by_agent: Record<string, number> = {};
    for (const row of agentRows) {
      by_agent[row.agent_id] = row.total;
    }

    // 4. By category
    const categoryRows = this._db.query<{ category: string; total: number }>(
      `SELECT category, COALESCE(SUM(amount_usd), 0) as total
       FROM cost_entries
       WHERE (? IS NULL OR task_id = ?)
       GROUP BY category`,
      [taskId ?? null, taskId ?? null],
    );
    const by_category: Record<string, number> = {};
    for (const row of categoryRows) {
      by_category[row.category] = row.total;
    }

    // 5. Budget remaining: sentinel -1 (C4 resolution)
    return {
      total_usd,
      by_model,
      by_agent,
      by_category,
      budget_remaining_usd: -1,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a CostTracker backed by the given database.
 */
export function createCostTracker(db: QosDatabase): CostTracker {
  return new CostTrackerImpl(db);
}
