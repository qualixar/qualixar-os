/**
 * Qualixar OS Phase 5 -- Learning Engine Tests
 * LLD Section 6.10
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { LearningEngineImpl, createLearningEngine } from '../../src/memory/learning-engine.js';
import {
  createTestDb,
  createTestEventBus,
  createEventSpy,
  createMockModelRouter,
} from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('LearningEngineImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;
  let mockRouter: ReturnType<typeof createMockModelRouter>;
  let engine: LearningEngineImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
    mockRouter = createMockModelRouter('["use caching", "validate inputs"]');
    engine = new LearningEngineImpl(store, mockRouter, eventBus);
  });

  it('stores success patterns in procedural layer', async () => {
    await store.store({
      content: 'task-42 completed successfully',
      layer: 'episodic',
      source: 'system',
    });

    await engine.extractPatterns('task-42', 'code', true);

    const procedural = store.getByLayer('procedural');
    expect(procedural.length).toBe(2);
    expect(procedural[0].metadata.patternType).toBe('success');
  });

  it('stores failure patterns with correct patternType', async () => {
    await store.store({
      content: 'task-99 failed',
      layer: 'episodic',
      source: 'system',
    });

    await engine.extractPatterns('task-99', 'research', false);

    const procedural = store.getByLayer('procedural');
    expect(procedural.length).toBe(2);
    expect(procedural[0].metadata.patternType).toBe('failure');
    expect(procedural[0].metadata.approved).toBe(false);
  });

  it('patterns stored in procedural layer', async () => {
    await engine.extractPatterns('task-1', 'code', true);
    const entries = store.getByLayer('procedural');
    for (const entry of entries) {
      expect(entry.source).toBe('system');
      expect(entry.metadata.taskType).toBe('code');
    }
  });

  it('emits memory:pattern_learned event', async () => {
    const captured = createEventSpy(eventBus);
    await engine.extractPatterns('task-1', 'analysis', true);

    const patternEvent = captured.find(
      (e) => e.type === 'memory:pattern_learned',
    );
    expect(patternEvent).toBeDefined();
    expect(patternEvent!.payload.patternCount).toBe(2);
    expect(patternEvent!.payload.taskType).toBe('analysis');
  });

  it('handles LLM parse failure with newline fallback', async () => {
    mockRouter.setResponse('pattern one\npattern two\npattern three');

    await engine.extractPatterns('task-1', 'code', true);
    const procedural = store.getByLayer('procedural');
    expect(procedural.length).toBe(3);
  });

  it('handles LLM returning non-array JSON (wraps in array)', async () => {
    // Return valid JSON but not an array -- triggers the `!Array.isArray` branch
    mockRouter.setResponse('"just a string, not an array"');

    await engine.extractPatterns('task-1', 'code', true);
    const procedural = store.getByLayer('procedural');
    // Should wrap the raw content as a single pattern
    expect(procedural.length).toBe(1);
    expect(procedural[0].content).toBe('"just a string, not an array"');
  });
});

describe('createLearningEngine factory', () => {
  it('returns LearningEngine instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const store2 = new MemoryStoreImpl(db2, eb2);
    const mr = createMockModelRouter();
    const le = createLearningEngine(store2, mr, eb2);
    expect(le).toBeDefined();
    expect(typeof le.extractPatterns).toBe('function');
  });
});
