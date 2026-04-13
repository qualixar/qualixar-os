import { describe, it, expect, beforeEach } from 'vitest';
import { createScheduler, type Scheduler } from '../../src/agents/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = createScheduler();
  });

  describe('addTask()', () => {
    it('should add a task', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      expect(scheduler.getTask('a')).toBeDefined();
    });

    it('should throw on duplicate task id', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      expect(() =>
        scheduler.addTask({ id: 'a', priority: 2, dependsOn: [], status: 'pending' }),
      ).toThrow('Duplicate task');
    });

    it('should throw on empty id', () => {
      expect(() =>
        scheduler.addTask({ id: '', priority: 1, dependsOn: [], status: 'pending' }),
      ).toThrow('non-empty');
    });
  });

  describe('removeTask()', () => {
    it('should remove existing task', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.removeTask('a');
      expect(scheduler.getTask('a')).toBeUndefined();
    });

    it('should throw for unknown task', () => {
      expect(() => scheduler.removeTask('nonexistent')).toThrow('not found');
    });
  });

  describe('getExecutionOrder()', () => {
    it('should return correct order for independent tasks (priority-sorted)', () => {
      scheduler.addTask({ id: 'c', priority: 3, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'b', priority: 2, dependsOn: [], status: 'pending' });

      const result = scheduler.getExecutionOrder();
      expect(result.hasCycles).toBe(false);
      expect(result.executionOrder).toEqual(['a', 'b', 'c']);
      expect(result.levels).toHaveLength(1);
    });

    it('should return correct order for linear chain', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: ['a'], status: 'pending' });
      scheduler.addTask({ id: 'c', priority: 1, dependsOn: ['b'], status: 'pending' });

      const result = scheduler.getExecutionOrder();
      expect(result.hasCycles).toBe(false);
      expect(result.executionOrder).toEqual(['a', 'b', 'c']);
      expect(result.levels).toHaveLength(3);
    });

    it('should detect cycles', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: ['c'], status: 'pending' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: ['a'], status: 'pending' });
      scheduler.addTask({ id: 'c', priority: 1, dependsOn: ['b'], status: 'pending' });

      const result = scheduler.getExecutionOrder();
      expect(result.hasCycles).toBe(true);
      expect(result.executionOrder).toHaveLength(0);
    });

    it('should handle diamond dependency', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: ['a'], status: 'pending' });
      scheduler.addTask({ id: 'c', priority: 1, dependsOn: ['a'], status: 'pending' });
      scheduler.addTask({ id: 'd', priority: 1, dependsOn: ['b', 'c'], status: 'pending' });

      const result = scheduler.getExecutionOrder();
      expect(result.hasCycles).toBe(false);
      expect(result.executionOrder[0]).toBe('a');
      expect(result.executionOrder[3]).toBe('d');
      expect(result.levels).toHaveLength(3);
    });

    it('should throw for missing dependency', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: ['missing'], status: 'pending' });
      expect(() => scheduler.getExecutionOrder()).toThrow('missing task');
    });
  });

  describe('getNextReady()', () => {
    it('should return undefined when no ready tasks', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      expect(scheduler.getNextReady()).toBeUndefined();
    });

    it('should return highest priority ready task', () => {
      scheduler.addTask({ id: 'a', priority: 3, dependsOn: [], status: 'ready' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: [], status: 'ready' });
      scheduler.addTask({ id: 'c', priority: 2, dependsOn: [], status: 'ready' });

      const next = scheduler.getNextReady();
      expect(next!.id).toBe('b');
    });
  });

  describe('markCompleted()', () => {
    it('should mark task as completed', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'running' });
      scheduler.markCompleted('a');
      expect(scheduler.getTask('a')!.status).toBe('completed');
    });

    it('should make dependents ready when all deps complete', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'running' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: ['a'], status: 'pending' });

      scheduler.markCompleted('a');
      expect(scheduler.getTask('b')!.status).toBe('ready');
    });

    it('should not make dependents ready if some deps still pending', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'running' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'c', priority: 1, dependsOn: ['a', 'b'], status: 'pending' });

      scheduler.markCompleted('a');
      expect(scheduler.getTask('c')!.status).toBe('pending');
    });

    it('should throw for unknown task', () => {
      expect(() => scheduler.markCompleted('nonexistent')).toThrow('not found');
    });
  });

  describe('markFailed()', () => {
    it('should cascade failure to dependents', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'running' });
      scheduler.addTask({ id: 'b', priority: 1, dependsOn: ['a'], status: 'pending' });
      scheduler.addTask({ id: 'c', priority: 1, dependsOn: ['b'], status: 'pending' });

      scheduler.markFailed('a');
      expect(scheduler.getTask('a')!.status).toBe('failed');
      expect(scheduler.getTask('b')!.status).toBe('failed');
      expect(scheduler.getTask('c')!.status).toBe('failed');
    });

    it('should throw for unknown task', () => {
      expect(() => scheduler.markFailed('nonexistent')).toThrow('not found');
    });
  });

  describe('getTasks()', () => {
    it('should return all tasks', () => {
      scheduler.addTask({ id: 'a', priority: 1, dependsOn: [], status: 'pending' });
      scheduler.addTask({ id: 'b', priority: 2, dependsOn: [], status: 'pending' });
      expect(scheduler.getTasks()).toHaveLength(2);
    });
  });
});
