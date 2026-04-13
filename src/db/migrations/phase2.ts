// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Security Migration
 * Creates security_audit_log and security_policies tables.
 * Source: REWRITE-SPEC Section 4 "Phase 2 -- Security Migration"
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase2SecurityAuditLog: Migration = {
  name: 'phase2_security_audit_log',
  phase: 2,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        details TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_event_type ON security_audit_log(event_type);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_severity ON security_audit_log(severity);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created_at ON security_audit_log(created_at);');
  },
};

const phase2SecurityPolicies: Migration = {
  name: 'phase2_security_policies',
  phase: 2,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        rules TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};

export const phase2Migrations: readonly Migration[] = [
  phase2SecurityAuditLog,
  phase2SecurityPolicies,
];
