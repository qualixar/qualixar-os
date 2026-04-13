// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Memory Migration
 *
 * Creates belief_nodes and belief_edges tables for the Causal Belief Graph.
 * The memory_entries table already exists from Phase 0 initial schema.
 *
 * Source: REWRITE-SPEC Section 4 "Phase 5 -- Memory Migration"
 */

import type { Migration } from './index.js';

export const phase5Migrations: readonly Migration[] = [
  {
    name: 'phase5_belief_tables',
    phase: 5,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS belief_nodes (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          confidence REAL DEFAULT 0.5,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          decay_rate REAL DEFAULT 0.01
        );

        CREATE TABLE IF NOT EXISTS belief_edges (
          id TEXT PRIMARY KEY,
          from_id TEXT NOT NULL REFERENCES belief_nodes(id),
          to_id TEXT NOT NULL REFERENCES belief_nodes(id),
          relation TEXT NOT NULL,
          strength REAL DEFAULT 0.5,
          evidence TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_belief_edges_from
          ON belief_edges(from_id);
        CREATE INDEX IF NOT EXISTS idx_belief_edges_to
          ON belief_edges(to_id);
      `);
    },
  },
];
