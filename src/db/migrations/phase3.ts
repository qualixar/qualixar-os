// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Quality + RL Database Migrations
 * LLD Section 2.11 + REWRITE-SPEC Section 4 "Phase 3 -- Quality Migration"
 *
 * Creates 5 tables:
 *   1. strategy_memory -- Task type -> strategy effectiveness
 *   2. rl_training_log -- Audit trail for RL training signals
 *   3. drift_hashes -- Model/prompt/temp configuration hashes
 *   4. verified_facts -- Factual claims registry for anti-fabrication
 *   5. judge_profiles -- Custom judge evaluation profiles
 */

import type { Migration } from './index.js';

export const phase3Migrations: readonly Migration[] = [
  {
    name: 'phase3_001_strategy_memory',
    phase: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS strategy_memory (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        strategy TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        avg_reward REAL DEFAULT 0,
        confidence REAL DEFAULT 0.5,
        last_used TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_type ON strategy_memory(task_type, strategy)',
      );
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS strategy_memory');
    },
  },
  {
    name: 'phase3_002_rl_training_log',
    phase: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS rl_training_log (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state TEXT,
        created_at TEXT NOT NULL
      )`);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_rl_task ON rl_training_log(task_id)',
      );
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_rl_created ON rl_training_log(created_at)',
      );
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS rl_training_log');
    },
  },
  {
    name: 'phase3_003_drift_hashes',
    phase: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS drift_hashes (
        id TEXT PRIMARY KEY,
        context_key TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_drift_context ON drift_hashes(context_key)',
      );
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS drift_hashes');
    },
  },
  {
    name: 'phase3_004_verified_facts',
    phase: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS verified_facts (
        id TEXT PRIMARY KEY,
        task_context TEXT NOT NULL,
        claim_text TEXT NOT NULL,
        verified_text TEXT,
        status TEXT NOT NULL DEFAULT 'confirmed',
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_verified_task ON verified_facts(task_context)',
      );
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS verified_facts');
    },
  },
  {
    name: 'phase3_005_judge_profiles',
    phase: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS judge_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_judge_profile_name ON judge_profiles(name)',
      );
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS judge_profiles');
    },
  },
];
