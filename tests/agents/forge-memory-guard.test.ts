/**
 * Phase C1 -- Forge Memory Guard Tests
 *
 * Prevents catastrophic forgetting during team redesign.
 *
 * Source: Phase C1 LLD
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createForgeMemoryGuard, type ForgeMemoryGuard } from '../../src/agents/forge-memory-guard.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): QosDatabase {
  const raw = new Database(':memory:');

  // Create minimal tables needed
  raw.exec(`
    CREATE TABLE forge_designs (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      task_type TEXT,
      topology TEXT,
      agents TEXT,
      created_at TEXT
    );
    CREATE TABLE judge_results (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      round INTEGER,
      judge_model TEXT,
      verdict TEXT,
      score REAL,
      issues TEXT,
      feedback TEXT,
      created_at TEXT
    );
  `);

  return {
    db: raw,
    insert: vi.fn((table: string, data: Record<string, unknown>) => {
      const cols = Object.keys(data);
      const placeholders = cols.map(() => '?').join(',');
      raw.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`).run(...Object.values(data));
    }),
    get: vi.fn((sql: string, params: unknown[]) => raw.prepare(sql).get(...params)),
    query: vi.fn((sql: string, params: unknown[]) => raw.prepare(sql).all(...params)),
    update: vi.fn(),
  } as unknown as QosDatabase;
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
  } as unknown as EventBus;
}

function seedDesigns(db: QosDatabase): void {
  const raw = db.db as Database.Database;

  // High-scoring design
  raw.prepare(`INSERT INTO forge_designs (id, task_id, task_type, topology, agents, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    'design-1', 'task-1', 'code', 'parallel',
    JSON.stringify([{ role: 'architect' }, { role: 'coder' }, { role: 'reviewer' }]),
    '2026-04-01T00:00:00Z',
  );
  raw.prepare(`INSERT INTO judge_results (id, task_id, round, judge_model, verdict, score, issues, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'jr-1', 'task-1', 1, 'gpt-4.1', 'approve', 0.9, '[]', 'Good', '2026-04-01T00:00:00Z',
  );

  // Another high-scoring design
  raw.prepare(`INSERT INTO forge_designs (id, task_id, task_type, topology, agents, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    'design-2', 'task-2', 'code', 'hierarchical',
    JSON.stringify([{ role: 'lead' }, { role: 'worker' }]),
    '2026-04-02T00:00:00Z',
  );
  raw.prepare(`INSERT INTO judge_results (id, task_id, round, judge_model, verdict, score, issues, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'jr-2', 'task-2', 1, 'gpt-4.1', 'approve', 0.85, '[]', 'Good', '2026-04-02T00:00:00Z',
  );

  // Low-scoring design (should NOT be preserved)
  raw.prepare(`INSERT INTO forge_designs (id, task_id, task_type, topology, agents, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    'design-3', 'task-3', 'code', 'sequential',
    JSON.stringify([{ role: 'single-agent' }]),
    '2026-04-03T00:00:00Z',
  );
  raw.prepare(`INSERT INTO judge_results (id, task_id, round, judge_model, verdict, score, issues, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'jr-3', 'task-3', 1, 'gpt-4.1', 'reject', 0.3, '[]', 'Bad', '2026-04-03T00:00:00Z',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForgeMemoryGuard', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let guard: ForgeMemoryGuard;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createMockEventBus();
    guard = createForgeMemoryGuard(db, eventBus);
  });

  it('preserveBeforeRedesign returns high-scoring patterns', () => {
    seedDesigns(db);

    const preserved = guard.preserveBeforeRedesign('code', 'failing-design');

    // Should preserve design-1 (score 0.9) and design-2 (score 0.85)
    expect(preserved.length).toBe(2);
    expect(preserved[0].score).toBeGreaterThanOrEqual(0.7);
    expect(preserved[1].score).toBeGreaterThanOrEqual(0.7);
  });

  it('does NOT preserve the current failing design', () => {
    seedDesigns(db);

    // design-1 is the current failing one
    const preserved = guard.preserveBeforeRedesign('code', 'design-1');

    // Should NOT include design-1
    const ids = preserved.map((p) => p.sourceDesignId);
    expect(ids).not.toContain('design-1');
  });

  it('does NOT preserve low-scoring designs', () => {
    seedDesigns(db);

    const preserved = guard.preserveBeforeRedesign('code', 'failing-design');

    // design-3 (score 0.3) should NOT be preserved
    const ids = preserved.map((p) => p.sourceDesignId);
    expect(ids).not.toContain('design-3');
  });

  it('emits forge:patterns_preserved event', () => {
    seedDesigns(db);

    guard.preserveBeforeRedesign('code', 'failing-design');

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'forge:patterns_preserved',
        payload: expect.objectContaining({
          taskType: 'code',
          patternsPreserved: 2,
        }),
      }),
    );
  });

  it('getPreservedPatterns retrieves stored patterns', () => {
    seedDesigns(db);
    guard.preserveBeforeRedesign('code', 'failing-design');

    const patterns = guard.getPreservedPatterns('code');

    expect(patterns.length).toBe(2);
    expect(patterns[0].agentRoles).toBeInstanceOf(Array);
  });

  it('getSuggestedRoles returns roles sorted by frequency', () => {
    seedDesigns(db);
    guard.preserveBeforeRedesign('code', 'failing-design');

    const roles = guard.getSuggestedRoles('code');

    // 'architect', 'coder', 'reviewer' from design-1, 'lead', 'worker' from design-2
    expect(roles.length).toBeGreaterThanOrEqual(3);
    expect(roles).toContain('architect');
    expect(roles).toContain('coder');
  });

  it('returns empty when no designs exist for task type', () => {
    const preserved = guard.preserveBeforeRedesign('unknown-type', 'x');
    expect(preserved).toHaveLength(0);
  });

  it('handles designs with invalid agent JSON gracefully', () => {
    const raw = db.db as Database.Database;
    raw.prepare(`INSERT INTO forge_designs (id, task_id, task_type, topology, agents, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      'bad-design', 'task-bad', 'code', 'parallel', 'not-json', '2026-04-01T00:00:00Z',
    );
    raw.prepare(`INSERT INTO judge_results (id, task_id, round, judge_model, verdict, score, issues, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'jr-bad', 'task-bad', 1, 'gpt-4.1', 'approve', 0.9, '[]', '', '2026-04-01T00:00:00Z',
    );

    // Should not throw
    const preserved = guard.preserveBeforeRedesign('code', 'x');
    // bad-design has invalid JSON, so it's skipped (agentRoles empty → filtered out)
    expect(preserved.every((p) => p.agentRoles.length > 0)).toBe(true);
  });
});
