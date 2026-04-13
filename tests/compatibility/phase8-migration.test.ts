/**
 * Qualixar OS Phase 8a -- Migration Tests
 * TDD: RED phase -- write tests before implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { phase8Migrations } from '../../src/db/migrations/phase8.js';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';

describe('Phase 8 Migrations', () => {
  let database: QosDatabase;

  beforeEach(() => {
    database = createDatabase(':memory:');
  });

  afterEach(() => {
    database.close();
  });

  it('exports three migrations (tables + indexes)', () => {
    expect(phase8Migrations).toHaveLength(3);
    expect(phase8Migrations[0].name).toBe('phase8_imported_agents');
    expect(phase8Migrations[1].name).toBe('phase8_a2a_agents');
    expect(phase8Migrations[2].name).toBe('phase8_indexes');
    expect(phase8Migrations[0].phase).toBe(8);
    expect(phase8Migrations[1].phase).toBe(8);
    expect(phase8Migrations[2].phase).toBe(8);
  });

  it('creates imported_agents table', () => {
    const runner = new MigrationRunner(database.db);
    runner.registerMigrations(phase8Migrations);
    runner.applyPending();

    // Verify table exists by inserting and querying
    database.insert('imported_agents', {
      id: 'test-1',
      source_format: 'openclaw',
      original_path: '/test/SOUL.md',
      agent_spec: '{"version":1}',
      version: 1,
      created_at: new Date().toISOString(),
    });

    const rows = database.query<{ id: string }>(
      'SELECT id FROM imported_agents WHERE id = ?',
      ['test-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('test-1');
  });

  it('creates a2a_agents table', () => {
    const runner = new MigrationRunner(database.db);
    runner.registerMigrations(phase8Migrations);
    runner.applyPending();

    // Verify table exists by inserting and querying
    database.insert('a2a_agents', {
      id: 'a2a-1',
      name: 'TestA2A',
      url: 'http://localhost:3000',
      agent_card: '{"name":"TestA2A"}',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    const rows = database.query<{ id: string; name: string }>(
      'SELECT id, name FROM a2a_agents WHERE id = ?',
      ['a2a-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('TestA2A');
  });

  it('migrations are idempotent (IF NOT EXISTS)', () => {
    const runner = new MigrationRunner(database.db);
    runner.registerMigrations(phase8Migrations);
    runner.applyPending();

    // Running again should not throw
    const runner2 = new MigrationRunner(database.db);
    runner2.registerMigrations(phase8Migrations);
    expect(() => runner2.applyPending()).not.toThrow();
  });

  it('imported_agents has correct columns', () => {
    const runner = new MigrationRunner(database.db);
    runner.registerMigrations(phase8Migrations);
    runner.applyPending();

    const columns = database.query<{ name: string }>(
      "PRAGMA table_info('imported_agents')",
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('source_format');
    expect(columnNames).toContain('original_path');
    expect(columnNames).toContain('agent_spec');
    expect(columnNames).toContain('version');
    expect(columnNames).toContain('created_at');
  });

  it('a2a_agents has correct columns', () => {
    const runner = new MigrationRunner(database.db);
    runner.registerMigrations(phase8Migrations);
    runner.applyPending();

    const columns = database.query<{ name: string }>(
      "PRAGMA table_info('a2a_agents')",
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('url');
    expect(columnNames).toContain('agent_card');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('last_seen');
    expect(columnNames).toContain('created_at');
  });
});
