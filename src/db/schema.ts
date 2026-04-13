// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 -- Database Schema DDL
 * LLD Section 2.5
 *
 * Pure constants: SQL DDL strings for all 8 initial tables, the _migrations
 * meta-table, and event indexes. Consumed by database.ts constructor via
 * db.exec() calls.
 *
 * Source of truth: REWRITE-SPEC Section 4 (character-for-character DDL).
 *
 * M-23: TABLE USAGE NOTE
 * Some tables created in later migrations (e.g., experiments, flow_definitions,
 * vector_entries, blueprints, prompt_library) may have limited or no query
 * activity yet. These tables are intentionally provisioned for future dashboard
 * and orchestration features (Lab, Flow Builder, RAG, Prompt Library). They are
 * NOT dead tables — they are forward-provisioned schema for features in active
 * development (Phases 14-16).
 */

// ---------------------------------------------------------------------------
// Initial 8 domain tables (Phase 0)
// ---------------------------------------------------------------------------

export const INITIAL_TABLES_DDL: readonly string[] = [
  // Element 0: tasks
  `CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL,
  result TEXT,
  cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,

  // Element 1: agents
  `CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  output TEXT,
  cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL
)`,

  // Element 2: judge_results
  `CREATE TABLE IF NOT EXISTS judge_results (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  round INTEGER NOT NULL,
  judge_model TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score REAL,
  issues TEXT,
  feedback TEXT,
  created_at TEXT NOT NULL
)`,

  // Element 3: model_calls
  `CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
)`,

  // Element 4: cost_entries
  `CREATE TABLE IF NOT EXISTS cost_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  model TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,

  // Element 5: forge_designs
  `CREATE TABLE IF NOT EXISTS forge_designs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  team_config TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score REAL,
  avg_cost REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,

  // Element 6: memory_entries
  `CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  trust_score REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  team_id TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
)`,

  // Element 7: events
  `CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  task_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
] as const;

// ---------------------------------------------------------------------------
// _migrations meta-table (2 statements: CREATE TABLE + UNIQUE INDEX)
// ---------------------------------------------------------------------------

export const MIGRATIONS_TABLE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase INTEGER NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_migrations_name ON _migrations(name)`,
] as const;

// ---------------------------------------------------------------------------
// Event indexes (2 CREATE INDEX statements)
// ---------------------------------------------------------------------------

export const ALL_INDEXES_DDL: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,
  `CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id)`,
  // Performance indexes (H-27)
  `CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_task ON agents(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_model_calls_task ON model_calls(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_entries_task ON cost_entries(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_layer ON memory_entries(layer)`,
] as const;
