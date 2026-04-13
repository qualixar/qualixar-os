// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 15 -- Dashboard Connectors, Logs, Gate, Datasets Migration
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase15Connectors: Migration = {
  name: 'phase15_connectors',
  phase: 15,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('mcp', 'api', 'webhook')),
        status TEXT NOT NULL DEFAULT 'disconnected',
        url TEXT,
        tool_count INTEGER NOT NULL DEFAULT 0,
        config TEXT,
        last_seen TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

const phase15StructuredLogs: Migration = {
  name: 'phase15_structured_logs',
  phase: 15,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS structured_logs (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        task_id TEXT,
        agent_id TEXT,
        metadata TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_structured_logs_level ON structured_logs(level);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_structured_logs_ts ON structured_logs(timestamp);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_structured_logs_source ON structured_logs(source);');
  },
};

const phase15Reviews: Migration = {
  name: 'phase15_reviews',
  phase: 15,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        reviewer TEXT,
        feedback TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_priority ON reviews(priority);');
  },
};

const phase15Datasets: Migration = {
  name: 'phase15_datasets',
  phase: 15,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'jsonl')),
        row_count INTEGER NOT NULL DEFAULT 0,
        column_count INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

export const phase15Migrations: readonly Migration[] = [
  phase15Connectors,
  phase15StructuredLogs,
  phase15Reviews,
  phase15Datasets,
];
