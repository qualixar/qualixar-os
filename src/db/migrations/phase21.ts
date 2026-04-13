// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Visual Workflow Builder Migrations
 * Tables: workflows, workflow_runs
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase21Workflows: Migration = {
  name: 'phase21_workflows',
  phase: 21,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        nodes_json TEXT NOT NULL DEFAULT '[]',
        edges_json TEXT NOT NULL DEFAULT '[]',
        viewport_json TEXT NOT NULL DEFAULT '{"offsetX":0,"offsetY":0,"zoom":1}',
        tags TEXT NOT NULL DEFAULT '[]',
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        author_role TEXT NOT NULL DEFAULT 'developer',
        last_run_at TEXT,
        last_run_status TEXT CHECK (last_run_status IN ('completed', 'failed') OR last_run_status IS NULL),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);');
  },
};

const phase21WorkflowRuns: Migration = {
  name: 'phase21_workflow_runs',
  phase: 21,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
        prompt TEXT NOT NULL DEFAULT '',
        node_states_json TEXT NOT NULL DEFAULT '{}',
        total_cost_usd REAL NOT NULL DEFAULT 0,
        final_output TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);');
  },
};

export const phase21Migrations: readonly Migration[] = [
  phase21Workflows,
  phase21WorkflowRuns,
];
