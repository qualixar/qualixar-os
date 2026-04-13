// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- Transport Tables Migration
 *
 * Creates agent_transports and protocol_metrics tables for the
 * protocol-unified transport layer.
 * Source: Phase 10b LLD Section 2.8
 *
 * IMPLEMENTATION NOTES:
 * - Add 'agent_transports' and 'protocol_metrics' to ALLOWED_TABLES in database.ts
 * - Register phase10bMigrations in runMigrations()
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase10bTransportTables: Migration = {
  name: 'phase10b_transport_tables',
  phase: 10,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_transports (
        agent_id TEXT PRIMARY KEY,
        location TEXT NOT NULL DEFAULT 'local',
        url TEXT,
        agent_card TEXT,
        transport TEXT NOT NULL DEFAULT 'local',
        avg_latency_ms REAL DEFAULT 0,
        last_seen TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS protocol_metrics (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        transport TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        task_type TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_protocol_metrics_agent
        ON protocol_metrics(agent_id);
      CREATE INDEX IF NOT EXISTS idx_protocol_metrics_transport
        ON protocol_metrics(transport);
      CREATE INDEX IF NOT EXISTS idx_protocol_metrics_created
        ON protocol_metrics(created_at);
    `);
  },
};

export const phase10bMigrations: readonly Migration[] = [phase10bTransportTables];
