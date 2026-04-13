/**
 * Qualixar OS Phase 9 -- Full Lifecycle E2E Tests (Part 1: Scenarios 1-10)
 *
 * Component integration tests with mock LLM.
 * Uses real bootstrap (createQos) with :memory: SQLite.
 * No real network calls, no real LLM calls.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createQos } from '../../src/bootstrap.js';
import { QosConfigSchema, type QosConfig, type TaskResult } from '../../src/types/common.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { QosEvent } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTestConfig(overrides?: Partial<QosConfig>): QosConfig {
  return QosConfigSchema.parse({
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
    ...overrides,
  });
}

function getPowerConfig(): QosConfig {
  return QosConfigSchema.parse({
    mode: 'power',
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: Basic Task Lifecycle (component wiring)
// ---------------------------------------------------------------------------

describe('Scenario 1: Basic Task Lifecycle', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('createQos returns orchestrator with all lifecycle methods', () => {
    orc = createQos(getTestConfig());
    expect(typeof orc.run).toBe('function');
    expect(typeof orc.pause).toBe('function');
    expect(typeof orc.resume).toBe('function');
    expect(typeof orc.redirect).toBe('function');
    expect(typeof orc.cancel).toBe('function');
    expect(typeof orc.getStatus).toBe('function');
    expect(typeof orc.recoverIncompleteTasks).toBe('function');
  });

  it('TaskResult interface has required fields', () => {
    // Validate the shape of TaskResult via structural check
    const mockResult: TaskResult = {
      taskId: 'test-1',
      status: 'completed',
      output: 'test output',
      artifacts: [],
      cost: { total_usd: 0, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: -1 },
      judges: [],
      teamDesign: null,
      duration_ms: 100,
      metadata: {},
    };
    expect(mockResult.taskId).toBe('test-1');
    expect(mockResult.status).toBe('completed');
    expect(mockResult.cost.total_usd).toBe(0);
    expect(mockResult.duration_ms).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Cost Tracking Accuracy
// ---------------------------------------------------------------------------

describe('Scenario 2: Cost Tracking Accuracy', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('costTracker records entries and getSummary aggregates', () => {
    orc = createQos(getTestConfig());
    const ct = orc.costTracker;

    ct.record({
      id: 'ce-1', taskId: 't1', agentId: 'a1',
      model: 'mock-model', amountUsd: 0.005, category: 'code',
      createdAt: new Date().toISOString(),
    });
    ct.record({
      id: 'ce-2', taskId: 't1', agentId: 'a2',
      model: 'mock-model-2', amountUsd: 0.003, category: 'research',
      createdAt: new Date().toISOString(),
    });

    expect(ct.getTaskCost('t1')).toBeCloseTo(0.008, 6);
    expect(ct.getAgentCost('a1')).toBeCloseTo(0.005, 6);
    expect(ct.getTotalCost()).toBeCloseTo(0.008, 6);

    const summary = ct.getSummary('t1');
    expect(summary.total_usd).toBeCloseTo(0.008, 6);
    expect(summary.by_model['mock-model']).toBeCloseTo(0.005, 6);
    expect(summary.by_model['mock-model-2']).toBeCloseTo(0.003, 6);
    expect(summary.by_agent['a1']).toBeCloseTo(0.005, 6);
    expect(summary.by_agent['a2']).toBeCloseTo(0.003, 6);

    // By model values sum to total
    const modelSum = Object.values(summary.by_model).reduce((s, v) => s + v, 0);
    expect(modelSum).toBeCloseTo(summary.total_usd, 6);
  });

  it('recordModelCall tracks provider-level call entries', () => {
    orc = createQos(getTestConfig());
    const ct = orc.costTracker;

    ct.recordModelCall({
      id: 'mc-1', taskId: 't1', provider: 'mock', model: 'mock-model',
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, latencyMs: 42,
      status: 'success', createdAt: new Date().toISOString(),
    });

    const rows = orc.db.query<{ id: string; provider: string }>(
      'SELECT id, provider FROM model_calls WHERE task_id = ?', ['t1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('mock');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Mode Switching
// ---------------------------------------------------------------------------

describe('Scenario 3: Mode Switching', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('companion mode has restricted feature gates', () => {
    orc = createQos(getTestConfig());
    expect(orc.modeEngine.currentMode).toBe('companion');

    const gates = orc.modeEngine.getFeatureGates();
    expect(gates.rlEnabled).toBe(false);
    expect(gates.containerIsolation).toBe(false);
    expect(gates.simulationEnabled).toBe(false);
    expect(gates.topologies.length).toBeLessThanOrEqual(7);
    expect(gates.routingStrategies).toContain('cascade');
  });

  it('power mode has expanded feature gates', () => {
    orc = createQos(getPowerConfig());
    expect(orc.modeEngine.currentMode).toBe('power');

    const gates = orc.modeEngine.getFeatureGates();
    expect(gates.rlEnabled).toBe(true);
    expect(gates.simulationEnabled).toBe(true);
    expect(gates.topologies.length).toBeGreaterThan(6);
    expect(gates.routingStrategies).toContain('pomdp');
  });

  it('switchMode transitions between modes', () => {
    orc = createQos(getTestConfig());
    expect(orc.modeEngine.currentMode).toBe('companion');

    orc.modeEngine.switchMode('power');
    expect(orc.modeEngine.currentMode).toBe('power');
    expect(orc.modeEngine.getFeatureGates().rlEnabled).toBe(true);

    orc.modeEngine.switchMode('companion');
    expect(orc.modeEngine.currentMode).toBe('companion');
    expect(orc.modeEngine.getFeatureGates().rlEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Config Validation
// ---------------------------------------------------------------------------

describe('Scenario 4: Config Validation', () => {
  it('valid config parses without error', () => {
    const config = QosConfigSchema.parse({
      mode: 'companion',
      db: { path: ':memory:' },
    });
    expect(config.mode).toBe('companion');
    expect(config.models.primary).toBe('claude-sonnet-4-6');
    expect(config.budget.max_usd).toBe(100);
  });

  it('defaults are applied for missing fields', () => {
    const config = QosConfigSchema.parse({});
    expect(config.mode).toBe('companion');
    expect(config.models.primary).toBe('claude-sonnet-4-6');
    expect(config.models.fallback).toBe('gpt-4.1-mini');
    expect(config.budget.max_usd).toBe(100);
    expect(config.security.denied_commands).toContain('rm -rf');
    expect(config.memory.enabled).toBe(true);
    expect(config.observability.log_level).toBe('info');
  });

  it('invalid mode value is rejected', () => {
    expect(() => QosConfigSchema.parse({ mode: 'turbo' })).toThrow();
  });

  it('invalid budget value is rejected', () => {
    expect(() => QosConfigSchema.parse({ budget: { max_usd: -5 } })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Event Bus
// ---------------------------------------------------------------------------

describe('Scenario 5: Event Bus', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('subscribed handlers receive emitted events', async () => {
    orc = createQos(getTestConfig());
    const received: QosEvent[] = [];

    orc.eventBus.on('task:created', async (event) => {
      received.push(event);
    });

    orc.eventBus.emit({
      type: 'task:created',
      payload: { taskId: 'test-1', prompt: 'hello' },
      source: 'e2e-test',
      taskId: 'test-1',
    });

    // Give fire-and-forget handlers a tick to execute
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('task:created');
    expect(received[0].payload).toEqual({ taskId: 'test-1', prompt: 'hello' });
  });

  it('wildcard handler receives all event types', async () => {
    orc = createQos(getTestConfig());
    const received: QosEvent[] = [];

    orc.eventBus.on('*', async (event) => {
      received.push(event);
    });

    orc.eventBus.emit({
      type: 'task:created',
      payload: {},
      source: 'test',
    });
    orc.eventBus.emit({
      type: 'model:call_started',
      payload: {},
      source: 'test',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(2);
  });

  it('events are persisted to SQLite and replayable', async () => {
    orc = createQos(getTestConfig());

    orc.eventBus.emit({
      type: 'task:created',
      payload: { seq: 1 },
      source: 'test',
    });
    orc.eventBus.emit({
      type: 'task:completed',
      payload: { seq: 2 },
      source: 'test',
    });

    const replayed: QosEvent[] = [];
    const count = await orc.eventBus.replay(0, async (event) => {
      replayed.push(event);
    });

    expect(count).toBe(2);
    expect(replayed[0].type).toBe('task:created');
    expect(replayed[1].type).toBe('task:completed');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Database Persistence
// ---------------------------------------------------------------------------

describe('Scenario 6: Database Persistence', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('tasks table exists and accepts inserts', () => {
    orc = createQos(getTestConfig());

    orc.db.insert('tasks', {
      id: 'test-task-1',
      type: 'code',
      prompt: 'Build a CLI',
      status: 'pending',
      mode: 'companion',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const row = orc.db.get<{ id: string; status: string }>(
      'SELECT id, status FROM tasks WHERE id = ?', ['test-task-1'],
    );
    expect(row).toBeDefined();
    expect(row!.id).toBe('test-task-1');
    expect(row!.status).toBe('pending');
  });

  it('update modifies existing records', () => {
    orc = createQos(getTestConfig());

    orc.db.insert('tasks', {
      id: 'task-upd-1',
      type: 'research',
      prompt: 'Find papers',
      status: 'pending',
      mode: 'companion',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    orc.db.update('tasks', { status: 'running' }, { id: 'task-upd-1' });

    const row = orc.db.get<{ status: string }>(
      'SELECT status FROM tasks WHERE id = ?', ['task-upd-1'],
    );
    expect(row!.status).toBe('running');
  });

  it('all Phase 0 core tables and _migrations table exist', () => {
    orc = createQos(getTestConfig());

    const tables = orc.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      [],
    );
    const tableNames = tables.map((t) => t.name);

    // Phase 0 core tables (8) + _migrations
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('model_calls');
    expect(tableNames).toContain('cost_entries');
    expect(tableNames).toContain('memory_entries');
    expect(tableNames).toContain('forge_designs');
    expect(tableNames).toContain('judge_results');
    expect(tableNames).toContain('_migrations');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Memory Store and Recall
// ---------------------------------------------------------------------------

describe('Scenario 7: Memory Store and Recall', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('stores and recalls memory entries', async () => {
    orc = createQos(getTestConfig());
    const slm = orc.slmLite as unknown as {
      store(entry: { content: string; layer: string; source: string; metadata: Record<string, unknown> }): Promise<string>;
      recall(query: string): Promise<{ entries: readonly unknown[]; totalFound: number }>;
    };

    const entryId = await slm.store({
      content: 'TypeScript is a typed superset of JavaScript',
      layer: 'semantic',
      source: 'e2e-test',
      metadata: { topic: 'typescript' },
    });

    expect(entryId).toBeDefined();
    expect(typeof entryId).toBe('string');

    // Verify stored in DB
    const row = orc.db.get<{ id: string; content: string }>(
      'SELECT id, content FROM memory_entries WHERE id = ?', [entryId],
    );
    expect(row).toBeDefined();
    expect(row!.content).toBe('TypeScript is a typed superset of JavaScript');
  });

  it('recall returns MemoryContext with expected shape', async () => {
    orc = createQos(getTestConfig());
    const slm = orc.slmLite as unknown as {
      store(entry: { content: string; layer: string; source: string; metadata: Record<string, unknown> }): Promise<string>;
      recall(query: string): Promise<{ entries: readonly unknown[]; totalFound: number; summary: string; layerCounts: Record<string, number> }>;
    };

    await slm.store({
      content: 'Vitest is a fast testing framework',
      layer: 'episodic',
      source: 'e2e-test',
      metadata: {},
    });

    const result = await slm.recall('testing framework');
    expect(result).toBeDefined();
    expect(typeof result.totalFound).toBe('number');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.layerCounts).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Security Sandbox
// ---------------------------------------------------------------------------

describe('Scenario 8: Security Sandbox', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('config includes default denied commands', () => {
    orc = createQos(getTestConfig());
    const config = getTestConfig();
    expect(config.security.denied_commands).toContain('rm -rf');
    expect(config.security.denied_commands).toContain('sudo');
  });

  it('security config has allowed_paths defaults', () => {
    const config = getTestConfig();
    expect(config.security.allowed_paths).toContain('./');
    expect(config.security.container_isolation).toBe(false);
  });

  it('security events are recorded via EventBus', async () => {
    orc = createQos(getTestConfig());
    const received: QosEvent[] = [];

    orc.eventBus.on('security:policy_evaluated', async (event) => {
      received.push(event);
    });

    orc.eventBus.emit({
      type: 'security:policy_evaluated',
      payload: { allowed: true, reason: 'test' },
      source: 'security-engine',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ allowed: true, reason: 'test' });
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Forge Design
// ---------------------------------------------------------------------------

describe('Scenario 9: Forge Design', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('forge component is accessible and has designTeam method', () => {
    orc = createQos(getTestConfig());
    expect(orc.forge).toBeDefined();
    expect(typeof orc.forge.designTeam).toBe('function');
    expect(typeof orc.forge.redesign).toBe('function');
  });

  it('forge_designs table is writable with correct schema', () => {
    orc = createQos(getTestConfig());

    // Phase 0 schema: id, task_type, team_config, success_count, failure_count,
    // avg_score, avg_cost, created_at, updated_at
    orc.db.insert('forge_designs', {
      id: 'fd-1',
      task_type: 'code',
      team_config: JSON.stringify({ topology: 'sequential', agents: [{ role: 'developer' }] }),
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const row = orc.db.get<{ task_type: string; team_config: string }>(
      'SELECT task_type, team_config FROM forge_designs WHERE id = ?', ['fd-1'],
    );
    expect(row!.task_type).toBe('code');
    const config = JSON.parse(row!.team_config);
    expect(config.topology).toBe('sequential');
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Judge Pipeline
// ---------------------------------------------------------------------------

describe('Scenario 10: Judge Pipeline', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('judgePipeline component is accessible with evaluate method', () => {
    orc = createQos(getTestConfig());
    expect(orc.judgePipeline).toBeDefined();
    expect(typeof orc.judgePipeline.evaluate).toBe('function');
  });

  it('judge_results table is writable with correct schema', () => {
    orc = createQos(getTestConfig());

    // Phase 0 schema: id, task_id, round, judge_model, verdict, score, issues, feedback, created_at
    // First insert a task (FK constraint)
    orc.db.insert('tasks', {
      id: 'jr-task-1', type: 'code', prompt: 'test', status: 'running',
      mode: 'companion', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });

    orc.db.insert('judge_results', {
      id: 'jr-1',
      task_id: 'jr-task-1',
      judge_model: 'mock-model',
      verdict: 'approve',
      score: 0.9,
      feedback: 'Good output',
      issues: '[]',
      round: 1,
      created_at: new Date().toISOString(),
    });

    const row = orc.db.get<{ verdict: string; score: number }>(
      'SELECT verdict, score FROM judge_results WHERE id = ?', ['jr-1'],
    );
    expect(row!.verdict).toBe('approve');
    expect(row!.score).toBe(0.9);
  });
});
