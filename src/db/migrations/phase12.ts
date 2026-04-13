// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Context Entries Migration
 *
 * Creates context_entries table for storing parsed document chunks.
 * Source: Phase 12 Context Pipeline
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase12ContextEntries: Migration = {
  name: 'phase12_context_entries',
  phase: 12,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_entries (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        format TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        total_chunks INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_context_entries_task ON context_entries(task_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_context_entries_format ON context_entries(format);');
  },
};

export const phase12Migrations: readonly Migration[] = [phase12ContextEntries];
