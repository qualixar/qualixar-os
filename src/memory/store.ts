// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Memory Store (4-Layer Memory Store)
 * LLD Section 2.2
 *
 * Layers: working (RAM Map), episodic/semantic/procedural (SQLite + FTS5).
 * Working memory entries never touch the DB. Persistent layers use FTS5
 * for full-text search with porter stemming.
 *
 * Immutability: content is NEVER updated in place. Use createVersion()
 * to create a new entry and set a superseded_by pointer on the original.
 *
 * M-24: FTS5 VIRTUAL TABLE CREATION NOTE
 * FTS5 virtual tables (memory_fts) are created at runtime in the MemoryStore
 * constructor rather than via the migration system. This is intentional:
 * FTS5 virtual tables cannot be created with IF NOT EXISTS in all SQLite
 * builds, and their lifecycle is tied to the memory_entries table. Creating
 * them at runtime ensures they exist regardless of migration state and can
 * be safely rebuilt if the FTS index becomes corrupted.
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { MemoryLayer } from '../types/common.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import type { MemorySource } from './trust-scorer.js';
import type { EmbeddingProvider } from './embeddings.js';
import { cosineSimilarity } from './embeddings.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  readonly id: string;
  readonly layer: MemoryLayer;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly trustScore: number;
  readonly accessCount: number;
  readonly teamId: string | null;
  readonly source: MemorySource;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string | null;
}

export interface MemoryInput {
  readonly content: string;
  readonly layer: MemoryLayer;
  readonly metadata?: Record<string, unknown>;
  readonly source: MemorySource;
  readonly teamId?: string;
}

