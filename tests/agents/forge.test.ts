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
import type { EventBus } from '../../src/events/event-bus.js';

describe('Forge', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let forge: Forge;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);

    const mockRouter = createMockModelRouter((req) => {
      if (req.prompt.includes('Classify this task')) {
        return 'code';
      }
      if (req.prompt.includes('Design an agent team')) {
        return JSON.stringify({
          topology: 'sequential',
          agents: [
            { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Write code.' },
            { role: 'reviewer', model: 'claude-sonnet-4-6', systemPrompt: 'Review code.' },
          ],
          reasoning: 'Sequential code then review',
        });
      }
      if (req.prompt.includes('Adapt this existing team')) {
        return JSON.stringify({
          agents: [
            { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Write code for new task.' },
          ],
          reasoning: 'Adapted for new task',
        });
      }
      if (req.prompt.includes('Refine this team design')) {
        return JSON.stringify({
          agents: [
            { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Write better code.' },
            { role: 'tester', model: 'claude-sonnet-4-6', systemPrompt: 'Test the code.' },
          ],
          reasoning: 'Added tester to fix quality issues',
        });
      }
      if (req.prompt.includes('COMPLETE REDESIGN')) {
        return JSON.stringify({
          topology: 'parallel',
          agents: [
            { role: 'analyst', model: 'claude-sonnet-4-6', systemPrompt: 'Analyze.' },
            { role: 'writer', model: 'claude-sonnet-4-6', systemPrompt: 'Write.' },
          ],
          reasoning: 'Radical redesign with parallel approach',
        });
      }
      return 'fallback response';
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

  describe('designTeam()', () => {
    it('should design a team from scratch', async () => {
      const design = await forge.designTeam({
        taskId: 'task-1',
        prompt: 'Build a REST API',
        taskType: 'code',
        mode: 'power',
      });

      expect(design.id).toBeTruthy();
      expect(design.topology).toBe('sequential');
      expect(design.agents.length).toBeGreaterThan(0);
      expect(design.agents[0].role).toBeTruthy();
      expect(design.estimatedCostUsd).toBeGreaterThan(0);
    });

    it('should adapt from library when good design exists', async () => {
      // Save a high-scoring design first
      const existingDesign = {
        id: 'existing-1',
        taskType: 'code',
        topology: 'sequential',
        agents: [
          { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code.' },
        ],
        reasoning: 'Test',
        estimatedCostUsd: 0.03,
        version: 1,
      };

      forge.saveDesign(existingDesign);
      // Update performance to be above threshold
      db.db.prepare('UPDATE team_designs SET performance_score = 0.9 WHERE id = ?').run('existing-1');

      const design = await forge.designTeam({
        taskId: 'task-2',
        prompt: 'Build a CLI tool',
        taskType: 'code',
        mode: 'power',
      });

      expect(design.reasoning).toContain('Adapted');
    });

    it('should validate design and reject zero agents', async () => {
      const badRouter = createMockModelRouter(() => JSON.stringify({
        topology: 'sequential',
        agents: [],
        reasoning: 'empty',
      }));

      const badForge = createForge(
        badRouter,
        createMockStrategyMemory(),
        createMockStrategyScorer(),
        createMockModeEngine(),
        createTestDb(),
        eventBus,
      );

      await expect(
        badForge.designTeam({
          taskId: 'task-3',
          prompt: 'test',
          taskType: 'code',
          mode: 'power',
        }),
      ).rejects.toThrow('zero agents');
    });

    it('should handle classify LLM failure gracefully', async () => {
      let callCount = 0;
      const failingRouter = createMockModelRouter((req) => {
        callCount++;
        if (callCount === 1) throw new Error('classify failed');
        return JSON.stringify({
          topology: 'sequential',
          agents: [{ role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'do' }],
          reasoning: 'ok',
        });
      });

      const forgeWithFail = createForge(
        failingRouter,
        createMockStrategyMemory(),
        createMockStrategyScorer(),
        createMockModeEngine(),
        db,
        eventBus,
      );

      const design = await forgeWithFail.designTeam({
        taskId: 'task-4',
        prompt: 'test',
        taskType: 'code',
        mode: 'power',
      });

      expect(design.agents.length).toBeGreaterThan(0);
    });
  });

  describe('redesign()', () => {
    it('should refine design when redesignCount < 3', async () => {
      const previousDesign = {
        id: 'prev-1',
        taskType: 'code',
        topology: 'sequential',
        agents: [
          { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code.' },
        ],
        reasoning: 'Original',
        estimatedCostUsd: 0.03,
        version: 1,
      };

      const design = await forge.redesign({
        taskId: 'task-5',
        prompt: 'Build API',
        taskType: 'code',
        mode: 'power',
        previousDesign,
        judgeResult: {
          issues: [{ description: 'No tests' }],
          verdicts: [{ verdict: 'reject', feedback: 'Missing tests' }],
        },
        redesignCount: 1,
      });

      expect(design.reasoning).toContain('Refined');
      expect(design.version).toBe(2);
    });

    it('should radical redesign when redesignCount >= 3', async () => {
      const previousDesign = {
        id: 'prev-2',
        taskType: 'code',
        topology: 'sequential',
        agents: [
          { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code.' },
        ],
        reasoning: 'Original',
        estimatedCostUsd: 0.03,
        version: 1,
      };

      const design = await forge.redesign({
        taskId: 'task-6',
        prompt: 'Build API',
        taskType: 'code',
        mode: 'power',
        previousDesign,
        judgeResult: {
          issues: [{ description: 'Repeated failures' }],
          verdicts: [{ verdict: 'reject', feedback: 'Still broken' }],
        },
        redesignCount: 3,
      });

      expect(design.reasoning).toContain('Radical redesign');
      expect(design.topology).not.toBe('sequential');
    });
  });

  describe('getLibrary()', () => {
    it('should return empty array when no designs', () => {
      expect(forge.getLibrary()).toHaveLength(0);
    });

    it('should filter by task type', () => {
      forge.saveDesign({
        id: 'd1', taskType: 'code', topology: 'sequential',
        agents: [{ role: 'a', model: 'm', systemPrompt: 'p' }],
        reasoning: '', estimatedCostUsd: 0.01, version: 1,
      });
      forge.saveDesign({
        id: 'd2', taskType: 'research', topology: 'parallel',
        agents: [{ role: 'b', model: 'm', systemPrompt: 'p' }],
        reasoning: '', estimatedCostUsd: 0.01, version: 1,
      });

      expect(forge.getLibrary('code')).toHaveLength(1);
      expect(forge.getLibrary('research')).toHaveLength(1);
      expect(forge.getLibrary()).toHaveLength(2);
    });
  });

  describe('saveDesign()', () => {
    it('should persist design to library', () => {
      const design = {
        id: 'save-1',
        taskType: 'code',
        topology: 'parallel',
        agents: [{ role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' }],
        reasoning: 'Test',
        estimatedCostUsd: 0.03,
        version: 1,
      };

      forge.saveDesign(design);

      const lib = forge.getLibrary('code');
      expect(lib).toHaveLength(1);
      expect(lib[0].id).toBe('save-1');
    });
  });
});
