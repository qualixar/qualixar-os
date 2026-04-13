// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 13 -- Autonomous Mode Migration
 *
 * Creates budget_alerts and session_state tables.
 * Source: Phase 13 Autonomous Mode Polish
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase13BudgetAlerts: Migration = {
  name: 'phase13_budget_alerts',
  phase: 13,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS budget_alerts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        budget_usd REAL NOT NULL,
        spent_usd REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_budget_alerts_task ON budget_alerts(task_id);');
  },
};

const phase13SessionState: Migration = {
  name: 'phase13_session_state',
  phase: 13,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        active_tasks TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_checkpoint TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_session_state_session ON session_state(session_id);');
  },
};

export const phase13Migrations: readonly Migration[] = [
  phase13BudgetAlerts,
  phase13SessionState,
];
