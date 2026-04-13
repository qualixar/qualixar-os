// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 -- Database Wrapper
 * LLD Section 2.6
 *
 * Wraps better-sqlite3 with WAL mode, FK enforcement, typed query helpers,
 * and an ALLOWED_TABLES whitelist for insert/update safety. The constructor
 * applies all Phase 0 DDL (migrations table, 8 domain tables, indexes).
 *
 * Hard Rule #3: prepared statements ONLY.
 * Hard Rule #4: WAL mode enabled.
 * Hard Rule #8: tests use :memory:.
 */

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  INITIAL_TABLES_DDL,
  MIGRATIONS_TABLE_DDL,
  ALL_INDEXES_DDL,
} from './schema.js';
import { MigrationRunner } from './migrations/index.js';
import { phase2Migrations } from './migrations/phase2.js';
import { phase3Migrations } from './migrations/phase3.js';
import { phase4Migrations } from './migrations/phase4.js';
import { phase5Migrations } from './migrations/phase5.js';
import { phase8Migrations } from './migrations/phase8.js';
import { phase10Migrations } from './migrations/phase10.js';
import { phase10bMigrations } from './migrations/phase10b.js';
import { phase12Migrations } from './migrations/phase12.js';
import { phase13Migrations } from './migrations/phase13.js';
import { phase14Migrations } from './migrations/phase14.js';
import { phase14bMigrations } from './migrations/phase14b.js';
import { phase15Migrations } from './migrations/phase15.js';
import { phase16Migrations } from './migrations/phase16.js';
import { phase18Migrations } from './migrations/phase18.js';
import { phase20Migrations } from './migrations/phase20.js';
import { phase21Migrations } from './migrations/phase21.js';
import { phase22Migrations } from './migrations/phase22.js';
import { phaseFMigrations } from './migrations/phaseF.js';
import { phaseMMigrations } from './migrations/phaseM.js';
import { phaseEMigrations } from './migrations/phaseE.js';

// ---------------------------------------------------------------------------
// ALLOWED_TABLES whitelist -- insert() and update() MUST validate against this
// ---------------------------------------------------------------------------

