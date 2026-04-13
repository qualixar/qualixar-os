/**
 * Qualixar OS V2 -- Migration Runner Tests
 *
 * LLD Section 6, Step 5 (tests #32-36).
 * Tests: MigrationRunner with test migrations, idempotency, rollback on failure.
 * All tests use :memory: database via beforeEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  MigrationRunner,
  type Migration,
} from '../../src/db/migrations/index.js';
import { MIGRATIONS_TABLE_DDL } from '../../src/db/schema.js';

// ---------------------------------------------------------------------------
// Test Setup -- bare :memory: database with only _migrations table
// ---------------------------------------------------------------------------

let rawDb: Database.Database;
let runner: MigrationRunner;

beforeEach(() => {
  rawDb = new Database(':memory:');
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');

  // Create the _migrations table (same as database.ts constructor)
  for (const stmt of MIGRATIONS_TABLE_DDL) {
    rawDb.exec(stmt);
  }

  runner = new MigrationRunner(rawDb);
});

afterEach(() => {
  try {
    rawDb.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Helper: create a test migration that creates a simple table
// ---------------------------------------------------------------------------

function createTestMigration(
  name: string,
  tableName: string,
  phase = 99,
): Migration {
  return {
    name,
    phase,
    up: (db: Database.Database) => {
      db.exec(
        `CREATE TABLE ${tableName} (id TEXT PRIMARY KEY, value TEXT)`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// #32: MigrationRunner applies pending test migration
// ---------------------------------------------------------------------------

describe('MigrationRunner', () => {
  it('#32 MigrationRunner applies pending test migration', () => {
    const migration = createTestMigration(
      'test_create_widgets',
      'widgets',
    );
    runner.registerMigrations([migration]);
    runner.applyPending();

    // Verify table was created
    const row = rawDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get('widgets') as { name: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.name).toBe('widgets');
  });

  // -------------------------------------------------------------------------
  // #33: Already-applied migrations are skipped
  // -------------------------------------------------------------------------

  it('#33 Already-applied migrations are skipped', () => {
    const migration = createTestMigration(
      'test_create_gadgets',
      'gadgets',
    );
    runner.registerMigrations([migration]);

    // Apply once
    runner.applyPending();

    // Apply again -- should NOT throw (table already exists would throw
    // if the migration ran CREATE TABLE without IF NOT EXISTS)
    expect(() => runner.applyPending()).not.toThrow();

    // Verify only 1 record in _migrations
    const rows = rawDb
      .prepare('SELECT * FROM _migrations WHERE name = ?')
      .all('test_create_gadgets') as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // #34: Applied migrations are recorded in _migrations table
  // -------------------------------------------------------------------------

  it('#34 Applied migrations are recorded in _migrations table', () => {
    const m1 = createTestMigration('test_alpha', 'alpha_table', 1);
    const m2 = createTestMigration('test_beta', 'beta_table', 2);

    runner.registerMigrations([m1, m2]);
    runner.applyPending();

    const rows = rawDb
      .prepare('SELECT name, phase FROM _migrations ORDER BY id')
      .all() as Array<{ name: string; phase: number }>;

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('test_alpha');
    expect(rows[0].phase).toBe(1);
    expect(rows[1].name).toBe('test_beta');
    expect(rows[1].phase).toBe(2);
  });

  // -------------------------------------------------------------------------
  // #35: Failed migration triggers rollback
  // -------------------------------------------------------------------------

  it('#35 Failed migration triggers rollback', () => {
    const failingMigration: Migration = {
      name: 'test_failing_migration',
      phase: 99,
      up: (db: Database.Database) => {
        // Create a table, then throw -- the table creation should be rolled back
        db.exec(
          'CREATE TABLE doomed_table (id TEXT PRIMARY KEY)',
        );
        throw new Error('Intentional test failure');
      },
    };

    runner.registerMigrations([failingMigration]);

    expect(() => runner.applyPending()).toThrow('Intentional test failure');

    // Table should NOT exist because rollback undid the CREATE
    const row = rawDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get('doomed_table');

    expect(row).toBeUndefined();

    // Migration should NOT be recorded
    const migRow = rawDb
      .prepare('SELECT * FROM _migrations WHERE name = ?')
      .get('test_failing_migration');

    expect(migRow).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // #36: getApplied() returns list of applied migration names
  // -------------------------------------------------------------------------

  it('#36 getApplied() returns list of applied migration names', () => {
    // Initially empty
    expect(runner.getApplied()).toEqual([]);

    const m1 = createTestMigration('test_first', 'first_table', 1);
    const m2 = createTestMigration('test_second', 'second_table', 2);

    runner.registerMigrations([m1, m2]);
    runner.applyPending();

    const applied = runner.getApplied();
    expect(applied).toEqual(['test_first', 'test_second']);
  });

  // -------------------------------------------------------------------------
  // Coverage: applyPending() with no registered migrations does nothing
  // -------------------------------------------------------------------------

  it('applyPending() with no migrations registered does not error', () => {
    // No migrations registered -- applyPending should complete silently
    expect(() => runner.applyPending()).not.toThrow();
    expect(runner.getApplied()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Coverage: registerMigrations sorts by phase then name (localeCompare path)
  // -------------------------------------------------------------------------

  it('registerMigrations sorts by phase then name alphabetically', () => {
    // Same phase, different names -- tests the localeCompare branch
    const mZ = createTestMigration('z_migration', 'z_table', 1);
    const mA = createTestMigration('a_migration', 'a_table', 1);
    const mM = createTestMigration('m_migration', 'm_table', 1);

    // Register in non-alphabetical order
    runner.registerMigrations([mZ, mA, mM]);
    runner.applyPending();

    // Should be applied in alphabetical order within the same phase
    const applied = runner.getApplied();
    expect(applied).toEqual(['a_migration', 'm_migration', 'z_migration']);
  });

  // -------------------------------------------------------------------------
  // H-28: rollback() tests
  // -------------------------------------------------------------------------

  describe('rollback', () => {
    it('rollback() rolls back the most recent migration', () => {
      const m1: Migration = {
        name: 'rollback_test_1',
        phase: 1,
        up: (db) => db.exec('CREATE TABLE rollback_t1 (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS rollback_t1'),
      };
      runner.registerMigrations([m1]);
      runner.applyPending();

      expect(runner.getApplied()).toContain('rollback_test_1');

      const rolledBack = runner.rollback();
      expect(rolledBack).toBe('rollback_test_1');
      expect(runner.getApplied()).not.toContain('rollback_test_1');

      // Table should be dropped
      const row = rawDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_t1'")
        .get();
      expect(row).toBeUndefined();
    });

    it('rollback() returns null when no migrations applied', () => {
      const result = runner.rollback();
      expect(result).toBeNull();
    });

    it('rollback() returns null when migration has no down()', () => {
      const m1: Migration = {
        name: 'no_down_test',
        phase: 1,
        up: (db) => db.exec('CREATE TABLE no_down_t (id TEXT PRIMARY KEY)'),
        // No down method
      };
      runner.registerMigrations([m1]);
      runner.applyPending();

      const result = runner.rollback();
      expect(result).toBeNull();
      // Migration should still be applied
      expect(runner.getApplied()).toContain('no_down_test');
    });

    it('rollback() only rolls back one migration at a time', () => {
      const m1: Migration = {
        name: 'multi_rb_1',
        phase: 1,
        up: (db) => db.exec('CREATE TABLE multi_t1 (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS multi_t1'),
      };
      const m2: Migration = {
        name: 'multi_rb_2',
        phase: 2,
        up: (db) => db.exec('CREATE TABLE multi_t2 (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS multi_t2'),
      };
      runner.registerMigrations([m1, m2]);
      runner.applyPending();

      expect(runner.getApplied()).toEqual(['multi_rb_1', 'multi_rb_2']);

      runner.rollback();
      expect(runner.getApplied()).toEqual(['multi_rb_1']);

      runner.rollback();
      expect(runner.getApplied()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // H-28: rollbackPhase() tests
  // -------------------------------------------------------------------------

  describe('rollbackPhase', () => {
    it('rolls back all migrations for a specific phase', () => {
      const m1: Migration = {
        name: 'phase_rb_1a',
        phase: 5,
        up: (db) => db.exec('CREATE TABLE prb_1a (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS prb_1a'),
      };
      const m2: Migration = {
        name: 'phase_rb_1b',
        phase: 5,
        up: (db) => db.exec('CREATE TABLE prb_1b (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS prb_1b'),
      };
      const m3: Migration = {
        name: 'phase_rb_other',
        phase: 6,
        up: (db) => db.exec('CREATE TABLE prb_other (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS prb_other'),
      };

      runner.registerMigrations([m1, m2, m3]);
      runner.applyPending();
      expect(runner.getApplied()).toHaveLength(3);

      const rolledBack = runner.rollbackPhase(5);
      expect(rolledBack).toHaveLength(2);
      expect(runner.getApplied()).toEqual(['phase_rb_other']);
    });

    it('returns empty array when no migrations for phase', () => {
      const rolledBack = runner.rollbackPhase(99);
      expect(rolledBack).toEqual([]);
    });

    it('skips migrations without down() in rollbackPhase', () => {
      const m1: Migration = {
        name: 'skip_down_1',
        phase: 7,
        up: (db) => db.exec('CREATE TABLE skip_d1 (id TEXT PRIMARY KEY)'),
        // No down
      };
      const m2: Migration = {
        name: 'skip_down_2',
        phase: 7,
        up: (db) => db.exec('CREATE TABLE skip_d2 (id TEXT PRIMARY KEY)'),
        down: (db) => db.exec('DROP TABLE IF EXISTS skip_d2'),
      };

      runner.registerMigrations([m1, m2]);
      runner.applyPending();

      const rolledBack = runner.rollbackPhase(7);
      // Only m2 should be rolled back (m1 has no down)
      expect(rolledBack).toHaveLength(1);
      expect(rolledBack[0]).toBe('skip_down_2');
    });
  });
});
