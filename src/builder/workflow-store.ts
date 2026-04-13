// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Workflow Store
 *
 * CRUD operations on the `workflows` table using QosDatabase.
 * All SQL uses parameterized queries (HR-3). No raw string interpolation.
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-3: Prepared statements only via db.query / db.get / db.insert / db.update.
 */

import type { QosDatabase } from '../db/database.js';
import type {
  WorkflowDocument,
  WorkflowSummary,
  WorkflowNode,
  WorkflowEdge,
  CanvasViewport,
  WorkflowMetadata,
} from '../types/phase21.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface WorkflowStore {
  create(
    name: string,
    description: string,
    nodes: readonly WorkflowNode[],
    edges: readonly WorkflowEdge[],
  ): WorkflowDocument;

  get(id: string): WorkflowDocument | undefined;

  list(
    search?: string,
    tags?: readonly string[],
    limit?: number,
    offset?: number,
  ): WorkflowSummary[];

  update(id: string, changes: WorkflowStoreChanges): WorkflowDocument;

  remove(id: string): boolean;

  count(search?: string, tags?: readonly string[]): number;
}

export interface WorkflowStoreChanges {
  readonly name?: string;
  readonly description?: string;
  readonly nodes?: readonly WorkflowNode[];
  readonly edges?: readonly WorkflowEdge[];
  readonly tags?: readonly string[];
  readonly lastRunAt?: string | null;
  readonly lastRunStatus?: 'completed' | 'failed' | null;
  readonly estimatedCostUsd?: number;
}

// ---------------------------------------------------------------------------
// DB Row Shape
// ---------------------------------------------------------------------------

interface WorkflowRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodes_json: string;
  readonly edges_json: string;
  readonly viewport_json: string;
  readonly tags: string;
  readonly estimated_cost_usd: number;
  readonly version: number;
  readonly author_role: string;
  readonly last_run_at: string | null;
  readonly last_run_status: 'completed' | 'failed' | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToDocument(row: WorkflowRow): WorkflowDocument {
  const nodes = JSON.parse(row.nodes_json) as WorkflowNode[];
  const edges = JSON.parse(row.edges_json) as WorkflowEdge[];
  const viewport = JSON.parse(row.viewport_json) as CanvasViewport;
  const tags = JSON.parse(row.tags) as string[];

  const metadata: WorkflowMetadata = {
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    authorRole: row.author_role as WorkflowMetadata['authorRole'],
    tags,
    estimatedCostUsd: row.estimated_cost_usd,
  };

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodes,
    edges,
    viewport,
    metadata,
  };
}

function rowToSummary(row: WorkflowRow): WorkflowSummary {
  const nodes = JSON.parse(row.nodes_json) as WorkflowNode[];
  const edges = JSON.parse(row.edges_json) as WorkflowEdge[];
  const tags = JSON.parse(row.tags) as string[];

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    tags,
    estimatedCostUsd: row.estimated_cost_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class WorkflowStoreImpl implements WorkflowStore {
  private readonly _db: QosDatabase;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  create(
    name: string,
    description: string,
    nodes: readonly WorkflowNode[],
    edges: readonly WorkflowEdge[],
  ): WorkflowDocument {
    const id = generateId();
    const createdAt = now();
    const defaultViewport: CanvasViewport = { offsetX: 0, offsetY: 0, zoom: 1 };

    this._db.insert('workflows', {
      id,
      name,
      description,
      nodes_json: JSON.stringify(nodes),
      edges_json: JSON.stringify(edges),
      viewport_json: JSON.stringify(defaultViewport),
      tags: '[]',
      estimated_cost_usd: 0,
      version: 1,
      author_role: 'developer',
      last_run_at: null,
      last_run_status: null,
      created_at: createdAt,
      updated_at: createdAt,
    });

    const row = this._db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [id],
    );

    if (!row) {
      throw new Error(`Failed to retrieve workflow after insert: ${id}`);
    }

    return rowToDocument(row);
  }

  get(id: string): WorkflowDocument | undefined {
    const row = this._db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [id],
    );

    return row ? rowToDocument(row) : undefined;
  }

  list(
    search?: string,
    tags?: readonly string[],
    limit = 50,
    offset = 0,
  ): WorkflowSummary[] {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (search && search.trim().length > 0) {
      clauses.push('(name LIKE ? OR description LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern);
    }

    // Tag filter: each requested tag must appear in the JSON tags array
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        clauses.push('tags LIKE ?');
        params.push(`%${tag}%`);
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT * FROM workflows ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this._db.query<WorkflowRow>(sql, params);
    return rows.map(rowToSummary);
  }

  update(id: string, changes: WorkflowStoreChanges): WorkflowDocument {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Workflow not found: ${id}`);
    }

    const setFields: Record<string, unknown> = {
      updated_at: now(),
      version: existing.metadata.version + 1,
    };

    if (changes.name !== undefined) setFields['name'] = changes.name;
    if (changes.description !== undefined) setFields['description'] = changes.description;
    if (changes.nodes !== undefined) setFields['nodes_json'] = JSON.stringify(changes.nodes);
    if (changes.edges !== undefined) setFields['edges_json'] = JSON.stringify(changes.edges);
    if (changes.tags !== undefined) setFields['tags'] = JSON.stringify(changes.tags);
    if (changes.estimatedCostUsd !== undefined) setFields['estimated_cost_usd'] = changes.estimatedCostUsd;
    if ('lastRunAt' in changes) setFields['last_run_at'] = changes.lastRunAt ?? null;
    if ('lastRunStatus' in changes) setFields['last_run_status'] = changes.lastRunStatus ?? null;

    this._db.update('workflows', setFields, { id });

    const updated = this.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve workflow after update: ${id}`);
    }

    return updated;
  }

  remove(id: string): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    this._db.db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    return true;
  }

  count(search?: string, tags?: readonly string[]): number {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (search && search.trim().length > 0) {
      clauses.push('(name LIKE ? OR description LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern);
    }

    if (tags && tags.length > 0) {
      for (const tag of tags) {
        clauses.push('tags LIKE ?');
        params.push(`%${tag}%`);
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as cnt FROM workflows ${where}`;
    const row = this._db.get<{ cnt: number }>(sql, params);
    return row?.cnt ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowStore(db: QosDatabase): WorkflowStore {
  return new WorkflowStoreImpl(db);
}
