/**
 * Qualixar OS Phase 3 -- Drift Detector Tests
 * TDD Sequence #2: SHA-256 hashing, DB read/write.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDriftDetector } from '../../src/quality/drift-detector.js';
import { createDatabase } from '../../src/db/database.js';
import { createEventBus } from '../../src/events/event-bus.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('DriftDetector', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
    eventBus = createEventBus(db);
  });

  afterEach(() => {
    db.close();
  });

  it('first check stores hash and returns no drift', () => {
    const detector = createDriftDetector(db, eventBus);
    const result = detector.check({
      taskId: 'task-1',
      round: 1,
      modelId: 'claude-sonnet-4-6',
      systemPrompt: 'You are a judge',
      temperature: 0.1,
    });

    expect(result.drifted).toBe(false);
    expect(result.details).toBeUndefined();

    // Verify hash was persisted to DB
    const row = db.get<{ hash: string }>(
      'SELECT hash FROM drift_hashes WHERE context_key = ?',
      ['task-1:judge'],
    );
    expect(row).toBeDefined();
    expect(row!.hash).toBeDefined();
  });

  it('same config on second check returns no drift', () => {
    const detector = createDriftDetector(db, eventBus);
    const context = {
      taskId: 'task-2',
      round: 1,
      modelId: 'claude-sonnet-4-6',
      systemPrompt: 'You are a judge',
      temperature: 0.1,
    };

    detector.check(context);
    const result = detector.check({ ...context, round: 2 });

    expect(result.drifted).toBe(false);
  });

  it('different config returns drift with details', () => {
    const detector = createDriftDetector(db, eventBus);

    detector.check({
      taskId: 'task-3',
      round: 1,
      modelId: 'claude-sonnet-4-6',
      systemPrompt: 'You are a judge',
      temperature: 0.1,
    });

    const result = detector.check({
      taskId: 'task-3',
      round: 2,
      modelId: 'gpt-4.1',
      systemPrompt: 'You are a judge',
      temperature: 0.1,
    });

    expect(result.drifted).toBe(true);
    expect(result.details).toBeDefined();
    expect(result.details!.oldHash).toBeDefined();
    expect(result.details!.newHash).toBeDefined();
    expect(result.details!.changedFields).toContain(
      'model_or_prompt_or_temperature',
    );
  });

  it('emits drift:detected event on drift', () => {
    const detector = createDriftDetector(db, eventBus);
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('drift:detected', handler);

    detector.check({
      taskId: 'task-4',
      round: 1,
      modelId: 'claude-sonnet-4-6',
      systemPrompt: 'prompt-v1',
      temperature: 0.1,
    });

    detector.check({
      taskId: 'task-4',
      round: 2,
      modelId: 'claude-sonnet-4-6',
      systemPrompt: 'prompt-v2',
      temperature: 0.1,
    });

    // Handler fires asynchronously, but the event was emitted
    expect(handler).toHaveBeenCalled();
  });

  it('handles temperature change as drift', () => {
    const detector = createDriftDetector(db, eventBus);

    detector.check({
      taskId: 'task-5',
      round: 1,
      modelId: 'claude-sonnet-4-6',
      temperature: 0.1,
    });

    const result = detector.check({
      taskId: 'task-5',
      round: 2,
      modelId: 'claude-sonnet-4-6',
      temperature: 0.5,
    });

    expect(result.drifted).toBe(true);
  });

  it('uses default values for missing context fields', () => {
    const detector = createDriftDetector(db, eventBus);

    const r1 = detector.check({ taskId: 'task-6', round: 1 });
    const r2 = detector.check({ taskId: 'task-6', round: 2 });

    expect(r1.drifted).toBe(false);
    expect(r2.drifted).toBe(false);
  });

  it('isolates different tasks', () => {
    const detector = createDriftDetector(db, eventBus);

    detector.check({
      taskId: 'task-A',
      round: 1,
      modelId: 'model-A',
    });

    // Different task with same config should not drift
    const result = detector.check({
      taskId: 'task-B',
      round: 1,
      modelId: 'model-B',
    });

    expect(result.drifted).toBe(false);
  });

  it('recovers hash from DB when in-memory cache is fresh', () => {
    // Create detector, store hash, then create new detector (simulating restart)
    const detector1 = createDriftDetector(db, eventBus);
    detector1.check({
      taskId: 'task-7',
      round: 1,
      modelId: 'claude-sonnet-4-6',
    });

    // New detector (fresh in-memory cache) should find hash in DB
    const detector2 = createDriftDetector(db, eventBus);
    const result = detector2.check({
      taskId: 'task-7',
      round: 2,
      modelId: 'claude-sonnet-4-6',
    });

    expect(result.drifted).toBe(false);
  });
});
