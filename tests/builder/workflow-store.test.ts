/**
 * Qualixar OS Phase 21 -- Workflow Store Tests
 *
 * Integration tests for createWorkflowStore() using in-memory SQLite.
 * 8 tests covering create, get, list, update, remove, and count operations.
 *
 * Hard Rule: tests use :memory: (HR-8 from database.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createWorkflowStore } from '../../src/builder/workflow-store.js';
import type { WorkflowStore } from '../../src/builder/workflow-store.js';
import type { QosDatabase } from '../../src/db/database.js';

// ---------------------------------------------------------------------------
// DDL — matches the Phase 21 migration schema exactly
// ---------------------------------------------------------------------------

const WORKFLOWS_DDL = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    nodes_json TEXT NOT NULL DEFAULT '[]',
    edges_json TEXT NOT NULL DEFAULT '[]',
    viewport_json TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    author_role TEXT NOT NULL DEFAULT 'developer',
    last_run_at TEXT,
    last_run_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

// ---------------------------------------------------------------------------
// Minimal QosDatabase adapter wrapping a raw better-sqlite3 instance
// ---------------------------------------------------------------------------

function makeTestDb(): QosDatabase {
  const raw = new Database(':memory:');
  raw.exec(WORKFLOWS_DDL);

  const adapter: QosDatabase = {
    db: raw,

    insert(table: string, row: Record<string, unknown>): void {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      raw.prepare(sql).run(...Object.values(row));
    },

    update(
      table: string,
      set: Record<string, unknown>,
      where: Record<string, unknown>,
    ): void {
      const setClauses = Object.keys(set).map((k) => `${k} = ?`).join(', ');
      const whereClauses = Object.keys(where).map((k) => `${k} = ?`).join(' AND ');
      const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`;
      raw.prepare(sql).run(...Object.values(set), ...Object.values(where));
    },

    query<T>(sql: string, params?: unknown[]): T[] {
      return raw.prepare(sql).all(...(params ?? [])) as T[];
    },

    get<T>(sql: string, params?: unknown[]): T | undefined {
      return raw.prepare(sql).get(...(params ?? [])) as T | undefined;
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowStore', () => {
  let store: WorkflowStore;

  beforeEach(() => {
    store = createWorkflowStore(makeTestDb());
  });

  it('create() returns a WorkflowDocument with a generated id', () => {
    const doc = store.create('My Workflow', 'Test description', [], []);
    expect(doc.id).toBeTruthy();
    expect(typeof doc.id).toBe('string');
    expect(doc.name).toBe('My Workflow');
    expect(doc.description).toBe('Test description');
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
    expect(doc.metadata.version).toBe(1);
  });

  it('get() returns the created workflow by id', () => {
    const created = store.create('Retrieve Me', '', [], []);
    const retrieved = store.get(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.name).toBe('Retrieve Me');
  });

  it('get() returns undefined for an unknown id', () => {
    const result = store.get('nonexistent-id-xyz');
    expect(result).toBeUndefined();
  });

  it('list() returns all created workflows', () => {
    store.create('Alpha', '', [], []);
    store.create('Beta', '', [], []);
    store.create('Gamma', '', [], []);

    const all = store.list();
    expect(all.length).toBe(3);
    const names = all.map((w) => w.name).sort();
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('list() filters by search query matching name or description', () => {
    store.create('Research Pipeline', 'Runs deep research', [], []);
    store.create('Code Review', 'Automated PR review workflow', [], []);
    store.create('Data Ingestion', 'Loads data from S3', [], []);

    const results = store.list('research');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('Research Pipeline');

    const byDesc = store.list('PR review');
    expect(byDesc.length).toBe(1);
    expect(byDesc[0]!.name).toBe('Code Review');
  });

  it('update() modifies the workflow name and bumps version', () => {
    const created = store.create('Original Name', '', [], []);
    expect(created.metadata.version).toBe(1);

    const updated = store.update(created.id, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
    expect(updated.metadata.version).toBe(2);
    expect(updated.id).toBe(created.id);
  });

  it('remove() deletes the workflow and returns true; subsequent get() returns undefined', () => {
    const created = store.create('Delete Me', '', [], []);
    const removed = store.remove(created.id);
    expect(removed).toBe(true);
    expect(store.get(created.id)).toBeUndefined();
  });

  it('count() returns the correct total number of workflows', () => {
    expect(store.count()).toBe(0);
    store.create('One', '', [], []);
    expect(store.count()).toBe(1);
    store.create('Two', '', [], []);
    store.create('Three', '', [], []);
    expect(store.count()).toBe(3);
  });
});
