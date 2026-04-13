/**
 * Qualixar OS Phase 6 -- Durability Tests
 * TDD Round 2: Checkpoint/restore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DurabilityImpl, createDurability } from '../../src/engine/durability.js';
import type { DurableState } from '../../src/engine/durability.js';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDurableState(overrides: Partial<DurableState> = {}): DurableState {
  return {
    taskId: 'task-1',
    step: 'init',
    taskOptions: { prompt: 'test prompt' },
    teamDesign: null,
    swarmResult: null,
    judgeResults: [],
    redesignCount: 0,
    costSoFar: 0,
    workingMemory: {},
    timestamp: '2026-03-30T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DurabilityImpl', () => {
  let db: QosDatabase;
  let durability: DurabilityImpl;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
    durability = new DurabilityImpl(db);
  });

  afterEach(() => {
    db.close();
  });

  // Test 10: checkpoint saves to events table
  it('checkpoint saves to events table', () => {
    const state = makeDurableState();
    durability.checkpoint('task-1', 'init', state);

    const row = db.get<{ type: string; task_id: string; source: string }>(
      'SELECT type, task_id, source FROM events WHERE type = ? AND task_id = ?',
      ['checkpoint:saved', 'task-1'],
    );
    expect(row).toBeDefined();
    expect(row!.type).toBe('checkpoint:saved');
    expect(row!.task_id).toBe('task-1');
    expect(row!.source).toBe('durability');
  });

  // Test 11: getLastCheckpoint returns latest
  it('getLastCheckpoint returns latest checkpoint', () => {
    durability.checkpoint('task-1', 'init', makeDurableState({ step: 'init' }));
    durability.checkpoint('task-1', 'memory', makeDurableState({ step: 'memory' }));
    durability.checkpoint('task-1', 'forge', makeDurableState({ step: 'forge' }));

    const last = durability.getLastCheckpoint('task-1');
    expect(last).not.toBeNull();
    expect(last!.step).toBe('forge');
  });

  // Test 12: getLastCheckpoint returns null for unknown task
  it('getLastCheckpoint returns null for unknown task', () => {
    const result = durability.getLastCheckpoint('nonexistent');
    expect(result).toBeNull();
  });

  // Test 13: listCheckpoints returns ordered array
  it('listCheckpoints returns ordered array', () => {
    durability.checkpoint('task-1', 'init', makeDurableState({ step: 'init', costSoFar: 0 }));
    durability.checkpoint('task-1', 'memory', makeDurableState({ step: 'memory', costSoFar: 0.01 }));
    durability.checkpoint('task-1', 'forge', makeDurableState({ step: 'forge', costSoFar: 0.05 }));

    const records = durability.listCheckpoints('task-1');
    expect(records).toHaveLength(3);
    expect(records[0].step).toBe('init');
    expect(records[1].step).toBe('memory');
    expect(records[2].step).toBe('forge');
    expect(records[2].costAtCheckpoint).toBe(0.05);
  });

  // Test 14: clearCheckpoints removes all
  it('clearCheckpoints removes all checkpoints for task', () => {
    durability.checkpoint('task-1', 'init', makeDurableState());
    durability.checkpoint('task-1', 'memory', makeDurableState({ step: 'memory' }));
    durability.clearCheckpoints('task-1');

    expect(durability.getLastCheckpoint('task-1')).toBeNull();
    expect(durability.listCheckpoints('task-1')).toHaveLength(0);
  });

  // Test 15: workingMemory persists through checkpoint
  it('workingMemory persists through checkpoint', () => {
    const state = makeDurableState({
      workingMemory: { memoryContext: { totalFound: 5 }, teamDesign: { id: 'td-1' } },
    });
    durability.checkpoint('task-1', 'forge', state);

    const restored = durability.getLastCheckpoint('task-1');
    expect(restored).not.toBeNull();
    expect(restored!.workingMemory).toEqual({
      memoryContext: { totalFound: 5 },
      teamDesign: { id: 'td-1' },
    });
  });

  // Test 16: workingMemory restored correctly
  it('workingMemory restored correctly after serialization', () => {
    const complexMemory = {
      key1: 'string value',
      key2: 42,
      key3: { nested: true, arr: [1, 2, 3] },
      key4: null,
    };
    const state = makeDurableState({ workingMemory: complexMemory });
    durability.checkpoint('task-1', 'run', state);

    const restored = durability.getLastCheckpoint('task-1');
    expect(restored!.workingMemory).toEqual(complexMemory);
  });

  // Test 17: getIncompleteTaskIds finds stale tasks
  it('getIncompleteTaskIds finds tasks with non-terminal status and checkpoints', () => {
    // Create tasks in different states
    db.insert('tasks', {
      id: 'running-task',
      type: 'custom',
      prompt: 'test',
      status: 'running',
      mode: 'companion',
      created_at: '2026-03-30T00:00:00Z',
      updated_at: '2026-03-30T00:00:00Z',
    });
    db.insert('tasks', {
      id: 'completed-task',
      type: 'custom',
      prompt: 'test',
      status: 'completed',
      mode: 'companion',
      created_at: '2026-03-30T00:00:00Z',
      updated_at: '2026-03-30T00:00:00Z',
    });
    db.insert('tasks', {
      id: 'pending-task',
      type: 'custom',
      prompt: 'test',
      status: 'pending',
      mode: 'companion',
      created_at: '2026-03-30T00:00:00Z',
      updated_at: '2026-03-30T00:00:00Z',
    });

    // Add checkpoints for running and completed tasks
    durability.checkpoint('running-task', 'forge', makeDurableState({ taskId: 'running-task' }));
    durability.checkpoint('completed-task', 'output', makeDurableState({ taskId: 'completed-task' }));
    durability.checkpoint('pending-task', 'init', makeDurableState({ taskId: 'pending-task' }));

    const incompleteIds = durability.getIncompleteTaskIds();
    expect(incompleteIds).toContain('running-task');
    expect(incompleteIds).toContain('pending-task');
    expect(incompleteIds).not.toContain('completed-task');
  });

  // Test 18: Multiple tasks have independent checkpoints
  it('clearCheckpoints only affects specified task', () => {
    durability.checkpoint('task-1', 'init', makeDurableState({ taskId: 'task-1' }));
    durability.checkpoint('task-2', 'init', makeDurableState({ taskId: 'task-2' }));

    durability.clearCheckpoints('task-1');

    expect(durability.getLastCheckpoint('task-1')).toBeNull();
    expect(durability.getLastCheckpoint('task-2')).not.toBeNull();
  });

  // Test 19: DurableState with teamDesign round-trips
  it('DurableState with teamDesign round-trips correctly', () => {
    const state = makeDurableState({
      teamDesign: {
        id: 'td-1',
        taskType: 'code',
        topology: 'sequential',
        agents: [{ role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code well' }],
        reasoning: 'Simple task',
        estimatedCostUsd: 0.05,
        version: 1,
      },
    });
    durability.checkpoint('task-1', 'forge', state);

    const restored = durability.getLastCheckpoint('task-1');
    expect(restored!.teamDesign).toEqual(state.teamDesign);
  });
});

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

describe('createDurability', () => {
  it('creates a Durability instance via factory', () => {
    const db = createDatabase(':memory:');
    db.runMigrations();
    const d = createDurability(db);
    expect(d).toBeDefined();
    // Verify it works
    d.checkpoint('test-task', 'init', makeDurableState());
    const last = d.getLastCheckpoint('test-task');
    expect(last).not.toBeNull();
    db.close();
  });
});
