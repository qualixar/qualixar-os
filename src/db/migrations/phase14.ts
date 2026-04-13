// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 14 -- Dashboard Expansion Migration
 *
 * Creates tables for Chat, Lab, and Flow domains.
 * Traces use existing OTEL data — no new tables needed.
 * Source: Phase 14 LLD Section 5
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase14Conversations: Migration = {
  name: 'phase14_conversations',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        status TEXT NOT NULL DEFAULT 'active',
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

const phase14ChatMessages: Migration = {
  name: 'phase14_chat_messages',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        parts TEXT NOT NULL,
        task_id TEXT,
        cost REAL,
        model TEXT,
        agent_id TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_ts ON chat_messages(timestamp);');
  },
};

const phase14Experiments: Migration = {
  name: 'phase14_experiments',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        task_prompt TEXT NOT NULL,
        variants TEXT NOT NULL,
        results TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

const phase14FlowDefinitions: Migration = {
  name: 'phase14_flow_definitions',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS flow_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        topology TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

const phase14ChatColumns: Migration = {
  name: 'phase14_z_chat_columns',
  phase: 14,
  up(db: BetterSqlite3.Database): void {
    // Add missing columns to conversations for thread cloning and model tracking
    const convCols = db.pragma('table_info(conversations)') as Array<{ name: string }>;
    const convColNames = new Set(convCols.map((c) => c.name));
    if (!convColNames.has('parent_id')) {
      db.exec('ALTER TABLE conversations ADD COLUMN parent_id TEXT');
    }
    if (!convColNames.has('model')) {
      db.exec('ALTER TABLE conversations ADD COLUMN model TEXT');
    }
    if (!convColNames.has('topology')) {
      db.exec('ALTER TABLE conversations ADD COLUMN topology TEXT');
    }

    // Add missing columns to chat_messages for token/latency tracking
    const msgCols = db.pragma('table_info(chat_messages)') as Array<{ name: string }>;
    const msgColNames = new Set(msgCols.map((c) => c.name));
    if (!msgColNames.has('input_tokens')) {
      db.exec('ALTER TABLE chat_messages ADD COLUMN input_tokens INTEGER');
    }
    if (!msgColNames.has('output_tokens')) {
      db.exec('ALTER TABLE chat_messages ADD COLUMN output_tokens INTEGER');
    }
    if (!msgColNames.has('latency_ms')) {
      db.exec('ALTER TABLE chat_messages ADD COLUMN latency_ms INTEGER');
    }
  },
};

export const phase14Migrations: readonly Migration[] = [
  phase14Conversations,
  phase14ChatMessages,
  phase14Experiments,
  phase14FlowDefinitions,
  phase14ChatColumns,
];
