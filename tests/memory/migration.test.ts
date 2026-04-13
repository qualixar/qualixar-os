/**
 * Qualixar OS Phase 5 -- Migration Tests
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers.js';

describe('Phase 5 Migration', () => {
  it('belief_nodes table exists', () => {
    const db = createTestDb();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='belief_nodes'",
    );
    expect(tables.length).toBe(1);
    db.close();
  });

  it('belief_edges table exists', () => {
    const db = createTestDb();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='belief_edges'",
    );
    expect(tables.length).toBe(1);
    db.close();
  });

  it('belief_edges has from_id index', () => {
    const db = createTestDb();
    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_belief_edges_from'",
    );
    expect(indexes.length).toBe(1);
    db.close();
  });

  it('belief_edges has to_id index', () => {
    const db = createTestDb();
    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_belief_edges_to'",
    );
    expect(indexes.length).toBe(1);
    db.close();
  });

  it('belief_nodes can insert and query', () => {
    const db = createTestDb();
    db.insert('belief_nodes', {
      id: 'test-1',
      content: 'test belief',
      confidence: 0.8,
      source: 'user',
      created_at: '2026-03-30T00:00:00.000Z',
      updated_at: '2026-03-30T00:00:00.000Z',
      decay_rate: 0.01,
    });

    const result = db.get<{ id: string; content: string }>(
      'SELECT * FROM belief_nodes WHERE id = ?',
      ['test-1'],
    );
    expect(result).toBeDefined();
    expect(result!.content).toBe('test belief');
    db.close();
  });
});
