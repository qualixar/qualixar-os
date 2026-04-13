// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Multi-Agent Migration
 * Creates team_designs and simulation_results tables.
 *
 * Source: REWRITE-SPEC Section 4 "Phase 4 -- Multi-Agent Migration"
 * LLD: phase4-multi-agent-lld.md Section 2.13
 */

import type { Migration } from './index.js';

export const phase4Migrations: readonly Migration[] = [
  {
    name: 'phase4_team_designs',
    phase: 4,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS team_designs (
          id TEXT PRIMARY KEY,
          task_type TEXT NOT NULL,
          topology TEXT NOT NULL,
          agents TEXT NOT NULL,
          performance_score REAL,
          avg_cost REAL,
          use_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_team_designs_task_type
          ON team_designs(task_type);
      `);
    },
  },
  {
    name: 'phase4_simulation_results',
    phase: 4,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS simulation_results (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          team_design_id TEXT,
          verdict TEXT NOT NULL,
          issues TEXT,
          cost_usd REAL,
          duration_ms INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_simulation_results_task_id
          ON simulation_results(task_id);
      `);
    },
  },
];
