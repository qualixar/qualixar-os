// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Dashboard Command Center Migrations
 *
 * Tables: credentials, deployments, install_meta
 * LLD Section 6.1
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase18Credentials: Migration = {
  name: 'phase18_credentials',
  phase: 18,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        provider_name TEXT NOT NULL UNIQUE,
        storage_mode TEXT NOT NULL CHECK (storage_mode IN ('direct', 'env_ref')),
        encrypted_value TEXT NOT NULL,
        iv TEXT,
        auth_tag TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_provider ON credentials(provider_name);');
  },
};

const phase18Deployments: Migration = {
  name: 'phase18_deployments',
  phase: 18,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        blueprint_id TEXT NOT NULL REFERENCES blueprints(id) ON DELETE RESTRICT,
        blueprint_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'running', 'paused', 'completed', 'failed', 'cancelled')),
        trigger_type TEXT NOT NULL CHECK (trigger_type IN ('once', 'cron', 'event')),
        cron_expression TEXT,
        trigger_event TEXT,
        last_task_id TEXT,
        last_run_at TEXT,
        last_run_status TEXT CHECK (last_run_status IN ('success', 'failure') OR last_run_status IS NULL),
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_blueprint ON deployments(blueprint_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);');
  },
};

const phase18InstallId: Migration = {
  name: 'phase18_install_id',
  phase: 18,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS install_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

export const phase18Migrations: readonly Migration[] = [
  phase18Credentials,
  phase18Deployments,
  phase18InstallId,
];
