// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Command Log Migration
 *
 * Creates command_log table for command dispatch audit trail.
 * Source: Phase 10 LLD Section 2.17
 *
 * IMPLEMENTATION NOTES:
 * - Add 'command_log' to ALLOWED_TABLES in database.ts
 * - Register phase10Migrations in runMigrations()
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase10CommandLog: Migration = {
  name: 'phase10_command_log',
  phase: 10,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS command_log (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT,
        success INTEGER NOT NULL DEFAULT 1,
        transport TEXT NOT NULL,
        duration_ms INTEGER,
        error TEXT,
        task_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_command_log_cmd ON command_log(command);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_command_log_transport ON command_log(transport);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_command_log_created ON command_log(created_at);');
  },
  down(db: BetterSqlite3.Database): void {
    db.exec('DROP TABLE IF EXISTS command_log');
  },
};

export const phase10Migrations: readonly Migration[] = [phase10CommandLog];
