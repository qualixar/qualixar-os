// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Marketplace Ecosystem Migrations
 * Tables: plugins, plugin_configs
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

const phase20Plugins: Migration = {
  name: 'phase20_plugins',
  phase: 20,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        version         TEXT NOT NULL,
        author          TEXT NOT NULL,
        description     TEXT NOT NULL,
        tier            TEXT NOT NULL CHECK(tier IN ('verified', 'community', 'local')),
        types           TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        manifest_json   TEXT NOT NULL,
        install_path    TEXT NOT NULL,
        installed_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);');
  },
};

const phase20PluginConfigs: Migration = {
  name: 'phase20_plugin_configs',
  phase: 20,
  up(db: BetterSqlite3.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_configs (
        id          TEXT PRIMARY KEY,
        plugin_id   TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plugin_id, key)
      );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_plugin_configs_plugin ON plugin_configs(plugin_id);');
  },
};

export const phase20Migrations: readonly Migration[] = [
  phase20Plugins,
  phase20PluginConfigs,
];
