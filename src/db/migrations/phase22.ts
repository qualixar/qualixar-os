// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Enterprise Hardening Migrations
 * Tables: credentials_encrypted, users, audit_log, sso_sessions
 *
 * HR-3: All prepared statements only -- no string interpolation in SQL.
 * HR-4: FK enforcement is on (WAL mode set at database.ts level).
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

// ---------------------------------------------------------------------------
// Migration: credentials_encrypted
// ---------------------------------------------------------------------------

const phase22CredentialsEncrypted: Migration = {
  name: 'phase22_credentials_encrypted',
  phase: 22,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credentials_encrypted (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL UNIQUE,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
        key_derivation TEXT NOT NULL DEFAULT 'pbkdf2-sha512',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_credentials_encrypted_provider ON credentials_encrypted(provider_id);',
    );
  },
};

// ---------------------------------------------------------------------------
// Migration: users
// ---------------------------------------------------------------------------

const phase22Users: Migration = {
  name: 'phase22_users',
  phase: 22,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'developer', 'viewer')),
        auth_source TEXT NOT NULL DEFAULT 'local' CHECK (auth_source IN ('local', 'sso')),
        sso_provider TEXT,
        api_token TEXT,
        password_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);',
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_users_api_token ON users(api_token);',
    );
    // Insert default admin user with a known token (must be rotated in production)
    db.exec(`
      INSERT OR IGNORE INTO users (id, username, role, auth_source, api_token, created_at)
      VALUES (
        'usr_admin_default',
        'admin',
        'admin',
        'local',
        'qos_admin_default_token_change_me',
        datetime('now')
      );
    `);
  },
};

// ---------------------------------------------------------------------------
// Migration: audit_log
// ---------------------------------------------------------------------------

const phase22AuditLog: Migration = {
  name: 'phase22_audit_log',
  phase: 22,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        role TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        resource_type TEXT,
        resource_id TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);',
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);',
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);',
    );
  },
};

// ---------------------------------------------------------------------------
// Migration: sso_sessions
// ---------------------------------------------------------------------------

const phase22SsoSessions: Migration = {
  name: 'phase22_sso_sessions',
  phase: 22,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sso_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        provider TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        state TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_sso_sessions_state ON sso_sessions(state);',
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_sso_sessions_user_id ON sso_sessions(user_id);',
    );
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const phase22Migrations: readonly Migration[] = [
  phase22CredentialsEncrypted,
  phase22Users,
  phase22AuditLog,
  phase22SsoSessions,
];
