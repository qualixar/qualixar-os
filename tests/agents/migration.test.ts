import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-helpers.js';

describe('Phase 4 Migration', () => {
  it('should create team_designs table', () => {
    const db = createTestDb();
    const rows = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='team_designs'",
    );
    expect(rows).toHaveLength(1);
  });

  it('should create simulation_results table', () => {
    const db = createTestDb();
    const rows = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='simulation_results'",
    );
    expect(rows).toHaveLength(1);
  });

  it('should create indexes', () => {
    const db = createTestDb();
    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    );
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_team_designs_task_type');
    expect(indexNames).toContain('idx_simulation_results_task_id');
  });

  it('should allow inserting into team_designs', () => {
    const db = createTestDb();
    db.db
      .prepare(
        'INSERT INTO team_designs (id, task_type, topology, agents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('t1', 'code', 'sequential', '[]', '2026-01-01', '2026-01-01');

    const row = db.get<{ id: string }>('SELECT id FROM team_designs WHERE id = ?', ['t1']);
    expect(row!.id).toBe('t1');
  });

  it('should allow inserting into simulation_results', () => {
    const db = createTestDb();
    db.db
      .prepare(
        'INSERT INTO simulation_results (id, task_id, verdict, created_at) VALUES (?, ?, ?, ?)',
      )
      .run('s1', 'task-1', 'pass', '2026-01-01');

    const row = db.get<{ verdict: string }>(
      'SELECT verdict FROM simulation_results WHERE id = ?',
      ['s1'],
    );
    expect(row!.verdict).toBe('pass');
  });
});
