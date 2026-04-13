/**
 * Qualixar OS Phase F -- Forge Marketplace Integration Tests
 * G-15: Forge queries installed skills when designing teams
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createForge, type Forge } from '../../src/agents/forge.js';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import type { ModelRouter, RouteRequest, RouteResult } from '../../src/router/model-router.js';
import type { StrategyMemory } from '../../src/quality/strategy-memory.js';
import type { StrategyScorer, StrategyRecommendation } from '../../src/quality/strategy-scorer.js';
import type { ModeEngine } from '../../src/engine/mode-engine.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockModelRouter(): ModelRouter {
  return {
    route: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        topology: 'sequential',
        agents: [
          { role: 'researcher', model: 'gpt-4.1-mini', systemPrompt: 'Research', tools: [], dependsOn: [] },
          { role: 'writer', model: 'gpt-4.1-mini', systemPrompt: 'Write', tools: [], dependsOn: ['researcher'] },
        ],
        judgeProfile: {
          criteria: [{ name: 'quality', weight: 1.0 }],
          strictness: 'balanced',
          focusAreas: ['accuracy'],
        },
        reasoning: 'Standard research-write pipeline',
      }),
      model: 'gpt-4.1-mini',
      provider: 'test',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
      latencyMs: 100,
    } as RouteResult),
    getDiscoveredModels: vi.fn().mockReturnValue([{ name: 'gpt-4.1-mini', provider: 'openai' }]),
    getAvailableModels: vi.fn().mockReturnValue([{ name: 'gpt-4.1-mini', provider: 'openai', qualityScore: 0.8 }]),
  } as unknown as ModelRouter;
}

function mockStrategyMemory(): StrategyMemory {
  return {
    getBestStrategy: vi.fn().mockReturnValue(null),
    recordOutcome: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  } as unknown as StrategyMemory;
}

function mockStrategyScorer(): StrategyScorer {
  return {
    getRecommendation: vi.fn().mockReturnValue({
      strategy: 'sequential',
      confidence: 0.8,
      basedOn: 'default',
    } as StrategyRecommendation),
    recordOutcome: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    getRecommendations: vi.fn().mockReturnValue([]),
  } as unknown as StrategyScorer;
}

function mockModeEngine(): ModeEngine {
  return {
    currentMode: 'standard',
    getFeatureGates: vi.fn().mockReturnValue({
      topologies: ['sequential', 'parallel', 'hierarchical', 'dag'],
      simulationEnabled: false,
      maxAgents: 10,
      maxRounds: 5,
    }),
    switchMode: vi.fn(),
  } as unknown as ModeEngine;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Forge Marketplace Integration (G-15)', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let forge: Forge;
  let router: ModelRouter;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
    eventBus = createEventBus(db);
    router = mockModelRouter();

    // Create skill_packages table (normally created at marketplace bootstrap)
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT,
        category TEXT,
        author_name TEXT,
        license TEXT,
        tool_count INTEGER DEFAULT 0,
        manifest TEXT,
        status TEXT DEFAULT 'active',
        installed_at TEXT,
        updated_at TEXT
      )
    `);

    forge = createForge(
      router,
      mockStrategyMemory(),
      mockStrategyScorer(),
      mockModeEngine(),
      db,
      eventBus,
    );
  });

  afterEach(() => {
    db.close();
  });

  it('designTeam succeeds without installed skills', async () => {
    const design = await forge.designTeam({
      taskId: 'task-mp-1',
      prompt: 'Build a REST API',
      taskType: 'code',
      mode: 'standard',
    });

    expect(design.agents.length).toBeGreaterThan(0);
    expect(design.topology).toBe('sequential');
  });

  it('designTeam includes marketplace context when skills are installed', async () => {
    // Install a skill via raw SQL (skill_packages is not in ALLOWED_TABLES whitelist)
    db.db.prepare(`
      INSERT INTO skill_packages (id, name, version, description, category, author_name, license, tool_count, manifest, status, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      'skill-1', 'github-reviewer', '1.0.0', 'GitHub PR review tool', 'code',
      'test', 'MIT', 2, JSON.stringify({ name: 'github-reviewer', tools: [] }),
      new Date().toISOString(), new Date().toISOString(),
    );

    const design = await forge.designTeam({
      taskId: 'task-mp-2',
      prompt: 'Review my GitHub PR',
      taskType: 'code',
      mode: 'standard',
    });

    // Verify the prompt sent to the model router includes marketplace context
    const routeCalls = (router.route as ReturnType<typeof vi.fn>).mock.calls;
    // Second call is the design prompt (first is classify)
    const designPrompt = routeCalls[1][0].prompt as string;
    expect(designPrompt).toContain('github-reviewer');
    expect(designPrompt).toContain('GitHub PR review tool');
    expect(designPrompt).toContain('Installed marketplace skills');
  });

  it('designTeam works when skill_packages table has no active skills', async () => {
    // Insert an inactive skill via raw SQL
    db.db.prepare(`
      INSERT INTO skill_packages (id, name, version, description, category, author_name, license, tool_count, manifest, status, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?)
    `).run(
      'skill-inactive', 'old-tool', '0.1.0', 'Deprecated tool', 'knowledge',
      'test', 'MIT', 1, '{}',
      new Date().toISOString(), new Date().toISOString(),
    );

    const design = await forge.designTeam({
      taskId: 'task-mp-3',
      prompt: 'Write documentation',
      taskType: 'creative',
      mode: 'standard',
    });

    expect(design.agents.length).toBeGreaterThan(0);
    // Should NOT include marketplace context in the prompt
    const routeCalls = (router.route as ReturnType<typeof vi.fn>).mock.calls;
    const designPrompt = routeCalls[1][0].prompt as string;
    expect(designPrompt).not.toContain('Installed marketplace skills');
  });
});
