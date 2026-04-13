// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8 -- Compatibility Migration
 *
 * Creates tables for imported agent specs and A2A agent registry.
 * Source of truth: REWRITE-SPEC Section 4 "Phase 8 -- Compatibility Migration".
 */

import type { Migration } from './index.js';

const phase8ImportedAgents: Migration = {
  name: 'phase8_imported_agents',
  phase: 8,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS imported_agents (
        id TEXT PRIMARY KEY,
        source_format TEXT NOT NULL,
        original_path TEXT NOT NULL,
        agent_spec TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS imported_agents');
  },
};

const phase8A2AAgents: Migration = {
  name: 'phase8_a2a_agents',
  phase: 8,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS a2a_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        agent_card TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        last_seen TEXT,
        created_at TEXT NOT NULL
      )
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS a2a_agents');
  },
};

const phase8Indexes: Migration = {
  name: 'phase8_indexes',
  phase: 8,
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_imported_agents_created ON imported_agents(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_a2a_agents_url ON a2a_agents(url)');
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_imported_agents_created');
    db.exec('DROP INDEX IF EXISTS idx_a2a_agents_url');
  },
};

export const phase8Migrations: readonly Migration[] = [
  phase8ImportedAgents,
  phase8A2AAgents,
  phase8Indexes,
];
