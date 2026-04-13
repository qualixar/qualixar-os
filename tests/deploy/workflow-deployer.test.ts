/**
 * Qualixar OS Phase 18 -- Workflow Deployer Tests
 * LLD Section 10.6: 14 tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createWorkflowDeployer } from '../../src/deploy/workflow-deployer.js';
import { createCronScheduler } from '../../src/deploy/cron-scheduler.js';
import type { WorkflowDeployer } from '../../src/deploy/workflow-deployer.js';
import type { CronScheduler } from '../../src/deploy/cron-scheduler.js';

// ---------------------------------------------------------------------------
// Mock EventBus (matches QosEvent shape)
// ---------------------------------------------------------------------------

function createMockEventBus() {
  const handlers = new Map<string, Set<Function>>();
  return {
    emit: vi.fn(),
    on: vi.fn((type: string, handler: Function) => {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
    }),
    off: vi.fn(),
    replay: vi.fn(),
    _handlers: handlers,
  };
}

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

function createMockOrchestrator() {
  return {
    run: vi.fn().mockResolvedValue({
      taskId: 'task_mock_001',
      status: 'completed',
      output: 'done',
      artifacts: [],
      cost: { totalUsd: 0.01, inputTokens: 100, outputTokens: 50 },
      judges: [],
      teamDesign: null,
      duration_ms: 1000,
      metadata: {},
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    redirect: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    recoverIncompleteTasks: vi.fn(),
    modeEngine: {} as never,
    modelRouter: {} as never,
    costTracker: {} as never,
    forge: {} as never,
    judgePipeline: {} as never,
    slmLite: {} as never,
    agentRegistry: {} as never,
    swarmEngine: {} as never,
    strategyScorer: {} as never,
    eventBus: {} as never,
    db: {} as never,
    budgetChecker: {} as never,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: InstanceType<typeof Database>;
let deployer: WorkflowDeployer;
let scheduler: CronScheduler;
let eventBus: ReturnType<typeof createMockEventBus>;
let orchestrator: ReturnType<typeof createMockOrchestrator>;

const BLUEPRINT_DDL = `
  CREATE TABLE IF NOT EXISTS blueprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('agent', 'topology', 'workflow', 'pipeline')),
    description TEXT NOT NULL DEFAULT '',
    topology TEXT,
    agent_count INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    config TEXT NOT NULL DEFAULT '{}',
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const DEPLOYMENTS_DDL = `
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    blueprint_id TEXT NOT NULL,
    blueprint_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('once', 'cron', 'event')),
    cron_expression TEXT,
    trigger_event TEXT,
    last_task_id TEXT,
    last_run_at TEXT,
    last_run_status TEXT CHECK (last_run_status IN ('success', 'failure') OR last_run_status IS NULL),
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const TASKS_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function insertBlueprint(id = 'bp_test_001', name = 'Test Blueprint', config = '{}') {
  db.prepare(
    `INSERT INTO blueprints (id, name, type, config) VALUES (?, ?, 'workflow', ?)`,
  ).run(id, name, config);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(BLUEPRINT_DDL);
  db.exec(DEPLOYMENTS_DDL);
  db.exec(TASKS_DDL);

  eventBus = createMockEventBus();
  orchestrator = createMockOrchestrator();
  scheduler = createCronScheduler();
  deployer = createWorkflowDeployer(db, orchestrator as never, scheduler, eventBus as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowDeployer', () => {
  it('deploy() with triggerType=once creates a task immediately', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'once' });
    expect(orchestrator.run).toHaveBeenCalledOnce();
    expect(dep.triggerType).toBe('once');
  });

  it('deploy() with triggerType=cron schedules with CronScheduler', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({
      blueprintId: 'bp_test_001',
      triggerType: 'cron',
      cronExpression: '0 */6 * * *',
    });
    expect(dep.triggerType).toBe('cron');
    expect(dep.cronExpression).toBe('0 */6 * * *');
    expect(scheduler.activeCount).toBe(1);
  });

  it('deploy() with triggerType=event registers EventBus listener', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({
      blueprintId: 'bp_test_001',
      triggerType: 'event',
      triggerEvent: 'task:completed',
    });
    expect(dep.triggerType).toBe('event');
    expect(eventBus.on).toHaveBeenCalled();
  });

  it('deploy() inserts row into deployments table', async () => {
    insertBlueprint();
    await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: '* * * * *' });
    const row = db.prepare('SELECT * FROM deployments').get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.blueprint_id).toBe('bp_test_001');
  });

  it('deploy() rejects non-existent blueprint', async () => {
    await expect(
      deployer.deploy({ blueprintId: 'bp_nonexistent', triggerType: 'once' }),
    ).rejects.toThrow("Blueprint 'bp_nonexistent' not found");
  });

  it('deploy() rejects invalid cron expression', async () => {
    insertBlueprint();
    await expect(
      deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: 'invalid' }),
    ).rejects.toThrow('expected 5 fields');
  });

  it('deploy() emits deployment:created event', async () => {
    insertBlueprint();
    await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: '0 * * * *' });
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment:created' }),
    );
  });

  it('cancel() sets status to cancelled', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: '0 * * * *' });
    const cancelled = deployer.cancel(dep.id);
    expect(cancelled).toBe(true);
    const row = db.prepare('SELECT status FROM deployments WHERE id = ?').get(dep.id) as { status: string };
    expect(row.status).toBe('cancelled');
  });

  it('cancel() removes cron schedule', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: '0 * * * *' });
    expect(scheduler.activeCount).toBe(1);
    deployer.cancel(dep.id);
    expect(scheduler.activeCount).toBe(0);
  });

  it('cancel() emits deployment:cancelled event', async () => {
    insertBlueprint();
    const dep = await deployer.deploy({ blueprintId: 'bp_test_001', triggerType: 'cron', cronExpression: '0 * * * *' });
    deployer.cancel(dep.id);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment:cancelled' }),
    );
  });

  it('executeDeployment() updates run count and last_run on success', async () => {
    insertBlueprint('bp_exec', 'Exec Test', '{"prompt":"test"}');
    const dep = await deployer.deploy({ blueprintId: 'bp_exec', triggerType: 'once' });
    const row = db.prepare('SELECT run_count, last_run_status FROM deployments WHERE id = ?').get(dep.id) as {
      run_count: number;
      last_run_status: string;
    };
    expect(row.run_count).toBe(1);
    expect(row.last_run_status).toBe('success');
  });

  it('executeDeployment() records failure on task error', async () => {
    orchestrator.run.mockRejectedValueOnce(new Error('Provider down'));
    insertBlueprint('bp_fail', 'Fail Test');
    const dep = await deployer.deploy({ blueprintId: 'bp_fail', triggerType: 'once' });
    const row = db.prepare('SELECT run_count, last_run_status FROM deployments WHERE id = ?').get(dep.id) as {
      run_count: number;
      last_run_status: string;
    };
    expect(row.run_count).toBe(1);
    expect(row.last_run_status).toBe('failure');
  });

  it('list() returns all deployments', async () => {
    insertBlueprint('bp_a', 'A');
    insertBlueprint('bp_b', 'B');
    await deployer.deploy({ blueprintId: 'bp_a', triggerType: 'cron', cronExpression: '0 * * * *' });
    await deployer.deploy({ blueprintId: 'bp_b', triggerType: 'cron', cronExpression: '0 * * * *' });
    const all = deployer.list();
    expect(all.length).toBe(2);
  });

  it('list() filters by status', async () => {
    insertBlueprint('bp_f', 'Filter');
    const dep = await deployer.deploy({ blueprintId: 'bp_f', triggerType: 'cron', cronExpression: '0 * * * *' });
    deployer.cancel(dep.id);
    const active = deployer.list('active');
    const cancelled = deployer.list('cancelled');
    expect(active.length).toBe(0);
    expect(cancelled.length).toBe(1);
  });
});
