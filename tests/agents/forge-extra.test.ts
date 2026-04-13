import { describe, it, expect, beforeEach } from 'vitest';
import { createForge, type Forge } from '../../src/agents/forge.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  createMockModeEngine,
  createMockStrategyMemory,
  createMockStrategyScorer,
} from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';

describe('Forge -- additional coverage', () => {
  let db: QosDatabase;
  let forge: Forge;

  beforeEach(() => {
    db = createTestDb();
    const eventBus = createTestEventBus(db);
    const mockRouter = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify')) return 'code';
      if (req.prompt.includes('Design an agent team'))
        return JSON.stringify({
          topology: 'sequential',
          agents: [{ role: 'dev', model: 'claude-sonnet-4-6', systemPrompt: 'dev' }],
          reasoning: 'fresh',
        });
      if (req.prompt.includes('Refine'))
        return JSON.stringify({
          agents: [{ role: 'dev', model: 'claude-sonnet-4-6', systemPrompt: 'better dev' }],
          reasoning: 'refined',
        });
      if (req.prompt.includes('COMPLETE REDESIGN'))
        return JSON.stringify({
          topology: 'parallel',
          agents: [
            { role: 'a1', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
            { role: 'a2', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
          ],
          reasoning: 'radical',
        });
      if (req.prompt.includes('Adapt'))
        return JSON.stringify({
          agents: [{ role: 'dev', model: 'claude-sonnet-4-6', systemPrompt: 'adapted' }],
          reasoning: 'adapted',
        });
      return 'fallback';
    });

    forge = createForge(
      mockRouter,
      createMockStrategyMemory(),
      createMockStrategyScorer(),
      createMockModeEngine(),
      db,
      eventBus,
    );
  });

  it('should estimate cost by model type', async () => {
    const router = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify')) return 'code';
      return JSON.stringify({
        topology: 'parallel',
        agents: [
          { role: 'a', model: 'claude-opus-4', systemPrompt: 'p' },
          { role: 'b', model: 'gpt-4o', systemPrompt: 'p' },
          { role: 'c', model: 'claude-haiku-4', systemPrompt: 'p' },
          { role: 'd', model: 'some-other-model', systemPrompt: 'p' },
        ],
        reasoning: 'diverse models',
      });
    });

    const f = createForge(
      router, createMockStrategyMemory(), createMockStrategyScorer(),
      createMockModeEngine(), db, createTestEventBus(db),
    );

    const design = await f.designTeam({
      taskId: 't', prompt: 'test', taskType: 'code', mode: 'power',
    });

    expect(design.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('should handle malformed JSON from LLM gracefully', async () => {
    const badRouter = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify')) return 'code';
      return 'This is not valid JSON at all. {{broken}}';
    });

    const f = createForge(
      badRouter, createMockStrategyMemory(), createMockStrategyScorer(),
      createMockModeEngine(), db, createTestEventBus(db),
    );

    await expect(f.designTeam({
      taskId: 't2', prompt: 'test', taskType: 'code', mode: 'power',
    })).rejects.toThrow('zero agents');
  });

  it('should reject design with invalid topology', async () => {
    const badTopoRouter = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify')) return 'code';
      return JSON.stringify({
        topology: 'nonexistent_topology',
        agents: [{ role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' }],
        reasoning: 'test',
      });
    });

    const f = createForge(
      badTopoRouter, createMockStrategyMemory(), createMockStrategyScorer(),
      createMockModeEngine(), db, createTestEventBus(db),
    );

    // The topology won't be in the gates, so it will be set to undefined and fallback
    const design = await f.designTeam({
      taskId: 't3', prompt: 'test', taskType: 'code', mode: 'power',
    });
    // It should default to 'sequential' when topology is not in gate
    expect(design.topology).toBe('sequential');
  });

  it('should reject agent with empty model', async () => {
    const router = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify')) return 'code';
      return JSON.stringify({
        topology: 'sequential',
        agents: [{ role: 'a', model: '', systemPrompt: 'p' }],
        reasoning: 'test',
      });
    });

    const f = createForge(
      router, createMockStrategyMemory(), createMockStrategyScorer(),
      createMockModeEngine(), db, createTestEventBus(db),
    );

    await expect(f.designTeam({
      taskId: 't4', prompt: 'test', taskType: 'code', mode: 'power',
    })).rejects.toThrow('empty model');
  });

  it('redesign() should force different topology on radical redesign', async () => {
    const design = await forge.redesign({
      taskId: 'r1',
      prompt: 'test',
      taskType: 'code',
      mode: 'power',
      previousDesign: {
        id: 'pd', taskType: 'code', topology: 'parallel',
        agents: [{ role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' }],
        reasoning: '', estimatedCostUsd: 0.01, version: 1,
      },
      judgeResult: {
        issues: [{ description: 'bad' }],
        verdicts: [{ verdict: 'reject', feedback: 'terrible' }],
      },
      redesignCount: 5,
    });

    // Should not be same as previous
    expect(design.topology).not.toBe('parallel');
  });

  it('should query past failures on radical redesign', async () => {
    // Insert a failure pattern
    db.db.prepare(
      "INSERT INTO forge_designs (id, task_type, team_config, failure_count, success_count, avg_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('f1', 'code', '{"test": "failure"}', 2, 0, 0, new Date().toISOString(), new Date().toISOString());

    const design = await forge.redesign({
      taskId: 'r2',
      prompt: 'test',
      taskType: 'code',
      mode: 'power',
      previousDesign: {
        id: 'pd2', taskType: 'code', topology: 'sequential',
        agents: [{ role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' }],
        reasoning: '', estimatedCostUsd: 0.01, version: 1,
      },
      judgeResult: {
        issues: [{ description: 'keeps failing' }],
        verdicts: [{ verdict: 'reject', feedback: 'still bad' }],
      },
      redesignCount: 3,
    });

    expect(design.reasoning).toContain('Radical redesign');
  });
});