const ALLOWED_TABLES: ReadonlySet<string> = new Set([
  'tasks',
  'agents',
  'judge_results',
  'model_calls',
  'cost_entries',
  'forge_designs',
  'memory_entries',
  'events',
  '_migrations',
  // Phase 2 migration tables
  'security_audit_log',
  'security_policies',
  // Phase 3 migration tables
  'strategy_memory',
  'rl_training_log',
  'verified_facts',
  'judge_profiles',
  'drift_hashes',
  // Phase 4 migration tables
  'team_designs',
  'simulation_results',
  // Phase 5 migration tables
  'belief_nodes',
  'belief_edges',
  // Phase 8 migration tables
  'imported_agents',
  'a2a_agents',
  // Phase 10b migration tables
  'agent_transports',
  'protocol_metrics',
  // Phase 12 migration tables
  'context_entries',
  // Phase 13 migration tables
  'budget_alerts',
  'session_state',
  // Phase 14 migration tables
  'conversations',
  'chat_messages',
  'experiments',
  'flow_definitions',
  // Phase 15 migration tables
  'connectors',
  'structured_logs',
  'reviews',
  'datasets',
  // Phase 16 migration tables
  'vector_entries',
  'blueprints',
  'prompt_library',
  // Phase 10 migration tables
  'command_log',
  // Phase 18 migration tables
  'credentials',
  'deployments',
  'install_meta',
  // Phase 20 migration tables
  'plugins',
  'plugin_configs',
  // Phase 21 migration tables
  'workflows',
  'workflow_runs',
  // Phase 22 migration tables
  'credentials_encrypted',
  'users',
  'audit_log',
  'sso_sessions',
  // Phase M (marketplace) migration tables
  'skill_packages',
]);

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface QosDatabase {
  /** The underlying better-sqlite3 handle (exposed for migration runner). */
  readonly db: BetterSqlite3.Database;

  /** Apply pending migrations via MigrationRunner. */
  runMigrations(): void;

  /** Insert a row into an allowed table using prepared statements. */
  insert(table: string, row: Record<string, unknown>): void;

  /** Update rows in an allowed table using prepared statements. */
  update(
    table: string,
    set: Record<string, unknown>,
    where: Record<string, unknown>,
  ): void;

  /** Run a SELECT query, returning all matching rows. */
  query<T>(sql: string, params?: unknown[]): T[];

  /** Run a SELECT query, returning the first matching row or undefined. */
  get<T>(sql: string, params?: unknown[]): T | undefined;

  /** Close the database connection. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Column name validation (C-17: prevent SQL injection via column names)
// ---------------------------------------------------------------------------

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateColumnNames(keys: readonly string[]): void {
  for (const key of keys) {
    if (!COLUMN_RE.test(key)) {
      throw new Error(`Invalid column name: ${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class QosDatabaseImpl implements QosDatabase {
  public readonly db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    // 1. Open database
    this.db = new Database(dbPath);

    // 2. PRAGMA journal_mode = WAL
    this.db.pragma('journal_mode = WAL');

    // 3. PRAGMA foreign_keys = ON
    this.db.pragma('foreign_keys = ON');

    // 4. PRAGMA busy_timeout = 5000 (L-20: retry logic for concurrent access)
    this.db.pragma('busy_timeout = 5000');

    // L-19: Schema version tracking table
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // Initialize or update schema version
    this.db.exec(`INSERT OR REPLACE INTO schema_version (id, version, updated_at) VALUES (1, '2.0.0', datetime('now'))`);

    // M-04: Use incremental auto_vacuum instead of full VACUUM on startup.
    // Full VACUUM blocked for minutes on large DBs. Incremental reclaims
    // space gradually. Run full VACUUM manually via maintenance endpoint if needed.
    this.db.pragma('auto_vacuum = INCREMENTAL');

    // 5. Create _migrations table + unique index (2 statements)
    for (const stmt of MIGRATIONS_TABLE_DDL) {
      this.db.exec(stmt);
    }

    // 6. Create 8 domain tables
    for (const stmt of INITIAL_TABLES_DDL) {
      this.db.exec(stmt);
    }

    // 7. Create event indexes
    for (const stmt of ALL_INDEXES_DDL) {
      this.db.exec(stmt);
    }
  }

  runMigrations(): void {
    const runner = new MigrationRunner(this.db);
    runner.registerMigrations(phase2Migrations);
    runner.registerMigrations(phase3Migrations);
    runner.registerMigrations(phase4Migrations);
    runner.registerMigrations(phase5Migrations);
    runner.registerMigrations(phase8Migrations);
    runner.registerMigrations(phase10Migrations);
    runner.registerMigrations(phase10bMigrations);
    runner.registerMigrations(phase12Migrations);
    runner.registerMigrations(phase13Migrations);
    runner.registerMigrations(phase14Migrations);
    runner.registerMigrations(phase14bMigrations);
    runner.registerMigrations(phase15Migrations);
    runner.registerMigrations(phase16Migrations);
    runner.registerMigrations(phase18Migrations);
    runner.registerMigrations(phase20Migrations);
    runner.registerMigrations(phase21Migrations);
    runner.registerMigrations(phase22Migrations);
    runner.registerMigrations(phaseFMigrations);
    runner.registerMigrations(phaseMMigrations);
    runner.registerMigrations(phaseEMigrations);
    runner.applyPending();
  }

  insert(table: string, row: Record<string, unknown>): void {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Table "${table}" is not in the allowed tables whitelist`);
    }

    const keys = Object.keys(row);
    if (keys.length === 0) {
      throw new Error('Cannot insert an empty row');
    }

    validateColumnNames(keys);

    const columns = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => row[k]);

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);
  }

  update(
    table: string,
    set: Record<string, unknown>,
    where: Record<string, unknown>,
  ): void {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Table "${table}" is not in the allowed tables whitelist`);
    }

    const setKeys = Object.keys(set);
    const whereKeys = Object.keys(where);

    if (setKeys.length === 0) {
      throw new Error('Cannot update with empty set clause');
    }
    if (whereKeys.length === 0) {
      throw new Error('Cannot update without a where clause');
    }

    validateColumnNames([...setKeys, ...whereKeys]);

    const setClause = setKeys.map((k) => `${k} = ?`).join(', ');
    const whereClause = whereKeys.map((k) => `${k} = ?`).join(' AND ');
    const params = [
      ...setKeys.map((k) => set[k]),
      ...whereKeys.map((k) => where[k]),
    ];

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    this.db.prepare(sql).run(...params);
  }

  query<T>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params ?? [])) as T[];
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params ?? [])) as T | undefined;
  }

  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new QosDatabase instance.
 * @param dbPath - File path or ':memory:' for in-memory database.
 */
export function createDatabase(dbPath: string): QosDatabase {
  // Resolve ~ to actual home directory and ensure parent directory exists
  let resolvedPath = dbPath;
  if (resolvedPath.startsWith('~')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
    resolvedPath = resolvedPath.replace(/^~/, home);
  }
  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }
  return new QosDatabaseImpl(resolvedPath);
}
