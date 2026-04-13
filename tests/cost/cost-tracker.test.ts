/**
 * Qualixar OS V2 -- CostTracker Tests
 *
 * Phase 1 LLD Section 2.10, TDD Step 1.
 * Tests: record, recordModelCall, getTaskCost, getAgentCost, getTotalCost, getSummary.
 *
 * Uses :memory: database (Hard Rule #8).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../../src/db/database.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { CostEntry, ModelCallEntry, CostSummary } from '../../src/types/common.js';
import {
  createCostTracker,
  type CostTracker,
} from '../../src/cost/cost-tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    id: overrides.id ?? 'ce-001',
    taskId: 'taskId' in overrides ? overrides.taskId : 'task-1',
    agentId: 'agentId' in overrides ? overrides.agentId : 'agent-1',
    model: overrides.model ?? 'claude-sonnet-4-6',
    amountUsd: overrides.amountUsd ?? 0.005,
    category: overrides.category ?? 'inference',
    createdAt: overrides.createdAt ?? '2026-03-30T12:00:00Z',
  };
}

function makeModelCallEntry(overrides: Partial<ModelCallEntry> = {}): ModelCallEntry {
  return {
    id: overrides.id ?? 'mc-001',
    taskId: overrides.taskId ?? 'task-1',
    agentId: overrides.agentId ?? 'agent-1',
    provider: overrides.provider ?? 'anthropic',
    model: overrides.model ?? 'claude-sonnet-4-6',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 50,
    costUsd: overrides.costUsd ?? 0.005,
    latencyMs: overrides.latencyMs ?? 250,
    status: overrides.status ?? 'success',
    error: overrides.error,
    createdAt: overrides.createdAt ?? '2026-03-30T12:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CostTracker', () => {
  let db: QosDatabase;
  let tracker: CostTracker;

  beforeEach(() => {
    db = createDatabase(':memory:');
    tracker = createCostTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // #1: record() inserts into cost_entries table
  // -------------------------------------------------------------------------

  it('#1 record() inserts into cost_entries table', () => {
    const entry = makeCostEntry();
    tracker.record(entry);

    const rows = db.query<Record<string, unknown>>(
      'SELECT * FROM cost_entries WHERE id = ?',
      [entry.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('ce-001');
    expect(rows[0].task_id).toBe('task-1');
    expect(rows[0].agent_id).toBe('agent-1');
    expect(rows[0].model).toBe('claude-sonnet-4-6');
    expect(rows[0].amount_usd).toBe(0.005);
    expect(rows[0].category).toBe('inference');
    expect(rows[0].created_at).toBe('2026-03-30T12:00:00Z');
  });

  // -------------------------------------------------------------------------
  // #2: recordModelCall() inserts into model_calls table
  // -------------------------------------------------------------------------

  it('#2 recordModelCall() inserts into model_calls table', () => {
    const entry = makeModelCallEntry();
    tracker.recordModelCall(entry);

    const rows = db.query<Record<string, unknown>>(
      'SELECT * FROM model_calls WHERE id = ?',
      [entry.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('mc-001');
    expect(rows[0].task_id).toBe('task-1');
    expect(rows[0].agent_id).toBe('agent-1');
    expect(rows[0].provider).toBe('anthropic');
    expect(rows[0].model).toBe('claude-sonnet-4-6');
    expect(rows[0].input_tokens).toBe(100);
    expect(rows[0].output_tokens).toBe(50);
    expect(rows[0].cost_usd).toBe(0.005);
    expect(rows[0].latency_ms).toBe(250);
    expect(rows[0].status).toBe('success');
    expect(rows[0].error).toBeNull();
    expect(rows[0].created_at).toBe('2026-03-30T12:00:00Z');
  });

  // -------------------------------------------------------------------------
  // #3: getTaskCost() returns sum for task
  // -------------------------------------------------------------------------

  it('#3 getTaskCost() returns sum for task', () => {
    tracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-1', amountUsd: 0.01 }));
    tracker.record(makeCostEntry({ id: 'ce-2', taskId: 'task-1', amountUsd: 0.02 }));
    tracker.record(makeCostEntry({ id: 'ce-3', taskId: 'task-2', amountUsd: 0.05 }));

    const cost = tracker.getTaskCost('task-1');
    expect(cost).toBeCloseTo(0.03, 10);
  });

  // -------------------------------------------------------------------------
  // #4: getAgentCost() returns sum for agent
  // -------------------------------------------------------------------------

  it('#4 getAgentCost() returns sum for agent', () => {
    tracker.record(makeCostEntry({ id: 'ce-1', agentId: 'agent-A', amountUsd: 0.01 }));
    tracker.record(makeCostEntry({ id: 'ce-2', agentId: 'agent-A', amountUsd: 0.03 }));
    tracker.record(makeCostEntry({ id: 'ce-3', agentId: 'agent-B', amountUsd: 0.10 }));

    const cost = tracker.getAgentCost('agent-A');
    expect(cost).toBeCloseTo(0.04, 10);
  });

  // -------------------------------------------------------------------------
  // #5: getTotalCost() returns global sum
  // -------------------------------------------------------------------------

  it('#5 getTotalCost() returns global sum', () => {
    tracker.record(makeCostEntry({ id: 'ce-1', amountUsd: 0.01 }));
    tracker.record(makeCostEntry({ id: 'ce-2', amountUsd: 0.02 }));
    tracker.record(makeCostEntry({ id: 'ce-3', amountUsd: 0.03 }));

    const total = tracker.getTotalCost();
    expect(total).toBeCloseTo(0.06, 10);
  });

  // -------------------------------------------------------------------------
  // #6: getSummary() returns correct by_model, by_agent, by_category breakdowns
  // -------------------------------------------------------------------------

  it('#6 getSummary() returns correct breakdowns', () => {
    tracker.record(makeCostEntry({
      id: 'ce-1', model: 'claude-sonnet-4-6', agentId: 'agent-A',
      category: 'inference', amountUsd: 0.01, taskId: 'task-1',
    }));
    tracker.record(makeCostEntry({
      id: 'ce-2', model: 'gpt-4.1-mini', agentId: 'agent-B',
      category: 'judge', amountUsd: 0.02, taskId: 'task-1',
    }));
    tracker.record(makeCostEntry({
      id: 'ce-3', model: 'claude-sonnet-4-6', agentId: 'agent-A',
      category: 'inference', amountUsd: 0.03, taskId: 'task-1',
    }));

    const summary: CostSummary = tracker.getSummary('task-1');

    expect(summary.total_usd).toBeCloseTo(0.06, 10);

    // by_model
    expect(summary.by_model['claude-sonnet-4-6']).toBeCloseTo(0.04, 10);
    expect(summary.by_model['gpt-4.1-mini']).toBeCloseTo(0.02, 10);

    // by_agent
    expect(summary.by_agent['agent-A']).toBeCloseTo(0.04, 10);
    expect(summary.by_agent['agent-B']).toBeCloseTo(0.02, 10);

    // by_category
    expect(summary.by_category['inference']).toBeCloseTo(0.04, 10);
    expect(summary.by_category['judge']).toBeCloseTo(0.02, 10);
  });

  // -------------------------------------------------------------------------
  // #7: getSummary() returns budget_remaining_usd as -1 (sentinel)
  // -------------------------------------------------------------------------

  it('#7 getSummary() returns budget_remaining_usd as -1 (sentinel)', () => {
    tracker.record(makeCostEntry({ id: 'ce-1', amountUsd: 0.50 }));

    const summary = tracker.getSummary();
    expect(summary.budget_remaining_usd).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // #8: record with zero amount works
  // -------------------------------------------------------------------------

  it('#8 record with zero amount works', () => {
    tracker.record(makeCostEntry({ id: 'ce-zero', amountUsd: 0 }));

    const total = tracker.getTotalCost();
    expect(total).toBe(0);

    const rows = db.query<Record<string, unknown>>(
      'SELECT * FROM cost_entries WHERE id = ?',
      ['ce-zero'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_usd).toBe(0);
  });

  // -------------------------------------------------------------------------
  // #9: getTaskCost returns 0 for unknown task
  // -------------------------------------------------------------------------

  it('#9 getTaskCost returns 0 for unknown task', () => {
    const cost = tracker.getTaskCost('nonexistent-task');
    expect(cost).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Additional: getSummary without taskId returns global summary
  // -------------------------------------------------------------------------

  it('getSummary without taskId returns global summary', () => {
    tracker.record(makeCostEntry({ id: 'ce-1', taskId: 'task-1', amountUsd: 0.01 }));
    tracker.record(makeCostEntry({ id: 'ce-2', taskId: 'task-2', amountUsd: 0.02 }));

    const summary = tracker.getSummary();
    expect(summary.total_usd).toBeCloseTo(0.03, 10);
    expect(summary.budget_remaining_usd).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // Additional: record with null taskId and agentId works
  // -------------------------------------------------------------------------

  it('record with undefined taskId and agentId stores nulls', () => {
    const entry = makeCostEntry({ id: 'ce-null', taskId: undefined, agentId: undefined });
    tracker.record(entry);

    const rows = db.query<Record<string, unknown>>(
      'SELECT * FROM cost_entries WHERE id = ?',
      ['ce-null'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].task_id).toBeNull();
    expect(rows[0].agent_id).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Additional: getAgentCost returns 0 for unknown agent
  // -------------------------------------------------------------------------

  it('getAgentCost returns 0 for unknown agent', () => {
    const cost = tracker.getAgentCost('nonexistent-agent');
    expect(cost).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Additional: recordModelCall with error field
  // -------------------------------------------------------------------------

  it('recordModelCall stores error field correctly', () => {
    const entry = makeModelCallEntry({
      id: 'mc-err',
      status: 'error',
      error: 'Rate limit exceeded',
    });
    tracker.recordModelCall(entry);

    const rows = db.query<Record<string, unknown>>(
      'SELECT * FROM model_calls WHERE id = ?',
      ['mc-err'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].error).toBe('Rate limit exceeded');
  });
});
