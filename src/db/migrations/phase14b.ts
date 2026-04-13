// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 14b -- FK Constraints & CASCADE Migration
 *
 * H-26: Documents FK relationships for model_calls, cost_entries, agents.
 *       SQLite does not support ALTER TABLE ADD CONSTRAINT, and recreating
 *       these high-traffic tables would break existing data with synthetic
 *       task IDs (e.g., test harnesses, dry-run tasks). The FK relationship
 *       is documented here and enforced at the application layer via the
 *       Orchestrator's task lifecycle (all writes go through orchestrator.run()
 *       which creates the task row first).
 *
 *       FK relationships (application-enforced):
 *         - model_calls.task_id → tasks.id
 *         - cost_entries.task_id → tasks.id
 *         - agents.task_id → tasks.id (already in schema.ts DDL)
 *
 * M-25: Adds ON DELETE CASCADE for chat_messages → conversations via
 *       table recreation. This is safe because chat_messages always have
 *       a valid conversation_id (created in the same HTTP handler).
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

// ---------------------------------------------------------------------------
// H-26: Document FK relationships (application-layer enforcement)
// ---------------------------------------------------------------------------

const phase14bFkDocumentation: Migration = {
  name: 'phase14b_fk_documentation',
  phase: 14,
  up(_db: BetterSqlite3.Database): void {
    // H-26: This migration documents FK relationships that cannot be added
    // via ALTER TABLE in SQLite. The relationships are:
    //   - model_calls.task_id → tasks.id (nullable, app-enforced)
    //   - cost_entries.task_id → tasks.id (nullable, app-enforced)
    //   - agents.task_id → tasks.id (already enforced via REFERENCES in schema.ts)
    //   - chat_messages.conversation_id → conversations.id (enforced below)
    //
    // Application enforcement: The Orchestrator creates the task row in the
    // tasks table before spawning agents, recording model calls, or logging
    // cost entries. The CostTracker and ModelRouter receive the taskId from
    // the Orchestrator, guaranteeing referential integrity without DB-level FKs.
    //
    // No-op migration: exists only to document the decision in the migration log.
  },
};

// ---------------------------------------------------------------------------
// M-25: ON DELETE CASCADE for chat_messages → conversations
// ---------------------------------------------------------------------------

const phase14bChatMessagesCascade: Migration = {
  name: 'phase14b_chat_messages_cascade',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    const tableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_messages'")
      .get() as { sql: string } | undefined;

    if (!tableInfo || tableInfo.sql.includes('ON DELETE CASCADE')) {
      return; // Table doesn't exist yet or CASCADE already present
    }

    // Get current column list to handle optional columns added by phase14_z_chat_columns
    const cols = db.pragma('table_info(chat_messages)') as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    db.exec('PRAGMA foreign_keys = OFF');
    try {
      const colList = colNames.join(', ');
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages_new (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          parts TEXT NOT NULL,
          task_id TEXT,
          cost REAL,
          model TEXT,
          agent_id TEXT,
          status TEXT NOT NULL DEFAULT 'completed',
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          input_tokens INTEGER,
          output_tokens INTEGER,
          latency_ms INTEGER
        );
        INSERT OR IGNORE INTO chat_messages_new (${colList})
          SELECT ${colList} FROM chat_messages;
        DROP TABLE IF EXISTS chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages(timestamp);');
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  },
};

// H-28: Add down() for documentation migration (no-op)
const phase14bFkDocumentationWithDown = {
  ...phase14bFkDocumentation,
  down(_db: BetterSqlite3.Database): void {
    // No-op: documentation-only migration, nothing to roll back
  },
};

export const phase14bMigrations: readonly Migration[] = [
  phase14bFkDocumentationWithDown,
  phase14bChatMessagesCascade,
];
