/**
 * Qualixar OS Phase 13 -- Checkpoint Browser Tests
 * Tests list/inspect/canReplay with real DB events.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CheckpointBrowserImpl,
  createCheckpointBrowser,
} from '../../src/engine/checkpoint-browser.js';
import { DurabilityImpl } from '../../src/engine/durability.js';
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
    timestamp: '2026-04-02T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckpointBrowserImpl', () => {
  let db: QosDatabase;
  let durability: DurabilityImpl;
  let browser: CheckpointBrowserImpl;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
    durability = new DurabilityImpl(db);
    browser = new CheckpointBrowserImpl(db);
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  it('list returns empty for unknown task', () => {
    const result = browser.list('nonexistent');
    expect(result).toEqual([]);
  });

  it('list returns checkpoints in order', () => {
    durability.checkpoint('task-1', 'init', makeDurableState({ step: 'init', costSoFar: 0 }));
    durability.checkpoint('task-1', 'memory', makeDurableState({ step: 'memory', costSoFar: 0.01 }));
    durability.checkpoint('task-1', 'forge', makeDurableState({ step: 'forge', costSoFar: 0.05 }));

    const result = browser.list('task-1');
    expect(result).toHaveLength(3);
    expect(result[0].phase).toBe('init');
    expect(result[1].phase).toBe('memory');
    expect(result[2].phase).toBe('forge');
    expect(result[2].costSoFar).toBe(0.05);
  });

  it('list only returns checkpoints for specified task', () => {
    durability.checkpoint('task-1', 'init', makeDurableState({ taskId: 'task-1' }));
    durability.checkpoint('task-2', 'init', makeDurableState({ taskId: 'task-2' }));

    const result = browser.list('task-1');
    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('task-1');
  });

  it('list includes agentCount from swarmResult', () => {
    const stateWithSwarm = makeDurableState({
      step: 'run',
      swarmResult: {
        outputs: {},
        aggregatedOutput: 'test output',
        topology: 'sequential',
        agentResults: [
          { agentId: 'a1', role: 'coder', output: 'done', costUsd: 0.01, durationMs: 100, status: 'completed' },
          { agentId: 'a2', role: 'reviewer', output: 'ok', costUsd: 0.01, durationMs: 50, status: 'completed' },
        ],
        totalCostUsd: 0.02,
        durationMs: 150,
      },
    });
    durability.checkpoint('task-1', 'run', stateWithSwarm);

    const result = browser.list('task-1');
    expect(result[0].agentCount).toBe(2);
  });

  // -----------------------------------------------------------------------
  // inspect()
  // -----------------------------------------------------------------------

  it('inspect returns null for nonexistent checkpoint', () => {
    expect(browser.inspect(99999)).toBeNull();
  });

  it('inspect returns full detail for valid checkpoint', () => {
    durability.checkpoint('task-1', 'forge', makeDurableState({
      step: 'forge',
      costSoFar: 0.05,
      teamDesign: {
        id: 'td-1',
        taskType: 'code',
        topology: 'sequential',
        agents: [{ role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Code' }],
        reasoning: 'Simple task',
        estimatedCostUsd: 0.05,
        version: 1,
      },
      workingMemory: { key1: 'val1', key2: 42 },
    }));

    // Get the checkpoint ID from events
    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' LIMIT 1`, []);
    const detail = browser.inspect(event!.id);

    expect(detail).not.toBeNull();
    expect(detail!.phase).toBe('forge');
    expect(detail!.costSoFar).toBe(0.05);
    expect(detail!.teamDesign).not.toBeNull();
    expect(detail!.workingMemoryKeys).toContain('key1');
    expect(detail!.workingMemoryKeys).toContain('key2');
    expect(detail!.judgeCount).toBe(0);
    expect(detail!.redesignCount).toBe(0);
  });

  it('inspect includes swarmOutputPreview (truncated to 200 chars)', () => {
    const longOutput = 'A'.repeat(500);
    durability.checkpoint('task-1', 'run', makeDurableState({
      step: 'run',
      swarmResult: {
        outputs: {},
        aggregatedOutput: longOutput,
        topology: 'sequential',
        agentResults: [],
        totalCostUsd: 0,
        durationMs: 100,
      },
    }));

    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' LIMIT 1`, []);
    const detail = browser.inspect(event!.id);

    expect(detail!.swarmOutputPreview).toHaveLength(200);
  });

  it('inspect returns null swarmOutputPreview when no swarm result', () => {
    durability.checkpoint('task-1', 'init', makeDurableState());

    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' LIMIT 1`, []);
    const detail = browser.inspect(event!.id);

    expect(detail!.swarmOutputPreview).toBeNull();
  });

  // -----------------------------------------------------------------------
  // canReplay()
  // -----------------------------------------------------------------------

  it('canReplay returns false for nonexistent checkpoint', () => {
    expect(browser.canReplay(99999)).toBe(false);
  });

  it('canReplay returns true for valid checkpoint with taskId, step, prompt', () => {
    durability.checkpoint('task-1', 'forge', makeDurableState({
      step: 'forge',
      taskOptions: { prompt: 'Build a REST API' },
    }));

    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' LIMIT 1`, []);
    expect(browser.canReplay(event!.id)).toBe(true);
  });

  it('canReplay returns false for checkpoint with empty prompt', () => {
    // Manually insert a bad checkpoint
    db.db.prepare(
      `INSERT INTO events (type, payload, source, task_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'checkpoint:saved',
      JSON.stringify({ taskId: 'task-1', step: 'init', taskOptions: { prompt: '' } }),
      'test',
      'task-1',
      '2026-04-02T00:00:00Z',
    );

    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' ORDER BY id DESC LIMIT 1`, []);
    expect(browser.canReplay(event!.id)).toBe(false);
  });

  it('canReplay returns false for corrupted JSON', () => {
    db.db.prepare(
      `INSERT INTO events (type, payload, source, task_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'checkpoint:saved',
      'NOT_VALID_JSON{{{',
      'test',
      'task-1',
      '2026-04-02T00:00:00Z',
    );

    const event = db.get<{ id: number }>(`SELECT id FROM events WHERE type = 'checkpoint:saved' ORDER BY id DESC LIMIT 1`, []);
    expect(browser.canReplay(event!.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createCheckpointBrowser', () => {
  it('creates a CheckpointBrowser instance via factory', () => {
    const db = createDatabase(':memory:');
    db.runMigrations();
    const browser = createCheckpointBrowser(db);
    expect(browser).toBeDefined();
    expect(browser.list('any')).toEqual([]);
    db.close();
  });
});
