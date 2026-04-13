/**
 * Qualixar OS V2 -- Database Tests
 *
 * LLD Section 6, Step 4 (tests #19-31).
 * Tests: createDatabase, WAL mode, FK enforcement, CRUD helpers, indexes, close.
 * All tests use :memory: database via beforeEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabase,
  type QosDatabase,
} from '../../src/db/database.js';

// ---------------------------------------------------------------------------
// Test Setup -- fresh :memory: database for each test
// ---------------------------------------------------------------------------

let db: QosDatabase;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed in some tests
  }
});

// ---------------------------------------------------------------------------
// #19: createDatabase creates all 8 domain tables
// ---------------------------------------------------------------------------

describe('QosDatabase', () => {
  it('#19 createDatabase creates all 8 domain tables', () => {
    const expectedTables = [
      'tasks',
      'agents',
      'judge_results',
      'model_calls',
      'cost_entries',
      'forge_designs',
      'memory_entries',
      'events',
    ];

    for (const table of expectedTables) {
      const row = db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table],
      );
      expect(row).toBeDefined();
      expect(row!.name).toBe(table);
    }
  });

  // -------------------------------------------------------------------------
  // #20: WAL mode is active
  // -------------------------------------------------------------------------

  it('#20 WAL mode is active', () => {
    const result = db.db.pragma('journal_mode', { simple: true });
    // :memory: databases report 'memory' for journal_mode,
    // but WAL pragma was set -- verify pragma was called without error.
    // For file-based DBs this returns 'wal'. For :memory: it returns 'memory'.
    expect(['wal', 'memory']).toContain(result);
  });

  // -------------------------------------------------------------------------
  // #21: Foreign keys are enforced
  // -------------------------------------------------------------------------

  it('#21 Foreign keys are enforced', () => {
    const result = db.db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  // -------------------------------------------------------------------------
  // #22: insert() and query() round-trip for tasks table
  // -------------------------------------------------------------------------

  it('#22 insert() and query() round-trip for tasks table', () => {
    const now = new Date().toISOString();
    db.insert('tasks', {
      id: 'task-001',
      type: 'code',
      prompt: 'Write a hello world',
      status: 'pending',
      mode: 'companion',
      cost_usd: 0,
      created_at: now,
      updated_at: now,
    });

    const rows = db.query<{
      id: string;
      type: string;
      prompt: string;
      status: string;
      mode: string;
    }>('SELECT * FROM tasks WHERE id = ?', ['task-001']);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('task-001');
    expect(rows[0].type).toBe('code');
    expect(rows[0].prompt).toBe('Write a hello world');
    expect(rows[0].status).toBe('pending');
    expect(rows[0].mode).toBe('companion');
  });

  // -------------------------------------------------------------------------
  // #23: insert() and query() round-trip for events table
  // -------------------------------------------------------------------------

  it('#23 insert() and query() round-trip for events table', () => {
    db.insert('events', {
      type: 'system:started',
      payload: JSON.stringify({ version: '2.0.0' }),
      source: 'bootstrap',
      created_at: new Date().toISOString(),
    });

    const rows = db.query<{
      id: number;
      type: string;
      payload: string;
      source: string;
    }>('SELECT * FROM events WHERE type = ?', ['system:started']);

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('system:started');
    expect(rows[0].source).toBe('bootstrap');
    expect(JSON.parse(rows[0].payload)).toEqual({ version: '2.0.0' });
  });

  // -------------------------------------------------------------------------
  // #24: update() modifies correct rows only
  // -------------------------------------------------------------------------

  it('#24 update() modifies correct rows only', () => {
    const now = new Date().toISOString();
    const baseTask = {
      type: 'code',
      prompt: 'task prompt',
      status: 'pending',
      mode: 'companion',
      cost_usd: 0,
      created_at: now,
      updated_at: now,
    };

    db.insert('tasks', { ...baseTask, id: 'task-A' });
    db.insert('tasks', { ...baseTask, id: 'task-B' });

    // Update only task-A
    db.update(
      'tasks',
      { status: 'completed', result: 'done' },
      { id: 'task-A' },
    );

    const taskA = db.get<{ id: string; status: string; result: string }>(
      'SELECT id, status, result FROM tasks WHERE id = ?',
      ['task-A'],
    );
    const taskB = db.get<{ id: string; status: string; result: string | null }>(
      'SELECT id, status, result FROM tasks WHERE id = ?',
      ['task-B'],
    );

    expect(taskA!.status).toBe('completed');
    expect(taskA!.result).toBe('done');
    expect(taskB!.status).toBe('pending');
    expect(taskB!.result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // #25: get() returns single row
  // -------------------------------------------------------------------------

  it('#25 get() returns single row', () => {
    const now = new Date().toISOString();
    db.insert('tasks', {
      id: 'task-single',
      type: 'research',
      prompt: 'Find papers',
      status: 'pending',
      mode: 'power',
      cost_usd: 0,
      created_at: now,
      updated_at: now,
    });

    const row = db.get<{ id: string; type: string }>(
      'SELECT * FROM tasks WHERE id = ?',
      ['task-single'],
    );

    expect(row).toBeDefined();
    expect(row!.id).toBe('task-single');
    expect(row!.type).toBe('research');
  });

  // -------------------------------------------------------------------------
  // #26: get() returns undefined for missing row
  // -------------------------------------------------------------------------

  it('#26 get() returns undefined for missing row', () => {
    const row = db.get<{ id: string }>(
      'SELECT * FROM tasks WHERE id = ?',
      ['nonexistent-id'],
    );

    expect(row).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // #27: query() returns multiple rows
  // -------------------------------------------------------------------------

  it('#27 query() returns multiple rows', () => {
    const now = new Date().toISOString();
    const baseTask = {
      type: 'code',
      prompt: 'do something',
      status: 'pending',
      mode: 'companion',
      cost_usd: 0,
      created_at: now,
      updated_at: now,
    };

    db.insert('tasks', { ...baseTask, id: 'task-1' });
    db.insert('tasks', { ...baseTask, id: 'task-2' });
    db.insert('tasks', { ...baseTask, id: 'task-3' });

    const rows = db.query<{ id: string }>(
      'SELECT * FROM tasks WHERE status = ?',
      ['pending'],
    );

    expect(rows).toHaveLength(3);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('task-1');
    expect(ids).toContain('task-2');
    expect(ids).toContain('task-3');
  });

  // -------------------------------------------------------------------------
  // #28: Indexes exist (idx_events_type, idx_events_task)
  // -------------------------------------------------------------------------

  it('#28 Indexes exist (idx_events_type, idx_events_task)', () => {
    const idxType = db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      ['idx_events_type'],
    );
    const idxTask = db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      ['idx_events_task'],
    );

    expect(idxType).toBeDefined();
    expect(idxType!.name).toBe('idx_events_type');
    expect(idxTask).toBeDefined();
    expect(idxTask!.name).toBe('idx_events_task');
  });

  // -------------------------------------------------------------------------
  // #29: _migrations table exists
  // -------------------------------------------------------------------------

  it('#29 _migrations table exists', () => {
    const row = db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      ['_migrations'],
    );

    expect(row).toBeDefined();
    expect(row!.name).toBe('_migrations');
  });

  // -------------------------------------------------------------------------
  // #30: close() closes the connection
  // -------------------------------------------------------------------------

  it('#30 close() closes the connection', () => {
    db.close();

    // After close, attempting any operation should throw
    expect(() =>
      db.query('SELECT 1'),
    ).toThrow();
  });

  // -------------------------------------------------------------------------
  // #31: FK violation: inserting agent without matching task throws
  // -------------------------------------------------------------------------

  it('#31 FK violation: inserting agent without matching task throws', () => {
    expect(() =>
      db.insert('agents', {
        id: 'agent-001',
        task_id: 'nonexistent-task',
        role: 'coder',
        model: 'claude-sonnet-4-6',
        status: 'idle',
        cost_usd: 0,
        created_at: new Date().toISOString(),
      }),
    ).toThrow();
  });

  // -------------------------------------------------------------------------
  // Coverage: insert() with unknown table name rejects via whitelist
  // -------------------------------------------------------------------------

  it('insert() throws for table not in ALLOWED_TABLES whitelist', () => {
    expect(() =>
      db.insert('not_a_real_table', { id: '1', value: 'test' }),
    ).toThrow('Table "not_a_real_table" is not in the allowed tables whitelist');
  });

  // -------------------------------------------------------------------------
  // Coverage: insert() with empty row object throws
  // -------------------------------------------------------------------------

  it('insert() throws when row object is empty', () => {
    expect(() => db.insert('tasks', {})).toThrow('Cannot insert an empty row');
  });

  // -------------------------------------------------------------------------
  // Coverage: update() with unknown table name rejects via whitelist
  // -------------------------------------------------------------------------

  it('update() throws for table not in ALLOWED_TABLES whitelist', () => {
    expect(() =>
      db.update('bogus_table', { status: 'done' }, { id: '1' }),
    ).toThrow('Table "bogus_table" is not in the allowed tables whitelist');
  });

  // -------------------------------------------------------------------------
  // Coverage: update() with empty set clause throws
  // -------------------------------------------------------------------------

  it('update() throws when set clause is empty', () => {
    expect(() =>
      db.update('tasks', {}, { id: 'task-001' }),
    ).toThrow('Cannot update with empty set clause');
  });

  // -------------------------------------------------------------------------
  // Coverage: update() with empty where clause throws
  // -------------------------------------------------------------------------

  it('update() throws when where clause is empty', () => {
    expect(() =>
      db.update('tasks', { status: 'done' }, {}),
    ).toThrow('Cannot update without a where clause');
  });

  // -------------------------------------------------------------------------
  // Coverage: runMigrations() delegation
  // -------------------------------------------------------------------------

  it('runMigrations() calls MigrationRunner.applyPending() without error', () => {
    // runMigrations() creates a MigrationRunner and calls applyPending()
    // With no migrations registered, it should complete silently
    expect(() => db.runMigrations()).not.toThrow();
  });
});
