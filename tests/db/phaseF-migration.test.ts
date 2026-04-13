/**
 * Qualixar OS Phase F -- Migration Tests
 * G-13: last_heartbeat column on tasks table
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';

describe('Phase F Migrations', () => {
  let db: QosDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.runMigrations();
  });

  afterEach(() => {
    db.close();
  });

  it('adds last_heartbeat column to tasks table', () => {
    // Insert a task and set heartbeat
    db.insert('tasks', {
      id: 'task-mig-1',
      type: 'custom',
      prompt: 'test migration',
      status: 'running',
      mode: 'standard',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update heartbeat
    db.update('tasks', { last_heartbeat: new Date().toISOString() }, { id: 'task-mig-1' });

    // Query heartbeat
    const row = db.get<{ last_heartbeat: string }>(
      'SELECT last_heartbeat FROM tasks WHERE id = ?',
      ['task-mig-1'],
    );
    expect(row).toBeDefined();
    expect(row!.last_heartbeat).toBeTruthy();
  });

  it('heartbeat index exists', () => {
    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tasks_heartbeat'",
    );
    expect(indexes.length).toBe(1);
  });

  it('last_heartbeat defaults to NULL', () => {
    db.insert('tasks', {
      id: 'task-mig-2',
      type: 'custom',
      prompt: 'test null heartbeat',
      status: 'pending',
      mode: 'standard',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const row = db.get<{ last_heartbeat: string | null }>(
      'SELECT last_heartbeat FROM tasks WHERE id = ?',
      ['task-mig-2'],
    );
    expect(row).toBeDefined();
    expect(row!.last_heartbeat).toBeNull();
  });
});
