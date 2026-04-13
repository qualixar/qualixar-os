import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAgentRegistry,
  type AgentRegistry,
} from '../../src/agents/agent-registry.js';
import { createTestDb, createTestEventBus, makeAgent, resetAgentCounter } from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('AgentRegistry', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let registry: AgentRegistry;

  beforeEach(() => {
    resetAgentCounter();
    db = createTestDb();
    eventBus = createTestEventBus(db);
    registry = createAgentRegistry(db, eventBus);
  });

  describe('register()', () => {
    it('should register an agent and persist to DB', () => {
      const agent = makeAgent();
      registry.register(agent);

      const found = registry.get(agent.id);
      expect(found).toBeDefined();
      expect(found!.role).toBe(agent.role);

      const row = db.get<{ id: string }>('SELECT id FROM agents WHERE id = ?', [agent.id]);
      expect(row).toBeDefined();
    });

    it('should throw on duplicate agent id', () => {
      const agent = makeAgent();
      registry.register(agent);
      expect(() => registry.register(agent)).toThrow('already registered');
    });

    it('should throw on empty agent id', () => {
      const agent = makeAgent({ id: '' });
      expect(() => registry.register(agent)).toThrow('non-empty');
    });

    it('should throw on whitespace-only id', () => {
      const agent = makeAgent({ id: '   ' });
      expect(() => registry.register(agent)).toThrow('non-empty');
    });
  });

  describe('deregister()', () => {
    it('should remove agent from registry', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.deregister(agent.id);

      expect(registry.get(agent.id)).toBeUndefined();
    });

    it('should auto-transition to terminated if not already', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.deregister(agent.id);

      const row = db.get<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agent.id]);
      expect(row!.status).toBe('terminated');
    });

    it('should throw for unknown agent', () => {
      expect(() => registry.deregister('nonexistent')).toThrow('not found');
    });
  });

  describe('get()', () => {
    it('should return undefined for unknown agent', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should return registered agent', () => {
      const agent = makeAgent();
      registry.register(agent);
      expect(registry.get(agent.id)!.id).toBe(agent.id);
    });
  });

  describe('listActive()', () => {
    it('should return empty array when no agents', () => {
      expect(registry.listActive()).toHaveLength(0);
    });

    it('should exclude terminated agents', () => {
      const a1 = makeAgent();
      const a2 = makeAgent();
      registry.register(a1);
      registry.register(a2);
      registry.transitionState(a1.id, 'working');
      registry.transitionState(a1.id, 'terminated');

      const active = registry.listActive();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(a2.id);
    });
  });

  describe('transitionState()', () => {
    it('should transition idle -> working', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      expect(registry.get(agent.id)!.status).toBe('working');
    });

    it('should transition working -> paused', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.transitionState(agent.id, 'paused');
      expect(registry.get(agent.id)!.status).toBe('paused');
    });

    it('should transition working -> error', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.transitionState(agent.id, 'error');
      expect(registry.get(agent.id)!.status).toBe('error');
    });

    it('should transition error -> terminated', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.transitionState(agent.id, 'error');
      registry.transitionState(agent.id, 'terminated');
      expect(registry.get(agent.id)!.status).toBe('terminated');
    });

    it('should reject invalid transitions', () => {
      const agent = makeAgent();
      registry.register(agent);
      expect(() => registry.transitionState(agent.id, 'paused')).toThrow('Invalid state transition');
    });

    it('should reject transition from terminated', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.transitionState(agent.id, 'working');
      registry.transitionState(agent.id, 'terminated');
      expect(() => registry.transitionState(agent.id, 'working')).toThrow('Invalid state transition');
    });

    it('should throw for unknown agent', () => {
      expect(() => registry.transitionState('nonexistent', 'working')).toThrow('not found');
    });
  });

  describe('updateStats()', () => {
    it('should accumulate stats', () => {
      const agent = makeAgent();
      registry.register(agent);
      registry.updateStats(agent.id, { messagesReceived: 3, totalCostUsd: 0.05 });
      registry.updateStats(agent.id, { messagesReceived: 2, llmCallCount: 1 });

      const updated = registry.get(agent.id)!;
      expect(updated.stats.messagesReceived).toBe(5);
      expect(updated.stats.totalCostUsd).toBeCloseTo(0.05);
      expect(updated.stats.llmCallCount).toBe(1);
    });

    it('should throw for unknown agent', () => {
      expect(() => registry.updateStats('nonexistent', { messagesReceived: 1 })).toThrow('not found');
    });
  });

  describe('getByTaskId()', () => {
    it('should return agents for a specific task', () => {
      const a1 = makeAgent({ taskId: 'task-1' });
      const a2 = makeAgent({ taskId: 'task-2' });
      const a3 = makeAgent({ taskId: 'task-1' });
      registry.register(a1);
      registry.register(a2);
      registry.register(a3);

      const result = registry.getByTaskId('task-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getStats()', () => {
    it('should count agents by status', () => {
      const a1 = makeAgent();
      const a2 = makeAgent();
      const a3 = makeAgent();
      registry.register(a1);
      registry.register(a2);
      registry.register(a3);
      registry.transitionState(a1.id, 'working');

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byStatus.idle).toBe(2);
      expect(stats.byStatus.working).toBe(1);
    });
  });
});
