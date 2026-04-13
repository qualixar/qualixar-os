import { describe, it, expect, beforeEach } from 'vitest';
import { createSwarmEngine, type SwarmEngine } from '../../src/agents/swarm-engine.js';
import { createMsgHub, type MsgHub } from '../../src/agents/msghub.js';
import { createAgentRegistry, type AgentRegistry } from '../../src/agents/agent-registry.js';
import { createHandoffRouter, type HandoffRouter } from '../../src/agents/handoff-router.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  createMockModeEngine,
  resetAgentCounter,
} from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { TeamDesign, TaskOptions } from '../../src/types/common.js';

function makeDesign(overrides?: Partial<TeamDesign>): TeamDesign {
  return {
    id: 'design-1',
    taskType: 'code',
    topology: 'sequential',
    agents: [
      { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Write code.' },
      { role: 'reviewer', model: 'claude-sonnet-4-6', systemPrompt: 'Review code.' },
    ],
    reasoning: 'Test',
    estimatedCostUsd: 0.06,
    version: 1,
    ...overrides,
  };
}

describe('SwarmEngine', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let msgHub: MsgHub;
  let registry: AgentRegistry;
  let handoffRouter: HandoffRouter;
  let engine: SwarmEngine;

  beforeEach(() => {
    resetAgentCounter();
    db = createTestDb();
    eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
    registry = createAgentRegistry(db, eventBus);
    handoffRouter = createHandoffRouter(msgHub, registry, eventBus);

    const mockRouter = createMockModelRouter(() => 'agent output');
    const mockMode = createMockModeEngine('power');

    engine = createSwarmEngine(
      msgHub, handoffRouter, registry, mockMode, mockRouter, eventBus,
    );
  });

  describe('listTopologies()', () => {
    it('should list all 13 topologies', () => {
      const topologies = engine.listTopologies();
      expect(topologies).toHaveLength(13);
      expect(topologies).toContain('sequential');
      expect(topologies).toContain('parallel');
      expect(topologies).toContain('maker');
      expect(topologies).toContain('hybrid');
    });
  });

  describe('getTopology()', () => {
    it('should return named topology', () => {
      const topo = engine.getTopology('sequential');
      expect(topo.name).toBe('sequential');
    });

    it('should throw for unknown topology', () => {
      expect(() => engine.getTopology('nonexistent')).toThrow('Unknown topology');
    });
  });

  describe('run()', () => {
    it('should run sequential topology successfully', async () => {
      const design = makeDesign({ topology: 'sequential' });
      const task: TaskOptions = { prompt: 'Build a feature' };

      const result = await engine.run(design, task);

      expect(result.topology).toBe('sequential');
      expect(result.aggregatedOutput).toBeTruthy();
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should run parallel topology successfully', async () => {
      const design = makeDesign({ topology: 'parallel' });
      const task: TaskOptions = { prompt: 'Research topics' };

      const result = await engine.run(design, task);
      expect(result.topology).toBe('parallel');
    });

    it('should throw for unknown topology', async () => {
      const design = makeDesign({ topology: 'nonexistent' as any });
      const task: TaskOptions = { prompt: 'test' };

      await expect(engine.run(design, task)).rejects.toThrow('Unknown topology');
    });

    it('should throw for mode-gated topology in companion mode', async () => {
      const companionMode = createMockModeEngine('companion');
      const mockRouter = createMockModelRouter(() => 'out');
      const engine2 = createSwarmEngine(
        msgHub, handoffRouter, registry, companionMode, mockRouter, eventBus,
      );

      const design = makeDesign({ topology: 'maker' });
      const task: TaskOptions = { prompt: 'test' };

      await expect(engine2.run(design, task)).rejects.toThrow('not allowed');
    });

    it('should cleanup agents after successful run', async () => {
      const design = makeDesign({ topology: 'sequential' });
      const task: TaskOptions = { prompt: 'test' };

      await engine.run(design, task);

      // All agents should be deregistered
      expect(registry.listActive()).toHaveLength(0);
    });

    it('should cleanup agents after failed run', async () => {
      const failRouter = createMockModelRouter(() => {
        throw new Error('LLM failed');
      });
      const failEngine = createSwarmEngine(
        msgHub, handoffRouter, registry, createMockModeEngine(), failRouter, eventBus,
      );

      const design = makeDesign({ topology: 'sequential' });
      const task: TaskOptions = { prompt: 'test' };

      await expect(failEngine.run(design, task)).rejects.toThrow('LLM failed');
    });
  });
});
