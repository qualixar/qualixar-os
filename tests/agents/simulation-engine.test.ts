import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSimulationEngine,
  type SimulationEngine,
} from '../../src/agents/simulation-engine.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  createMockContainerManager,
} from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { TeamDesign, TaskOptions } from '../../src/types/common.js';

function makeDesign(overrides?: Partial<TeamDesign>): TeamDesign {
  return {
    id: 'design-1',
    taskType: 'code',
    topology: 'sequential',
    agents: [
      { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code.' },
      { role: 'reviewer', model: 'claude-sonnet-4-6', systemPrompt: 'Review.' },
    ],
    reasoning: 'Test',
    estimatedCostUsd: 0.06,
    version: 1,
    ...overrides,
  };
}

describe('SimulationEngine', () => {
  let db: QosDatabase;
  let engine: SimulationEngine;

  beforeEach(() => {
    db = createTestDb();
    const eventBus = createTestEventBus(db);
    const mockRouter = createMockModelRouter(() => 'preview output');
    const mockContainer = createMockContainerManager(false);
    engine = createSimulationEngine(mockRouter, mockContainer, eventBus, db);
  });

  describe('selectMode()', () => {
    it('should return sandbox for code tasks', () => {
      expect(engine.selectMode({ prompt: 'test', type: 'code' })).toBe('sandbox');
    });

    it('should return dry-run for research tasks', () => {
      expect(engine.selectMode({ prompt: 'test', type: 'research' })).toBe('dry-run');
    });

    it('should return dry-run for analysis tasks', () => {
      expect(engine.selectMode({ prompt: 'test', type: 'analysis' })).toBe('dry-run');
    });

    it('should return dry-run for creative tasks', () => {
      expect(engine.selectMode({ prompt: 'test', type: 'creative' })).toBe('dry-run');
    });

    it('should return mock for custom tasks', () => {
      expect(engine.selectMode({ prompt: 'test', type: 'custom' })).toBe('mock');
    });

    it('should default to dry-run for undefined type', () => {
      expect(engine.selectMode({ prompt: 'test' })).toBe('dry-run');
    });
  });

  describe('simulate() -- mock mode', () => {
    it('should pass with valid design', async () => {
      const design = makeDesign();
      const task: TaskOptions = { prompt: 'test', type: 'custom' };

      const result = await engine.simulate(design, task);

      expect(result.verdict).toBe('pass');
      expect(result.recommendation).toBe('proceed');
      expect(result.estimatedCostUsd).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail with invalid topology', async () => {
      const design = makeDesign({ topology: 'invalid_topo' });
      const task: TaskOptions = { prompt: 'test', type: 'custom' };

      const result = await engine.simulate(design, task);

      expect(result.verdict).not.toBe('pass');
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect budget overrun', async () => {
      const design = makeDesign({ estimatedCostUsd: 100 });
      const task: TaskOptions = { prompt: 'test', type: 'custom', budget_usd: 10 };

      const result = await engine.simulate(design, task);

      expect(result.issues.some((i) => i.includes('budget'))).toBe(true);
    });

    it('should store result in DB', async () => {
      const design = makeDesign();
      const task: TaskOptions = { prompt: 'test', type: 'custom' };

      await engine.simulate(design, task);

      const rows = db.query<{ verdict: string }>('SELECT verdict FROM simulation_results');
      expect(rows).toHaveLength(1);
      expect(rows[0].verdict).toBe('pass');
    });
  });

  describe('simulate() -- dry-run mode', () => {
    it('should call ModelRouter for each agent', async () => {
      const design = makeDesign();
      const task: TaskOptions = { prompt: 'analyze this', type: 'research' };

      const result = await engine.simulate(design, task);

      expect(result.estimatedCostUsd).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should detect error indicators in LLM response', async () => {
      const db2 = createTestDb();
      const eventBus2 = createTestEventBus(db2);
      const errorRouter = createMockModelRouter(() => 'Error: cannot process this task');
      const mockContainer = createMockContainerManager(false);
      const engine2 = createSimulationEngine(errorRouter, mockContainer, eventBus2, db2);

      const design = makeDesign();
      const task: TaskOptions = { prompt: 'test', type: 'research' };

      const result = await engine2.simulate(design, task);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('simulate() -- sandbox mode (Docker unavailable)', () => {
    it('should fall back to dry-run when Docker unavailable', async () => {
      const design = makeDesign();
      const task: TaskOptions = { prompt: 'write code', type: 'code' };

      const result = await engine.simulate(design, task);

      // Falls back to dry-run, so cost > 0
      expect(result.estimatedCostUsd).toBeGreaterThan(0);
    });
  });

  describe('simulate() -- sandbox mode (Docker available)', () => {
    it('should run in container when Docker available', async () => {
      const db2 = createTestDb();
      const eventBus2 = createTestEventBus(db2);
      const mockRouter = createMockModelRouter(() => 'ok');
      const dockerManager = createMockContainerManager(true);
      const engine2 = createSimulationEngine(mockRouter, dockerManager, eventBus2, db2);

      const design = makeDesign();
      const task: TaskOptions = { prompt: 'code', type: 'code' };

      const result = await engine2.simulate(design, task);
      expect(result.verdict).toBe('pass');
    });
  });
});
