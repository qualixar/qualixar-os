/**
 * Qualixar OS Phase 9 -- Full Lifecycle E2E Tests (Part 2: Scenarios 11-17)
 *
 * Consensus, OTEL, Metrics, Formatters, OpenClaw, HTTP, Bootstrap wiring.
 * Uses real bootstrap (createQos) with :memory: SQLite.
 * No real network calls, no real LLM calls.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createQos } from '../../src/bootstrap.js';
import { QosConfigSchema, type QosConfig, type TaskResult, type JudgeVerdict } from '../../src/types/common.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import { createConsensusEngine } from '../../src/quality/consensus.js';
import { createHttpApp } from '../../src/channels/http-server.js';
import { formatResult, formatCost } from '../../src/channels/formatters.js';
import { OpenClawReader } from '../../src/compatibility/openclaw-reader.js';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTestConfig(): QosConfig {
  return QosConfigSchema.parse({
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
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
// Scenario 11: Consensus Algorithms
// ---------------------------------------------------------------------------

describe('Scenario 11: Consensus Algorithms', () => {
  const engine = createConsensusEngine();

  const verdicts: readonly JudgeVerdict[] = [
    {
      judgeModel: 'claude-sonnet-4-6',
      verdict: 'approve',
      score: 0.85,
      feedback: 'Looks good',
      issues: [],
      durationMs: 100,
    },
    {
      judgeModel: 'gpt-4.1',
      verdict: 'approve',
      score: 0.9,
      feedback: 'Solid',
      issues: [],
      durationMs: 120,
    },
    {
      judgeModel: 'gemini-2.5-pro',
      verdict: 'reject',
      score: 0.4,
      feedback: 'Missing tests',
      issues: [{
        severity: 'high',
        category: 'testing',
        description: 'No unit tests',
      }],
      durationMs: 80,
    },
  ];

  it('weighted_majority produces valid result', () => {
    const result = engine.resolve(verdicts, 'weighted_majority');
    expect(result.algorithm).toBe('weighted_majority');
    expect(['approve', 'reject', 'revise']).toContain(result.decision);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.agreementRatio).toBeGreaterThanOrEqual(0);
    expect(result.agreementRatio).toBeLessThanOrEqual(1);
  });

  it('bft_inspired produces valid result', () => {
    const result = engine.resolve(verdicts, 'bft_inspired');
    expect(result.algorithm).toBe('bft_inspired');
    expect(['approve', 'reject', 'revise']).toContain(result.decision);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('raft_inspired produces valid result', () => {
    const result = engine.resolve(verdicts, 'raft_inspired');
    expect(result.algorithm).toBe('raft_inspired');
    expect(['approve', 'reject', 'revise']).toContain(result.decision);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('single verdict returns consistent result', () => {
    const single: readonly JudgeVerdict[] = [{
      judgeModel: 'mock',
      verdict: 'approve',
      score: 0.95,
      feedback: 'Perfect',
      issues: [],
      durationMs: 50,
    }];

    const wm = engine.resolve(single, 'weighted_majority');
    expect(wm.decision).toBe('approve');

    const raft = engine.resolve(single, 'raft_inspired');
    expect(raft.decision).toBe('approve');
  });
});

// ---------------------------------------------------------------------------
// Scenario 12: OTEL Spans
// ---------------------------------------------------------------------------

describe('Scenario 12: OTEL Spans', () => {
  it('OpenTelemetry API is importable', async () => {
    const api = await import('@opentelemetry/api');
    expect(api.trace).toBeDefined();
    expect(typeof api.trace.getTracer).toBe('function');
  });

  it('InMemorySpanExporter captures spans', async () => {
    const { InMemorySpanExporter, SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
    const { trace } = await import('@opentelemetry/api');

    const exporter = new InMemorySpanExporter();

    // OTEL SDK v2: span processors are passed via constructor config,
    // not via addSpanProcessor() (removed in v2).
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    const tracer = trace.getTracer('qos-e2e-test');
    const span = tracer.startSpan('test-operation');
    span.setAttribute('test.key', 'test-value');
    span.end();

    // Flush spans
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);

    const testSpan = spans.find((s) => s.name === 'test-operation');
    expect(testSpan).toBeDefined();

    // Clean up
    await provider.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Scenario 13: MetricsCollector (via DB-backed cost aggregation)
// ---------------------------------------------------------------------------

describe('Scenario 13: MetricsCollector', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('cost_entries table aggregates by model', () => {
    orc = createQos(getTestConfig());

    orc.costTracker.record({
      id: 'mc-1', model: 'claude-sonnet-4-6', amountUsd: 0.005,
      category: 'code', createdAt: new Date().toISOString(),
    });
    orc.costTracker.record({
      id: 'mc-2', model: 'claude-sonnet-4-6', amountUsd: 0.003,
      category: 'research', createdAt: new Date().toISOString(),
    });
    orc.costTracker.record({
      id: 'mc-3', model: 'gpt-4.1-mini', amountUsd: 0.001,
      category: 'code', createdAt: new Date().toISOString(),
    });

    const summary = orc.costTracker.getSummary();
    expect(summary.total_usd).toBeCloseTo(0.009, 6);
    expect(summary.by_model['claude-sonnet-4-6']).toBeCloseTo(0.008, 6);
    expect(summary.by_model['gpt-4.1-mini']).toBeCloseTo(0.001, 6);
    expect(summary.by_category['code']).toBeCloseTo(0.006, 6);
    expect(summary.by_category['research']).toBeCloseTo(0.003, 6);
  });

  it('model_calls table tracks latency and token counts', () => {
    orc = createQos(getTestConfig());

    orc.costTracker.recordModelCall({
      id: 'mcall-1', provider: 'anthropic', model: 'claude-sonnet-4-6',
      inputTokens: 500, outputTokens: 200, costUsd: 0.004,
      latencyMs: 1200, status: 'success', createdAt: new Date().toISOString(),
    });

    const rows = orc.db.query<{
      input_tokens: number;
      output_tokens: number;
      latency_ms: number;
    }>('SELECT input_tokens, output_tokens, latency_ms FROM model_calls', []);

    expect(rows).toHaveLength(1);
    expect(rows[0].input_tokens).toBe(500);
    expect(rows[0].output_tokens).toBe(200);
    expect(rows[0].latency_ms).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Scenario 14: Formatters
// ---------------------------------------------------------------------------

describe('Scenario 14: Formatters', () => {
  const mockResult: TaskResult = {
    taskId: 'fmt-1',
    status: 'completed',
    output: 'Formatted output text',
    artifacts: [{ path: '/test.ts', content: 'const x = 1;', type: 'code' }],
    cost: {
      total_usd: 0.042,
      by_model: { 'mock-model': 0.042 },
      by_agent: {},
      by_category: { code: 0.042 },
      budget_remaining_usd: 9.958,
    },
    judges: [],
    teamDesign: null,
    duration_ms: 2500,
    metadata: {},
  };

  it('json format produces valid JSON', () => {
    const json = formatResult(mockResult, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.taskId).toBe('fmt-1');
    expect(parsed.status).toBe('completed');
  });

  it('cli format produces readable text', () => {
    const cli = formatResult(mockResult, 'cli');
    expect(typeof cli).toBe('string');
    expect(cli.length).toBeGreaterThan(0);
  });

  it('markdown format produces string output', () => {
    const md = formatResult(mockResult, 'markdown');
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('html format produces string output', () => {
    const html = formatResult(mockResult, 'html');
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('formatCost produces cost summary string', () => {
    const cost = formatCost(mockResult.cost, 'json');
    const parsed = JSON.parse(cost);
    expect(parsed.total_usd).toBe(0.042);
  });
});

// ---------------------------------------------------------------------------
// Scenario 15: Import Agent (OpenClaw)
// ---------------------------------------------------------------------------

describe('Scenario 15: Import Agent (OpenClaw)', () => {
  it('OpenClawReader.canRead identifies SOUL.md files', () => {
    const reader = new OpenClawReader();
    expect(reader.canRead('SOUL.md')).toBe(true);
    expect(reader.canRead('agent.soul.md')).toBe(true);
    expect(reader.canRead('README.md')).toBe(false);
    expect(reader.canRead('config.yaml')).toBe(false);
  });

  it('OpenClawReader.read parses SOUL.md fixture to AgentSpec', async () => {
    const reader = new OpenClawReader();
    const fixturePath = path.resolve(
      import.meta.dirname ?? __dirname,
      '../fixtures/sample-SOUL.md',
    );

    const spec = await reader.read(fixturePath);

    expect(spec.version).toBe(1);
    expect(spec.name).toBe('TestAgent');
    expect(spec.description).toBe('A test agent for E2E testing');
    expect(spec.source.format).toBe('openclaw');
    expect(spec.tools.length).toBeGreaterThanOrEqual(1);
  });

  it('AgentSpec has correct structure from parsed SOUL.md', async () => {
    const reader = new OpenClawReader();
    const fixturePath = path.resolve(
      import.meta.dirname ?? __dirname,
      '../fixtures/sample-SOUL.md',
    );

    const spec = await reader.read(fixturePath);

    // Verify AgentSpec structural completeness
    expect(spec.version).toBe(1);
    expect(spec.source).toEqual({ format: 'openclaw', originalPath: fixturePath });
    expect(Array.isArray(spec.roles)).toBe(true);
    expect(Array.isArray(spec.tools)).toBe(true);
    expect(typeof spec.config).toBe('object');

    // Tools should include those from frontmatter + body
    const toolNames = spec.tools.map((t) => t.name);
    expect(toolNames).toContain('code_review'); // from body ## Tools section
  });
});

// ---------------------------------------------------------------------------
// Scenario 16: HTTP API Smoke
// ---------------------------------------------------------------------------

describe('Scenario 16: HTTP API Smoke', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('/api/health returns ok', async () => {
    orc = createQos(getTestConfig());
    const app = createHttpApp(orc);

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('/api/ready returns version', async () => {
    orc = createQos(getTestConfig());
    const app = createHttpApp(orc);

    const res = await app.request('/api/ready');
    expect(res.status).toBe(200);

    const body = await res.json() as { ready: boolean; version: string };
    expect(body.ready).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(body.version).toBeTruthy();
  });

  it('/api/tasks returns empty array initially', async () => {
    orc = createQos(getTestConfig());
    const app = createHttpApp(orc);

    const res = await app.request('/api/tasks');
    expect(res.status).toBe(200);

    const body = await res.json() as { tasks: unknown[] };
    expect(body.tasks).toEqual([]);
  });

  it('/api/tasks returns inserted tasks', async () => {
    orc = createQos(getTestConfig());
    const app = createHttpApp(orc);

    orc.db.insert('tasks', {
      id: 'http-task-1',
      type: 'code',
      prompt: 'Build something',
      status: 'completed',
      mode: 'companion',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await app.request('/api/tasks');
    const body = await res.json() as { tasks: Array<{ id: string }> };
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    expect(body.tasks.some((t) => t.id === 'http-task-1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 17: Bootstrap Wiring
// ---------------------------------------------------------------------------

describe('Scenario 17: Bootstrap Wiring', () => {
  let orc: Orchestrator | undefined;

  afterEach(() => {
    if (orc?.db) {
      try { orc.db.close(); } catch { /* already closed */ }
    }
    orc = undefined;
  });

  it('all 10 exposed Orchestrator properties are defined', () => {
    orc = createQos(getTestConfig());
    expect(orc.modeEngine).toBeDefined();
    expect(orc.costTracker).toBeDefined();
    expect(orc.forge).toBeDefined();
    expect(orc.judgePipeline).toBeDefined();
    expect(orc.slmLite).toBeDefined();
    expect(orc.agentRegistry).toBeDefined();
    expect(orc.swarmEngine).toBeDefined();
    expect(orc.strategyScorer).toBeDefined();
    expect(orc.eventBus).toBeDefined();
    expect(orc.db).toBeDefined();
  });

  it('modeEngine has required interface methods', () => {
    orc = createQos(getTestConfig());
    expect(typeof orc.modeEngine.isFeatureEnabled).toBe('function');
    expect(typeof orc.modeEngine.getFeatureGates).toBe('function');
    expect(typeof orc.modeEngine.switchMode).toBe('function');
  });

  it('agentRegistry has required interface methods', () => {
    orc = createQos(getTestConfig());
    expect(typeof orc.agentRegistry.register).toBe('function');
    expect(typeof orc.agentRegistry.deregister).toBe('function');
    expect(typeof orc.agentRegistry.get).toBe('function');
    expect(typeof orc.agentRegistry.listActive).toBe('function');
  });

  it('strategyScorer has recordOutcome method', () => {
    orc = createQos(getTestConfig());
    expect(typeof orc.strategyScorer.recordOutcome).toBe('function');
  });

  it('bootstrap with power mode creates orchestrator successfully', () => {
    orc = createQos(getPowerConfig());
    expect(orc.modeEngine.currentMode).toBe('power');
    expect(orc.modeEngine.getFeatureGates().rlEnabled).toBe(true);
  });

  it('database is functional with query/get after bootstrap', () => {
    orc = createQos(getTestConfig());

    const tables = orc.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'", [],
    );
    expect(tables.length).toBeGreaterThan(0);

    const count = orc.db.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM tasks', [],
    );
    expect(count!.cnt).toBe(0);
  });

  it('eventBus getLastEventId returns 0 on fresh DB', () => {
    orc = createQos(getTestConfig());
    expect(orc.eventBus.getLastEventId()).toBe(0);
  });

  it('costTracker starts with zero total', () => {
    orc = createQos(getTestConfig());
    expect(orc.costTracker.getTotalCost()).toBe(0);
    const summary = orc.costTracker.getSummary();
    expect(summary.total_usd).toBe(0);
    expect(summary.budget_remaining_usd).toBe(-1); // Sentinel per C4
  });
});
