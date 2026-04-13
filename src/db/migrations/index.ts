// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 -- Migration Runner
 * LLD Section 2.7
 *
 * Pre-registered array pattern (synchronous, ESM-safe). Bootstrap calls
 * registerMigrations() for each phase before applyPending(). No dynamic
 * import(). Each migration runs in a transaction for atomicity. On failure,
 * the transaction is rolled back and the error is rethrown.
 */

import type BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'MigrationRunner' });

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface Migration {
  /** Human-readable migration name (unique across all phases). */
  readonly name: string;
  /** Phase number this migration belongs to (for ordering). */
  readonly phase: number;
  /** Apply the migration. Receives the raw better-sqlite3 handle. */
  readonly up: (db: BetterSqlite3.Database) => void;
  /** H-28: Rollback the migration (optional). */
  readonly down?: (db: BetterSqlite3.Database) => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MigrationRunner {
  private readonly _db: BetterSqlite3.Database;
  private readonly _registeredMigrations: Migration[] = [];

  constructor(db: BetterSqlite3.Database) {
    this._db = db;
  }

  /**
   * Register migrations to be applied. Can be called multiple times
   * (once per phase). Migrations are sorted by explicit numeric phase
   * first, then lexicographically by name within the same phase.
   *
   * M-26: Sort order is deterministic -- numeric phase takes priority
   * over registration order, ensuring migrations execute correctly
   * regardless of the order registerMigrations() is called.
   */
  registerMigrations(migrations: readonly Migration[]): void {
    this._registeredMigrations.push(...migrations);
    this._registeredMigrations.sort(
      (a, b) => a.phase - b.phase || a.name.localeCompare(b.name),
    );
  }

  /**
   * Apply all pending migrations that have not yet been recorded in
   * the _migrations table. Each migration runs in its own transaction
   * for atomicity. On failure: rollback, log, rethrow.
   */
  applyPending(): void {
    const appliedSet = new Set(this.getApplied());

    for (const migration of this._registeredMigrations) {
      if (appliedSet.has(migration.name)) {
        continue;
      }

      try {
        this._db.exec('BEGIN');
        migration.up(this._db);
        this._db
          .prepare(
            'INSERT INTO _migrations (phase, name, applied_at) VALUES (?, ?, ?)',
          )
          .run(migration.phase, migration.name, new Date().toISOString());
        this._db.exec('COMMIT');
      } catch (err) {
        try {
          this._db.exec('ROLLBACK');
        } catch {
          // rollback may fail if transaction was already aborted
        }
        logger.error({ err, migration: migration.name, phase: migration.phase }, 'migration failed');
        throw err;
      }
    }
  }

  /**
   * Return the names of all already-applied migrations, ordered by id.
   */
  getApplied(): readonly string[] {
    const rows = this._db
      .prepare('SELECT name FROM _migrations ORDER BY id')
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /**
   * H-28: Rollback the most recently applied migration that has a down() method.
   * Rolls back one migration at a time for safety.
   *
   * @returns The name of the rolled-back migration, or null if nothing to rollback.
   */
  rollback(): string | null {
    const applied = this._db
      .prepare('SELECT name FROM _migrations ORDER BY id DESC LIMIT 1')
      .all() as Array<{ name: string }>;

    if (applied.length === 0) {
      return null;
    }

    const lastApplied = applied[0].name;
    const migration = this._registeredMigrations.find((m) => m.name === lastApplied);

    if (!migration) {
      logger.error({ migration: lastApplied }, 'migration not found in registered migrations');
      return null;
    }

    if (!migration.down) {
      logger.error({ migration: lastApplied }, 'migration has no down() method, cannot rollback');
      return null;
    }

    try {
      this._db.exec('BEGIN');
      migration.down(this._db);
      this._db
        .prepare('DELETE FROM _migrations WHERE name = ?')
        .run(lastApplied);
      this._db.exec('COMMIT');
      return lastApplied;
    } catch (err) {
      try {
        this._db.exec('ROLLBACK');
      } catch {
        // rollback may fail if transaction was already aborted
      }
      logger.error({ err, migration: lastApplied }, 'rollback failed');
      throw err;
    }
  }

  /**
   * H-28: Rollback all migrations for a specific phase.
   * Rolls back in reverse order (newest first).
   *
   * @returns Array of rolled-back migration names.
   */
  rollbackPhase(phase: number): readonly string[] {
    const applied = this._db
      .prepare('SELECT name FROM _migrations WHERE phase = ? ORDER BY id DESC')
      .all(phase) as Array<{ name: string }>;

    const rolledBack: string[] = [];
    for (const row of applied) {
      const migration = this._registeredMigrations.find((m) => m.name === row.name);
      if (!migration?.down) continue;

      try {
        this._db.exec('BEGIN');
        migration.down(this._db);
        this._db.prepare('DELETE FROM _migrations WHERE name = ?').run(row.name);
        this._db.exec('COMMIT');
        rolledBack.push(row.name);
      } catch (err) {
        try { this._db.exec('ROLLBACK'); } catch { /* ignore */ }
        logger.error({ err, migration: row.name }, 'phase rollback failed');
        throw err;
      }
    }
    return rolledBack;
  }
}
