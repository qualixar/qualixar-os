// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Context Entry Store
 *
 * CRUD operations for context_entries table.
 * Stores parsed + chunked document content associated with tasks.
 */

import { randomUUID } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextEntry {
  readonly id: string;
  readonly taskId: string | null;
  readonly filePath: string;
  readonly content: string;
  readonly format: string;
  readonly tokens: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly createdAt: string;
}

export type NewContextEntry = Omit<ContextEntry, 'id' | 'createdAt'>;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class ContextStore {
  private readonly _db: QosDatabase;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  add(entry: NewContextEntry): string {
    const id = randomUUID();
    this._db.insert('context_entries', {
      id,
      task_id: entry.taskId,
      file_path: entry.filePath,
      content: entry.content,
      format: entry.format,
      tokens: entry.tokens,
      chunk_index: entry.chunkIndex,
      total_chunks: entry.totalChunks,
    });
    return id;
  }

  list(taskId?: string): readonly ContextEntry[] {
    if (taskId) {
      return this._db.query<ContextEntry>(
        `SELECT id, task_id AS "taskId", file_path AS "filePath", content, format,
                tokens, chunk_index AS "chunkIndex", total_chunks AS "totalChunks",
                created_at AS "createdAt"
         FROM context_entries WHERE task_id = ? ORDER BY created_at`,
        [taskId],
      );
    }
    return this._db.query<ContextEntry>(
      `SELECT id, task_id AS "taskId", file_path AS "filePath", content, format,
              tokens, chunk_index AS "chunkIndex", total_chunks AS "totalChunks",
              created_at AS "createdAt"
       FROM context_entries ORDER BY created_at`,
    );
  }

  getTokenCount(taskId?: string): number {
    const sql = taskId
      ? 'SELECT COALESCE(SUM(tokens), 0) AS total FROM context_entries WHERE task_id = ?'
      : 'SELECT COALESCE(SUM(tokens), 0) AS total FROM context_entries';
    const params = taskId ? [taskId] : [];
    const row = this._db.get<{ total: number }>(sql, params);
    return row?.total ?? 0;
  }

  clear(taskId?: string): void {
    if (taskId) {
      this._db.db.prepare('DELETE FROM context_entries WHERE task_id = ?').run(taskId);
    } else {
      this._db.db.prepare('DELETE FROM context_entries').run();
    }
  }
}
