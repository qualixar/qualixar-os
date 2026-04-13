// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase M -- Marketplace Migrations
 * PA2-003: Create skill_packages table for marketplace skill persistence.
 *
 * HR-3: All prepared statements only -- no string interpolation in SQL.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

// ---------------------------------------------------------------------------
// Migration: skill_packages table
// ---------------------------------------------------------------------------

const phaseMSkillPackages: Migration = {
  name: 'phaseM_skill_packages',
  phase: 24, // Next sequential phase after 23 (phaseF)
  up(db: BetterSqlite3.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS skill_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT,
      description TEXT,
      category TEXT,
      author_name TEXT,
      license TEXT,
      tool_count INTEGER DEFAULT 0,
      manifest TEXT,
      status TEXT DEFAULT 'active',
      installed_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_skill_packages_name ON skill_packages(name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_skill_packages_status ON skill_packages(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_skill_packages_category ON skill_packages(category)');
  },
  down(db: BetterSqlite3.Database): void {
    db.exec('DROP INDEX IF EXISTS idx_skill_packages_category');
    db.exec('DROP INDEX IF EXISTS idx_skill_packages_status');
    db.exec('DROP INDEX IF EXISTS idx_skill_packages_name');
    db.exec('DROP TABLE IF EXISTS skill_packages');
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const phaseMMigrations: readonly Migration[] = [
  phaseMSkillPackages,
];
