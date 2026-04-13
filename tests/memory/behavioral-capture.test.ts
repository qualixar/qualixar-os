/**
 * Qualixar OS Phase 5 -- Behavioral Capture Tests
 * LLD Section 6.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { BehavioralCaptureImpl, createBehavioralCapture } from '../../src/memory/behavioral-capture.js';
import {
  createTestDb,
  createTestEventBus,
  createEventSpy,
  flushMicrotasks,
} from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('BehavioralCaptureImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;
  let capture: BehavioralCaptureImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
    capture = new BehavioralCaptureImpl(store, eventBus);
  });

  const behavior = {
    agentId: 'agent-1',
    taskId: 'task-1',
    toolSelections: ['search', 'write'] as const,
    errorRecoveryStrategy: 'retry',
    communicationStyle: 'concise',
    successPatterns: ['fast response'] as const,
    timestamp: '2026-03-30T00:00:00.000Z',
  };

  it('captureBehavior returns immediately (non-blocking)', () => {
    // Should not throw or return a promise
    const result = capture.captureBehavior('agent-1', behavior);
    expect(result).toBeUndefined();
  });

  it('after tick, entry stored in procedural layer', async () => {
    capture.captureBehavior('agent-1', behavior);
    await flushMicrotasks();

    const entries = store.getByLayer('procedural');
    expect(entries.length).toBe(1);
    expect(entries[0].source).toBe('behavioral');
  });

  it('content includes tool selections', async () => {
    capture.captureBehavior('agent-1', behavior);
    await flushMicrotasks();

    const entries = store.getByLayer('procedural');
    expect(entries[0].content).toContain('search');
    expect(entries[0].content).toContain('write');
  });

  it('metadata is complete', async () => {
    capture.captureBehavior('agent-1', behavior);
    await flushMicrotasks();

    const entries = store.getByLayer('procedural');
    expect(entries[0].metadata.agentId).toBe('agent-1');
    expect(entries[0].metadata.taskId).toBe('task-1');
    expect(entries[0].metadata.capturedAt).toBe('2026-03-30T00:00:00.000Z');
  });

  it('event emitted after capture', async () => {
    const captured = createEventSpy(eventBus);
    capture.captureBehavior('agent-1', behavior);
    await flushMicrotasks();

    const behaviorEvent = captured.find(
      (e) => e.type === 'memory:behavior_captured',
    );
    expect(behaviorEvent).toBeDefined();
    expect(behaviorEvent!.payload.agentId).toBe('agent-1');
  });

  it('getAgentBehaviors returns filtered results', async () => {
    capture.captureBehavior('agent-1', behavior);
    capture.captureBehavior('agent-2', { ...behavior, agentId: 'agent-2' });
    await flushMicrotasks();

    const results = await capture.getAgentBehaviors('agent-1');
    expect(results.length).toBe(1);
    expect(results[0].metadata.agentId).toBe('agent-1');
  });
});

describe('createBehavioralCapture factory', () => {
  it('returns BehavioralCapture instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const store2 = new MemoryStoreImpl(db2, eb2);
    const bc = createBehavioralCapture(store2, eb2);
    expect(bc).toBeDefined();
    expect(typeof bc.captureBehavior).toBe('function');
    expect(typeof bc.getAgentBehaviors).toBe('function');
  });
});
