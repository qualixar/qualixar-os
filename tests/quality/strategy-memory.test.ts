/**
 * Qualixar OS Phase 3 -- Strategy Memory Tests
 * TDD Sequence #6: In-memory SQLite, tests CRUD + decay.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStrategyMemory } from '../../src/quality/strategy-memory.js';
import { createDatabase } from '../../src/db/database.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';

describe('StrategyMemory', () => {
  let db: QosDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  it('returns undefined for missing entry', () => {
    const sm = createStrategyMemory(db);
    const result = sm.get('code', 'cascade');
    expect(result).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // upsert() - create
  // -------------------------------------------------------------------------

  it('creates new entry on upsert', () => {
    const sm = createStrategyMemory(db);
    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.7,
      confidence: 0.5,
    });

    const result = sm.get('code', 'cascade');
    expect(result).toBeDefined();
    expect(result!.task_type).toBe('code');
    expect(result!.strategy).toBe('cascade');
    expect(result!.success_count).toBe(1);
    expect(result!.failure_count).toBe(0);
    expect(result!.avg_reward).toBeCloseTo(0.7, 3);
  });

  // -------------------------------------------------------------------------
  // upsert() - update
  // -------------------------------------------------------------------------

  it('updates existing entry on upsert', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.7,
      confidence: 0.5,
    });

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 5,
      failureCount: 2,
      avgReward: 0.8,
      confidence: 0.9,
    });

    const result = sm.get('code', 'cascade');
    expect(result!.success_count).toBe(5);
    expect(result!.failure_count).toBe(2);
    expect(result!.avg_reward).toBeCloseTo(0.8, 3);
  });

  // -------------------------------------------------------------------------
  // getByTaskType()
  // -------------------------------------------------------------------------

  it('returns sorted by avg_reward descending', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.5,
      confidence: 0.5,
    });

    sm.upsert({
      taskType: 'code',
      strategy: 'quality',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.9,
      confidence: 0.5,
    });

    sm.upsert({
      taskType: 'code',
      strategy: 'cheapest',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.3,
      confidence: 0.5,
    });

    const results = sm.getByTaskType('code');
    expect(results).toHaveLength(3);
    expect(results[0].strategy).toBe('quality');
    expect(results[1].strategy).toBe('cascade');
    expect(results[2].strategy).toBe('cheapest');
  });

  it('returns empty array for unknown task type', () => {
    const sm = createStrategyMemory(db);
    const results = sm.getByTaskType('nonexistent');
    expect(results).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // getAll()
  // -------------------------------------------------------------------------

  it('returns all entries across task types', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.7,
      confidence: 0.5,
    });

    sm.upsert({
      taskType: 'research',
      strategy: 'quality',
      successCount: 2,
      failureCount: 1,
      avgReward: 0.6,
      confidence: 0.4,
    });

    const results = sm.getAll();
    expect(results).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Confidence decay
  // -------------------------------------------------------------------------

  it('applies temporal decay to confidence on read', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 10,
      failureCount: 0,
      avgReward: 0.9,
      confidence: 0.9,
    });

    // Manually backdate updated_at to 30 days ago
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    db.db
      .prepare(
        'UPDATE strategy_memory SET updated_at = ? WHERE task_type = ? AND strategy = ?',
      )
      .run(thirtyDaysAgo, 'code', 'cascade');

    const result = sm.get('code', 'cascade');
    expect(result).toBeDefined();
    // After 30 days with decay rate 0.01: 0.9 * exp(-0.01 * 30) = 0.9 * 0.741 ≈ 0.667
    expect(result!.confidence).toBeLessThan(0.9);
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('confidence remains unchanged for recently updated entry', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.7,
      confidence: 0.5,
    });

    const result = sm.get('code', 'cascade');
    // Just created, so almost no decay
    expect(result!.confidence).toBeCloseTo(0.5, 1);
  });

  // -------------------------------------------------------------------------
  // Unique index
  // -------------------------------------------------------------------------

  it('unique index prevents duplicate task_type+strategy via direct insert', () => {
    const sm = createStrategyMemory(db);

    sm.upsert({
      taskType: 'code',
      strategy: 'cascade',
      successCount: 1,
      failureCount: 0,
      avgReward: 0.7,
      confidence: 0.5,
    });

    // Inserting a duplicate directly should fail (but upsert handles it)
    expect(() => {
      db.insert('strategy_memory', {
        id: 'dup-id',
        task_type: 'code',
        strategy: 'cascade',
        success_count: 2,
        failure_count: 0,
        avg_reward: 0.8,
        confidence: 0.6,
        last_used: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }).toThrow();
  });
});
