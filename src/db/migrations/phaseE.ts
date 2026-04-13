// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase E -- Embedding Cache Migration
 *
 * Adds an `embedding` BLOB column to `memory_entries` so that vector
 * representations can be cached alongside content. This avoids re-computing
 * embeddings on every semantic recall query.
 *
 * The column is nullable -- existing rows get NULL and continue to use
 * FTS5-only recall. New rows created when an EmbeddingProvider is available
 * will populate this column automatically.
 *
 * HR-3: All prepared statements only -- no string interpolation in SQL.
 */

import type BetterSqlite3 from 'better-sqlite3';
import type { Migration } from './index.js';

// ---------------------------------------------------------------------------
// Migration: memory_entries.embedding
// ---------------------------------------------------------------------------

const phaseEEmbeddingColumn: Migration = {
  name: 'phaseE_embedding_column',
  phase: 25, // Next sequential phase after 24 (phaseM)
  up(db: BetterSqlite3.Database): void {
    // Check if column already exists (safe for re-runs)
    const columns = db.pragma('table_info(memory_entries)') as readonly {
      readonly name: string;
    }[];
    const hasEmbedding = columns.some((c) => c.name === 'embedding');
    if (!hasEmbedding) {
      db.exec('ALTER TABLE memory_entries ADD COLUMN embedding BLOB');
    }
  },
  down(db: BetterSqlite3.Database): void {
    // SQLite does not support DROP COLUMN before 3.35.0.
    // For safety, we create a new table without the column and swap.
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries_backup AS
        SELECT id, layer, content, metadata, trust_score, access_count,
               team_id, source, created_at, updated_at, expires_at
        FROM memory_entries;
      DROP TABLE memory_entries;
      ALTER TABLE memory_entries_backup RENAME TO memory_entries;
    `);
  },
};

export const phaseEMigrations: readonly Migration[] = [phaseEEmbeddingColumn];
