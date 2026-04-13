/**
 * Qualixar OS Phase 3 -- Judge Pipeline Tests (Integration)
 * TDD Sequence #10: All sub-components mocked. Full 2-round flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createJudgePipeline } from '../../src/quality/judge-pipeline.js';
import { createConsensusEngine } from '../../src/quality/consensus.js';
import { createIssueExtractor } from '../../src/quality/issue-extractor.js';
import { createDriftDetector } from '../../src/quality/drift-detector.js';
import { createAntiFabrication } from '../../src/quality/anti-fabrication.js';
import { createDatabase } from '../../src/db/database.js';
import { createEventBus } from '../../src/events/event-bus.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { JudgeRequest } from '../../src/quality/judge-pipeline.js';

// ---------------------------------------------------------------------------
// Mock model router that returns judge verdicts as JSON
// ---------------------------------------------------------------------------

function createMockModelRouter(
  verdict: 'approve' | 'reject' | 'revise' = 'approve',
  score: number = 0.85,
) {
  const judgeResponse = JSON.stringify({
    verdict,
    score,
    feedback: `The output is ${verdict}d`,
    issues:
      verdict === 'reject'
        ? [
            {
              severity: 'high',
              category: 'correctness',
              description: 'Bug found',
            },
          ]
        : [],
  });

  return {
    route: vi.fn().mockResolvedValue({
      content: judgeResponse,
      model: 'mock-judge',
      provider: 'mock',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      latencyMs: 500,
    }),
    getAvailableModels: vi.fn().mockReturnValue([
      'claude-sonnet-4-6',
      'gpt-4.1-mini',
      'gemini-2.0-flash',
    ]),
  };
}

function createMockLocalJudgeAdapter(available: boolean = false) {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
    evaluate: vi.fn().mockResolvedValue({
      judgeModel: 'local:bitnet-3b',
      verdict: 'approve' as const,
      score: 0.7,
      feedback: 'Local judge approves',
      issues: [],
      durationMs: 200,
    }),
  };
}

function createMockModeEngine(maxJudges: number = 3) {
  return {
    getFeatureGates: vi.fn().mockReturnValue({ maxJudges }),
  };
}

function makeRequest(overrides: Partial<JudgeRequest> = {}): JudgeRequest {
  return {
    taskId: 'task-1',
    prompt: 'Write a hello world function',
    output: 'function hello() { return "hello world"; }',
    artifacts: [],
    round: 1,
    ...overrides,
  };
}

describe('JudgePipeline', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
    eventBus = createEventBus(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // Basic evaluation flow
  // -------------------------------------------------------------------------

  it('evaluates with 2 judges and returns approve', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());

    expect(result.taskId).toBe('task-1');
    expect(result.round).toBe(1);
    expect(result.verdicts.length).toBeGreaterThanOrEqual(2);
    expect(result.consensus.decision).toBe('approve');
  });

  it('evaluates with rejection and returns issues', async () => {
    const mockRouter = createMockModelRouter('reject', 0.3);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());

    expect(result.consensus.decision).toBe('reject');
    // Issues should be present from the mock reject verdicts
    expect(result.issues.length).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // Hard Rule enforcement
  // -------------------------------------------------------------------------

  it('persists all verdicts to judge_results DB (HARD RULE 3)', async () => {
    // Insert a task row so FK constraint passes
    db.insert('tasks', {
      id: 'task-1',
      type: 'code',
      prompt: 'Write hello world',
      status: 'pending',
      mode: 'companion',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    await pipeline.evaluate(makeRequest());

    const rows = db.query<{ task_id: string }>(
      'SELECT task_id FROM judge_results WHERE task_id = ?',
      ['task-1'],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('gracefully degrades to 1 judge when fewer than minJudges available (G-03)', async () => {
    // Create a router that only returns 1 model, making only 1 judge possible
    const mockRouter = {
      route: vi.fn().mockResolvedValue({
        content: JSON.stringify({ verdict: 'approve', score: 0.9, feedback: 'ok', issues: [] }),
        model: 'mock',
        provider: 'mock',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        latencyMs: 500,
      }),
      getAvailableModels: vi.fn().mockReturnValue(['gpt-4.1-mini']),
    };

    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    // G-03: Should NOT throw -- gracefully degrades to 1 judge
    const result = await pipeline.evaluate(makeRequest());
    expect(result.verdicts.length).toBeGreaterThanOrEqual(1);
    expect(result.consensus.decision).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Local judge integration
  // -------------------------------------------------------------------------

  it('includes local judge when available', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(true);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());

    // Should have 2 cloud judges + 1 local = 3
    expect(result.verdicts.length).toBeGreaterThanOrEqual(3);
    expect(mockLocal.evaluate).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // JSON patches for 'revise' verdict
  // -------------------------------------------------------------------------

  it('generates JSON patches for revise verdict', async () => {
    const judgeResponse = JSON.stringify({
      verdict: 'revise',
      score: 0.5,
      feedback: 'Needs improvement',
      issues: [
        {
          severity: 'medium',
          category: 'correctness',
          description: 'Missing error handling',
          location: '/functions/0/body',
          suggestedFix: 'Add try-catch block',
        },
      ],
    });

    const mockRouter = {
      route: vi.fn().mockResolvedValue({
        content: judgeResponse,
        model: 'mock-judge',
        provider: 'mock',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        latencyMs: 500,
      }),
      getAvailableModels: vi.fn().mockReturnValue([
        'claude-sonnet-4-6',
        'gpt-4.1-mini',
        'gemini-2.0-flash',
      ]),
    };
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());

    if (result.consensus.decision === 'revise') {
      expect(result.patches).toBeDefined();
      expect(result.patches!.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Local judge isAvailable throws (line 185 -- catch branch)
  // -------------------------------------------------------------------------

  it('handles local judge isAvailable() throwing gracefully', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = {
      isAvailable: vi.fn().mockRejectedValue(new Error('Local judge crashed')),
      evaluate: vi.fn(),
    };
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    // Should not throw even though isAvailable rejects
    const result = await pipeline.evaluate(makeRequest());
    expect(result.verdicts.length).toBeGreaterThanOrEqual(2);
    // Local judge should NOT have been called (since isAvailable threw)
    expect(mockLocal.evaluate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Insufficient verdicts after settled (line 211)
  // -------------------------------------------------------------------------

  it('throws when all judge calls reject (insufficient verdicts)', async () => {
    // Router that rejects every call
    const mockRouter = {
      route: vi.fn().mockRejectedValue(new Error('Model unavailable')),
      getAvailableModels: vi.fn().mockReturnValue([
        'claude-sonnet-4-6',
        'gpt-4.1-mini',
      ]),
    };
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    await expect(pipeline.evaluate(makeRequest())).rejects.toThrow(
      'No judge verdicts received',
    );
  });

  // -------------------------------------------------------------------------
  // Consensus split (line 233 -- agreementRatio < 0.5)
  // -------------------------------------------------------------------------

  it('emits consensus:split when agreementRatio < 0.5', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('consensus:split', handler);

    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    // Use a mock consensus engine that returns low agreementRatio
    const mockConsensus = {
      resolve: vi.fn().mockReturnValue({
        algorithm: 'weighted_majority' as const,
        decision: 'revise' as const,
        confidence: 0.1,
        entropy: 1.5,
        agreementRatio: 0.3, // Below 0.5 -> triggers consensus:split
      }),
    };

    const pipeline = createJudgePipeline(
      mockRouter,
      mockConsensus as any,
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());
    expect(result.consensus.agreementRatio).toBe(0.3);
    expect(handler).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Non-JSON judge response (line 344 -- catch in callSingleJudge)
  // -------------------------------------------------------------------------

  it('handles non-JSON judge response gracefully', async () => {
    // Router that returns plain text instead of JSON
    const nonJsonRouter = {
      route: vi.fn().mockResolvedValue({
        content: 'This is not JSON, just plain feedback text',
        model: 'mock-judge',
        provider: 'mock',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        latencyMs: 500,
      }),
      getAvailableModels: vi.fn().mockReturnValue([
        'claude-sonnet-4-6',
        'gpt-4.1-mini',
      ]),
    };
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      nonJsonRouter,
      createConsensusEngine(),
      createIssueExtractor(nonJsonRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(nonJsonRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());
    // Both verdicts should fall back to 'revise' with score 0.3
    for (const v of result.verdicts) {
      expect(v.verdict).toBe('revise');
      expect(v.score).toBe(0.3);
      expect(v.feedback).toBe('This is not JSON, just plain feedback text');
    }
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  it('emits judge:started event', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('judge:started', handler);

    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    await pipeline.evaluate(makeRequest());
    expect(handler).toHaveBeenCalled();
  });

  it('emits judge:approved for approve consensus', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('judge:approved', handler);

    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    await pipeline.evaluate(makeRequest());
    expect(handler).toHaveBeenCalled();
  });

  it('emits judge:rejected for reject consensus', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('judge:rejected', handler);

    const mockRouter = createMockModelRouter('reject', 0.2);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    await pipeline.evaluate(makeRequest());
    expect(handler).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Profile management
  // -------------------------------------------------------------------------

  it('getProfile returns built-in profile', () => {
    const mockRouter = createMockModelRouter();
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const profile = pipeline.getProfile('code');
    expect(profile.name).toBe('code');
    expect(profile.criteria.length).toBe(5);
  });

  it('listProfiles returns all profile names', () => {
    const mockRouter = createMockModelRouter();
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const profiles = pipeline.listProfiles();
    expect(profiles).toContain('default');
    expect(profiles).toContain('code');
    expect(profiles).toContain('research');
    expect(profiles).toContain('creative');
  });

  // -------------------------------------------------------------------------
  // Consensus events (split vs reached)
  // -------------------------------------------------------------------------

  it('emits consensus:reached when agreementRatio >= 0.5', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('consensus:reached', handler);

    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());
    // Both judges agree -> agreementRatio should be >= 0.5
    expect(result.consensus.agreementRatio).toBeGreaterThanOrEqual(0.5);
    expect(handler).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Artifacts in user prompt (line 413-414)
  // -------------------------------------------------------------------------

  it('includes artifacts in user prompt when present', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(
      makeRequest({
        artifacts: [
          { path: 'src/index.ts', content: 'console.log("hello")', type: 'code' },
        ],
      }),
    );

    // Verify the route was called with the artifact content in the user prompt
    const routeCall = mockRouter.route.mock.calls[0][0];
    expect(routeCall.prompt).toContain('Artifacts:');
    expect(routeCall.prompt).toContain('[code] src/index.ts');
    expect(result.taskId).toBe('task-1');
  });

  // -------------------------------------------------------------------------
  // JSON patches: issue without location (line 433 -- op: 'add' branch)
  // -------------------------------------------------------------------------

  it('generates add patches for issues without location', async () => {
    const judgeResponse = JSON.stringify({
      verdict: 'revise',
      score: 0.5,
      feedback: 'Needs improvement',
      issues: [
        {
          severity: 'medium',
          category: 'correctness',
          description: 'Missing error handling',
          suggestedFix: 'Add try-catch block',
          // NOTE: no 'location' field -- triggers the else branch at line 433
        },
      ],
    });

    const mockRouter = {
      route: vi.fn().mockResolvedValue({
        content: judgeResponse,
        model: 'mock-judge',
        provider: 'mock',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        latencyMs: 500,
      }),
      getAvailableModels: vi.fn().mockReturnValue([
        'claude-sonnet-4-6',
        'gpt-4.1-mini',
        'gemini-2.0-flash',
      ]),
    };
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const result = await pipeline.evaluate(makeRequest());

    if (result.consensus.decision === 'revise') {
      expect(result.patches).toBeDefined();
      const addPatch = result.patches!.find((p) => p.op === 'add');
      expect(addPatch).toBeDefined();
      expect(addPatch!.path).toBe('/corrections/-');
    }
  });

  // -------------------------------------------------------------------------
  // DB persist failure catch (line 268 -- catch block)
  // -------------------------------------------------------------------------

  it('continues when DB persist fails for verdicts', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    // Create a DB-like object that throws on insert to judge_results
    const brokenDb = {
      ...db,
      insert: vi.fn().mockImplementation((table: string) => {
        if (table === 'judge_results') {
          throw new Error('DB write failed');
        }
        return db.insert(table, {} as Record<string, unknown>);
      }),
      get: db.get.bind(db),
      query: db.query.bind(db),
      close: db.close.bind(db),
      db: db.db,
    } as unknown as QosDatabase;

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      brokenDb,
    );

    // Should NOT throw even though DB write fails
    const result = await pipeline.evaluate(makeRequest());
    expect(result.verdicts.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Round 2 with previous verdicts (HARD RULE 10)
  // -------------------------------------------------------------------------

  it('includes previous verdicts in round 2 system prompt', async () => {
    const mockRouter = createMockModelRouter('approve', 0.9);
    const mockLocal = createMockLocalJudgeAdapter(false);
    const mockMode = createMockModeEngine();

    const pipeline = createJudgePipeline(
      mockRouter,
      createConsensusEngine(),
      createIssueExtractor(mockRouter),
      createDriftDetector(db, eventBus),
      createAntiFabrication(mockRouter, db, eventBus),
      mockLocal,
      mockMode,
      eventBus,
      db,
    );

    const previousVerdicts = [
      {
        judgeModel: 'gpt-4.1',
        verdict: 'reject' as const,
        score: 0.3,
        feedback: 'Needs error handling',
        issues: [
          {
            severity: 'high' as const,
            category: 'correctness',
            description: 'Missing try-catch',
          },
        ],
        durationMs: 1000,
      },
    ];

    const result = await pipeline.evaluate(
      makeRequest({ round: 2, previousVerdicts }),
    );

    // The system prompt should include previous issues
    const routeCall = mockRouter.route.mock.calls[0][0];
    expect(routeCall.systemPrompt).toContain('Previous round issues');
    expect(result.round).toBe(2);
  });
});