export interface RecallOptions {
  readonly layers?: readonly MemoryLayer[];
  readonly maxResults?: number;
  readonly minTrustScore?: number;
  readonly teamId?: string | null;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class MemoryEntryNotFoundError extends Error {
  constructor(entryId: string) {
    super(`Memory entry not found: ${entryId}`);
    this.name = 'MemoryEntryNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MemoryStore {
  store(entry: MemoryInput): Promise<string>;
  recall(query: string, options?: RecallOptions): Promise<readonly MemoryEntry[]>;
  getById(id: string): MemoryEntry | undefined;
  createVersion(
    entryId: string,
    updates: { content?: string; metadata?: Record<string, unknown> },
  ): string;
  updateTrustScore(entryId: string, newScore: number): void;
  getByLayer(layer: MemoryLayer, limit?: number): readonly MemoryEntry[];
  getByTeamId(teamId: string): readonly MemoryEntry[];
  archive(entryId: string): void;
  getWorkingMemorySnapshot(): readonly MemoryEntry[];
  restoreWorkingMemory(entries: readonly MemoryEntry[]): void;
  cleanExpired(): number;
  getStats(): {
    totalEntries: number;
    byLayer: Record<string, number>;
    ramUsageMb: number;
  };
}

// ---------------------------------------------------------------------------
// DB Row Type
// ---------------------------------------------------------------------------

interface MemoryRow {
  readonly id: string;
  readonly layer: string;
  readonly content: string;
  readonly metadata: string | null;
  readonly trust_score: number;
  readonly access_count: number;
  readonly team_id: string | null;
  readonly source: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string | null;
  readonly embedding: Buffer | null;
  readonly rowid?: number;
}

// ---------------------------------------------------------------------------
// Embedding Serialization Helpers
// ---------------------------------------------------------------------------

/** Minimum FTS5 results before semantic fallback triggers. */
const SEMANTIC_FALLBACK_THRESHOLD = 3;

/** Maximum candidates to load for semantic ranking. */
const SEMANTIC_CANDIDATE_LIMIT = 100;

/** Serialize a float64 vector into a Buffer for BLOB storage. */
function serializeEmbedding(vec: readonly number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 8);
  for (let i = 0; i < vec.length; i++) {
    buf.writeDoubleBE(vec[i], i * 8);
  }
  return buf;
}

/** Deserialize a Buffer back into a float64 array. */
function deserializeEmbedding(buf: Buffer): readonly number[] {
  const count = buf.length / 8;
  const vec: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    vec[i] = buf.readDoubleBE(i * 8);
  }
  return vec;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MemoryStoreImpl implements MemoryStore {
  private readonly workingMemory: Map<string, MemoryEntry>;
  private readonly db: QosDatabase;
  private readonly eventBus: EventBus;
  private readonly maxEntries: number;
  private readonly embeddingProvider: EmbeddingProvider | null;

  constructor(
    db: QosDatabase,
    eventBus: EventBus,
    configManager?: ConfigManager,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.workingMemory = new Map();
    this.embeddingProvider = embeddingProvider ?? null;

    // H-02: Derive max entries from max_ram_mb (~1KB per entry)
    const DEFAULT_MAX_RAM_MB = 50;
    const ENTRIES_PER_MB = 1024;
    const maxRamMb = configManager ? configManager.getValue<number>('memory.max_ram_mb') : DEFAULT_MAX_RAM_MB;
    this.maxEntries = (maxRamMb ?? DEFAULT_MAX_RAM_MB) * ENTRIES_PER_MB;

    // Create standalone FTS5 virtual table
    this.db.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts
       USING fts5(content, tokenize='porter unicode61')`,
    );
  }

  async store(entry: MemoryInput): Promise<string> {
    const id = generateId();
    const timestamp = now();

    const memoryEntry: MemoryEntry = {
      id,
      layer: entry.layer,
      content: entry.content,
      metadata: entry.metadata ?? {},
      trustScore: 0.5,
      accessCount: 0,
      teamId: entry.teamId ?? null,
      source: entry.source,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: null,
    };

    if (entry.layer === 'working') {
      this.workingMemory.set(id, memoryEntry);
    } else {
      this._insertToDb(memoryEntry);
      this._insertToFts(id, entry.content);
      // Cache embedding for semantic recall (fire-and-forget, non-blocking)
      if (this.embeddingProvider?.isAvailable()) {
        this._cacheEmbedding(id, entry.content).catch(
          /* v8 ignore next 3 -- fire-and-forget; only fails if API is unreachable */
          () => { /* graceful degradation: embedding cache is best-effort */ },
        );
      }
    }

    // H-02: Enforce RAM limit by archiving oldest entries when threshold exceeded
    this._enforceEntryLimit();

    this.eventBus.emit({
      type: 'memory:stored',
      payload: { entryId: id, layer: entry.layer, source: entry.source },
      source: 'MemoryStore',
    });

    return id;
  }

  async recall(
    query: string,
    options?: RecallOptions,
  ): Promise<readonly MemoryEntry[]> {
    const layers = options?.layers ?? ['working', 'episodic', 'semantic', 'procedural'];
    const maxResults = options?.maxResults ?? 20;
    const minTrust = options?.minTrustScore ?? 0.0;
    const results: MemoryEntry[] = [];

    // Search working memory using word-level matching.
    // M-17: All query words must appear in the content (not just substring).
    // Lightweight improvement over substring without needing embeddings.
    if (layers.includes('working')) {
      const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
      for (const entry of this.workingMemory.values()) {
        if (options?.teamId !== undefined && entry.teamId !== options.teamId) {
          continue;
        }
        const contentLower = entry.content.toLowerCase();
        const allWordsMatch = queryWords.length > 0
          && queryWords.every((w) => contentLower.includes(w));
        if (allWordsMatch && entry.trustScore >= minTrust) {
          results.push(entry);
        }
      }
    }

    // Search persistent layers via FTS5
    const persistentLayers = layers.filter((l) => l !== 'working');
    if (persistentLayers.length > 0) {
      let ftsResults: MemoryEntry[] = [];
      try {
        ftsResults = this._searchFts(query, persistentLayers, minTrust, options?.teamId);
      } catch {
        // FTS5 query syntax error fallback: use LIKE
        ftsResults = this._searchLike(query, persistentLayers, minTrust, options?.teamId);
      }
      results.push(...ftsResults);

      // Semantic fallback: when FTS5 yields few results AND embeddings are available,
      // supplement with cosine-similarity ranked results from the embedding cache.
      if (
        ftsResults.length < SEMANTIC_FALLBACK_THRESHOLD
        && this.embeddingProvider?.isAvailable()
      ) {
        const semanticResults = await this._searchSemantic(
          query,
          persistentLayers,
          minTrust,
          options?.teamId,
          new Set(ftsResults.map((r) => r.id)),
        );
        results.push(...semanticResults);
      }
    }

    // Update access_count for all results
    for (const entry of results) {
      if (entry.layer === 'working') {
        const updated = { ...entry, accessCount: entry.accessCount + 1 };
        this.workingMemory.set(entry.id, updated);
      } else {
        this.db.db
          .prepare('UPDATE memory_entries SET access_count = access_count + 1 WHERE id = ?')
          .run(entry.id);
      }
    }

    // Sort by trustScore descending, truncate (immutable -- no mutation of results array)
    const sorted = [...results].sort((a, b) => b.trustScore - a.trustScore);
    return sorted.slice(0, maxResults);
  }

  getById(id: string): MemoryEntry | undefined {
    const working = this.workingMemory.get(id);
    if (working) return working;

    const row = this.db.get<MemoryRow>(
      'SELECT * FROM memory_entries WHERE id = ?',
      [id],
    );
    if (row) return this._parseRow(row);
    return undefined;
  }

  createVersion(
    entryId: string,
    updates: { content?: string; metadata?: Record<string, unknown> },
  ): string {
    const original = this.getById(entryId);
    if (!original) throw new MemoryEntryNotFoundError(entryId);

    const newId = generateId();
    const currentVersion = (original.metadata.version as number) ?? 1;
    const timestamp = now();

    const newEntry: MemoryEntry = {
      id: newId,
      layer: original.layer,
      content: updates.content ?? original.content,
      metadata: {
        ...original.metadata,
        ...updates.metadata,
        version_of: entryId,
        version: currentVersion + 1,
      },
      trustScore: original.trustScore,
      accessCount: 0,
      teamId: original.teamId,
      source: original.source,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: original.expiresAt,
    };

    // Store new version
    if (original.layer === 'working') {
      this.workingMemory.set(newId, newEntry);
    } else {
      this._insertToDb(newEntry);
      this._insertToFts(newId, newEntry.content);
    }

    // Update original with superseded_by pointer (metadata only)
    const updatedMeta = { ...original.metadata, superseded_by: newId };
    if (original.layer === 'working') {
      this.workingMemory.set(entryId, { ...original, metadata: updatedMeta });
    } else {
      this.db.db
        .prepare('UPDATE memory_entries SET metadata = ? WHERE id = ?')
        .run(JSON.stringify(updatedMeta), entryId);
    }

    return newId;
  }

  updateTrustScore(entryId: string, newScore: number): void {
    const clamped = Math.max(0.1, Math.min(1.0, newScore));

    const working = this.workingMemory.get(entryId);
    if (working) {
      this.workingMemory.set(entryId, { ...working, trustScore: clamped });
    } else {
      this.db.db
        .prepare('UPDATE memory_entries SET trust_score = ?, updated_at = ? WHERE id = ?')
        .run(clamped, now(), entryId);
    }

    this.eventBus.emit({
      type: 'memory:trust_updated',
      payload: { entryId, newScore: clamped },
      source: 'MemoryStore',
    });
  }

  getByLayer(layer: MemoryLayer, limit?: number): readonly MemoryEntry[] {
    if (layer === 'working') {
      return Array.from(this.workingMemory.values());
    }
    const rows = this.db.query<MemoryRow>(
      'SELECT * FROM memory_entries WHERE layer = ? ORDER BY trust_score DESC LIMIT ?',
      [layer, limit ?? 100],
    );
    return rows.map((r) => this._parseRow(r));
  }

  getByTeamId(teamId: string): readonly MemoryEntry[] {
    const rows = this.db.query<MemoryRow>(
      'SELECT * FROM memory_entries WHERE team_id = ? ORDER BY trust_score DESC',
      [teamId],
    );
    return rows.map((r) => this._parseRow(r));
  }

  archive(entryId: string): void {
    const working = this.workingMemory.get(entryId);
    if (working) {
      this.workingMemory.delete(entryId);
      // Persist to DB as archived
      this._insertToDb({ ...working, layer: 'episodic' as MemoryLayer });
      this.db.db
        .prepare("UPDATE memory_entries SET layer = 'archived', updated_at = ? WHERE id = ?")
        .run(now(), entryId);
    } else {
      const exists = this.db.get<MemoryRow>(
        'SELECT id FROM memory_entries WHERE id = ?',
        [entryId],
      );
      if (!exists) throw new MemoryEntryNotFoundError(entryId);
      this.db.db
        .prepare("UPDATE memory_entries SET layer = 'archived', updated_at = ? WHERE id = ?")
        .run(now(), entryId);
    }

    this.eventBus.emit({
      type: 'memory:archived',
      payload: { entryId },
      source: 'MemoryStore',
    });
  }

  getWorkingMemorySnapshot(): readonly MemoryEntry[] {
    return Array.from(this.workingMemory.values());
  }

  restoreWorkingMemory(entries: readonly MemoryEntry[]): void {
    this.workingMemory.clear();
    for (const entry of entries) {
      this.workingMemory.set(entry.id, entry);
    }
  }

  cleanExpired(): number {
    const expiredRows = this.db.query<{ id: string }>(
      'SELECT id FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at < ?',
      [now()],
    );

    for (const row of expiredRows) {
      this.db.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(row.id);
      this.eventBus.emit({
        type: 'memory:expired',
        payload: { entryId: row.id },
        source: 'MemoryStore',
      });
    }

    return expiredRows.length;
  }

  getStats(): {
    totalEntries: number;
    byLayer: Record<string, number>;
    ramUsageMb: number;
  } {
    const workingCount = this.workingMemory.size;

    const dbCounts = this.db.query<{ layer: string; count: number }>(
      'SELECT layer, COUNT(*) as count FROM memory_entries GROUP BY layer',
    );

    const byLayer: Record<string, number> = { working: workingCount };
    let dbTotal = 0;
    for (const row of dbCounts) {
      byLayer[row.layer] = row.count;
      dbTotal += row.count;
    }

    return {
      totalEntries: workingCount + dbTotal,
      byLayer,
      ramUsageMb: (workingCount * 1024) / (1024 * 1024),
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  // H-02: Archive oldest non-archived entries when total exceeds max
  private _enforceEntryLimit(): void {
    const totalRow = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM memory_entries WHERE layer != 'archived'",
    );
    const totalDb = totalRow?.count ?? 0;
    const totalEntries = totalDb + this.workingMemory.size;

    if (totalEntries <= this.maxEntries) return;

    const excess = totalEntries - this.maxEntries;
    const oldest = this.db.query<{ id: string }>(
      "SELECT id FROM memory_entries WHERE layer != 'archived' ORDER BY created_at ASC LIMIT ?",
      [excess],
    );

    for (const row of oldest) {
      this.db.db
        .prepare("UPDATE memory_entries SET layer = 'archived', updated_at = ? WHERE id = ?")
        .run(now(), row.id);
      this.eventBus.emit({
        type: 'memory:archived',
        payload: { entryId: row.id },
        source: 'MemoryStore',
      });
    }
  }

  private _insertToDb(entry: MemoryEntry): void {
    this.db.insert('memory_entries', {
      id: entry.id,
      layer: entry.layer,
      content: entry.content,
      metadata: JSON.stringify(entry.metadata),
      trust_score: entry.trustScore,
      access_count: entry.accessCount,
      team_id: entry.teamId,
      source: entry.source,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      expires_at: entry.expiresAt,
    });
  }

  private _insertToFts(entryId: string, content: string): void {
    const row = this.db.get<{ rowid: number }>(
      'SELECT rowid FROM memory_entries WHERE id = ?',
      [entryId],
    );
    if (row) {
      this.db.db
        .prepare('INSERT INTO memory_entries_fts(rowid, content) VALUES (?, ?)')
        .run(row.rowid, content);
    }
  }

  private _searchFts(
    query: string,
    layers: readonly MemoryLayer[],
    minTrust: number,
    teamId?: string | null,
  ): MemoryEntry[] {
    const placeholders = layers.map(() => '?').join(', ');
    let sql = `SELECT me.* FROM memory_entries me
      WHERE me.rowid IN (
        SELECT rowid FROM memory_entries_fts WHERE memory_entries_fts MATCH ?
      )
      AND me.layer IN (${placeholders})
      AND me.trust_score >= ?`;

    const params: unknown[] = [query, ...layers, minTrust];

    if (teamId !== undefined) {
      sql += ' AND (me.team_id IS NULL OR me.team_id = ?)';
      params.push(teamId);
    }

    sql += ' ORDER BY me.trust_score DESC';

    const rows = this.db.query<MemoryRow>(sql, params);
    return rows.map((r) => this._parseRow(r));
  }

  private _searchLike(
    query: string,
    layers: readonly MemoryLayer[],
    minTrust: number,
    teamId?: string | null,
  ): MemoryEntry[] {
    const placeholders = layers.map(() => '?').join(', ');
    let sql = `SELECT * FROM memory_entries
      WHERE content LIKE ?
      AND layer IN (${placeholders})
      AND trust_score >= ?`;

    const params: unknown[] = [`%${query}%`, ...layers, minTrust];

    if (teamId !== undefined) {
      sql += ' AND (team_id IS NULL OR team_id = ?)';
      params.push(teamId);
    }

    sql += ' ORDER BY trust_score DESC';

    const rows = this.db.query<MemoryRow>(sql, params);
    return rows.map((r) => this._parseRow(r));
  }

  // -------------------------------------------------------------------------
  // Semantic Search (embedding-based cosine similarity)
  // -------------------------------------------------------------------------

  /**
   * Cache an embedding for a stored entry. Best-effort -- failures are silent.
   */
  private async _cacheEmbedding(entryId: string, content: string): Promise<void> {
    if (!this.embeddingProvider) return;
    const vec = await this.embeddingProvider.generateEmbedding(content);
    if (!vec) return;
    const blob = serializeEmbedding(vec);
    this.db.db
      .prepare('UPDATE memory_entries SET embedding = ? WHERE id = ?')
      .run(blob, entryId);
  }

  /**
   * Semantic search: generate query embedding, load candidates with cached
   * embeddings, rank by cosine similarity, return top results.
   * Excludes entries already found by FTS5 (dedup via excludeIds).
   */
  private async _searchSemantic(
    query: string,
    layers: readonly MemoryLayer[],
    minTrust: number,
    teamId: string | null | undefined,
    excludeIds: ReadonlySet<string>,
  ): Promise<MemoryEntry[]> {
    if (!this.embeddingProvider) return [];

    // Generate query embedding
    const queryVec = await this.embeddingProvider.generateEmbedding(query);
    if (!queryVec) return [];

    // Load candidates that have cached embeddings
    const placeholders = layers.map(() => '?').join(', ');
    let sql = `SELECT * FROM memory_entries
      WHERE layer IN (${placeholders})
      AND trust_score >= ?
      AND embedding IS NOT NULL`;

    const params: unknown[] = [...layers, minTrust];

    if (teamId !== undefined) {
      sql += ' AND (team_id IS NULL OR team_id = ?)';
      params.push(teamId);
    }

    sql += ` ORDER BY trust_score DESC LIMIT ${SEMANTIC_CANDIDATE_LIMIT}`;

    const candidates = this.db.query<MemoryRow>(sql, params);

    // Score each candidate by cosine similarity, excluding already-found entries
    const scored: Array<{ readonly entry: MemoryEntry; readonly score: number }> = [];
    for (const row of candidates) {
      if (excludeIds.has(row.id)) continue;
      if (!row.embedding) continue;

      const candidateVec = deserializeEmbedding(row.embedding as unknown as Buffer);
      const score = cosineSimilarity(queryVec, candidateVec);

      // Only include results with positive similarity
      if (score > 0) {
        scored.push({ entry: this._parseRow(row), score });
      }
    }

    // Sort by similarity descending and return top results
    scored.sort((a, b) => b.score - a.score);
    const maxSemantic = SEMANTIC_FALLBACK_THRESHOLD * 2;
    return scored.slice(0, maxSemantic).map((s) => s.entry);
  }

  private _parseRow(row: MemoryRow): MemoryEntry {
    return {
      id: row.id,
      layer: row.layer as MemoryLayer,
      content: row.content,
      metadata: JSON.parse(row.metadata ?? '{}') as Record<string, unknown>,
      trustScore: row.trust_score,
      accessCount: row.access_count,
      teamId: row.team_id,
      source: row.source as MemorySource,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMemoryStore(
  db: QosDatabase,
  eventBus: EventBus,
  configManager?: ConfigManager,
  embeddingProvider?: EmbeddingProvider,
): MemoryStore {
  return new MemoryStoreImpl(db, eventBus, configManager, embeddingProvider);
}
