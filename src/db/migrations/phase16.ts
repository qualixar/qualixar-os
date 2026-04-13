// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 16 -- Dashboard Vectors, Blueprints, Brain Migration
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase16Vectors: Migration = {
  name: 'phase16_vectors',
  phase: 16,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vector_entries (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        source TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_vector_entries_source ON vector_entries(source);');
  },
};

const phase16Blueprints: Migration = {
  name: 'phase16_blueprints',
  phase: 16,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS blueprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('agent', 'topology', 'workflow', 'pipeline')),
        description TEXT NOT NULL DEFAULT '',
        topology TEXT,
        agent_count INTEGER,
        tags TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

const phase16Prompts: Migration = {
  name: 'phase16_prompts',
  phase: 16,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_library (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('system', 'task', 'few-shot', 'judge')),
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        usage_count INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

export const phase16Migrations: readonly Migration[] = [
  phase16Vectors,
  phase16Blueprints,
  phase16Prompts,
];
