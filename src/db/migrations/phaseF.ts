// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase F -- Long-Running Task Hardening Migrations
 * G-13: Add last_heartbeat column to tasks table for stale-task detection.
 *
 * HR-3: All prepared statements only -- no string interpolation in SQL.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

// ---------------------------------------------------------------------------
// Migration: tasks.last_heartbeat
// ---------------------------------------------------------------------------

const phaseFHeartbeat: Migration = {
  name: 'phaseF_heartbeat_column',
  phase: 23, // Next sequential phase after 22
  up(db: BetterSqlite3.Database): void {
    // Safe ALTER TABLE -- column may already exist if migration was partially applied
    try {
      db.exec('ALTER TABLE tasks ADD COLUMN last_heartbeat TEXT');
    } catch {
      // Column already exists -- idempotent
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat ON tasks(last_heartbeat)');
  },
  down(db: BetterSqlite3.Database): void {
    // SQLite doesn't support DROP COLUMN pre-3.35. Drop the index only.
    db.exec('DROP INDEX IF EXISTS idx_tasks_heartbeat');
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const phaseFMigrations: readonly Migration[] = [
  phaseFHeartbeat,
];
