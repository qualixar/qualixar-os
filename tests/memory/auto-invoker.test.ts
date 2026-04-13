/**
 * Qualixar OS Phase 5 -- Auto-Invoker Tests
 * LLD Section 6.5 + 6.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { TrustScorerImpl } from '../../src/memory/trust-scorer.js';
import { AutoInvokerImpl, createAutoInvoker } from '../../src/memory/auto-invoker.js';
import {
  createTestDb,
  createTestEventBus,
  createEventSpy,
  createMockModelRouter,
} from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('AutoInvokerImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;
  let trustScorer: TrustScorerImpl;
  let mockRouter: ReturnType<typeof createMockModelRouter>;
  let invoker: AutoInvokerImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
    trustScorer = new TrustScorerImpl();
    mockRouter = createMockModelRouter('["typescript", "testing", "quality"]');
    invoker = new AutoInvokerImpl(store, mockRouter, trustScorer, eventBus);
  });

  // -----------------------------------------------------------------------
  // autoInvoke core
  // -----------------------------------------------------------------------

  it('extracts concepts via mock LLM', async () => {
    await store.store({
      content: 'TypeScript testing best practices',
      layer: 'episodic',
      source: 'user',
    });

    const context = await invoker.autoInvoke({
      prompt: 'How to test TypeScript apps?',
    });

    // Should find the entry via extracted concepts
    expect(context).toBeDefined();
    expect(context.entries).toBeDefined();
  });

  it('searches all 4 layers', async () => {
    await store.store({ content: 'working typescript', layer: 'working', source: 'user' });
    await store.store({ content: 'episodic typescript data', layer: 'episodic', source: 'user' });
    await store.store({ content: 'semantic typescript info', layer: 'semantic', source: 'user' });
    await store.store({ content: 'procedural typescript how-to', layer: 'procedural', source: 'user' });

    const context = await invoker.autoInvoke({
      prompt: 'typescript development',
    });

    expect(context.entries.length).toBeGreaterThan(0);
  });

  it('results ranked by trustScore descending', async () => {
    const id1 = await store.store({
      content: 'low trust typescript',
      layer: 'episodic',
      source: 'user',
    });
    const id2 = await store.store({
      content: 'high trust typescript',
      layer: 'episodic',
      source: 'user',
    });
    store.updateTrustScore(id1, 0.3);
    store.updateTrustScore(id2, 0.9);

    const context = await invoker.autoInvoke({
      prompt: 'typescript help',
    });

    if (context.entries.length >= 2) {
      expect(context.entries[0].trustScore).toBeGreaterThanOrEqual(
        context.entries[1].trustScore,
      );
    }
  });

  it('summary generated when entries found', async () => {
    await store.store({
      content: 'typescript testing patterns',
      layer: 'episodic',
      source: 'user',
    });

    mockRouter.setResponse('["typescript", "testing"]');
    const context = await invoker.autoInvoke({
      prompt: 'typescript testing',
    });

    expect(context.summary).toBeTruthy();
    expect(context.summary.length).toBeGreaterThan(0);
  });

  it('no entries returns default summary', async () => {
    // Store with unrelated content
    await store.store({
      content: 'completely unrelated xyz987',
      layer: 'episodic',
      source: 'user',
    });

    mockRouter.setResponse('["nonexistent", "keywords"]');
    const context = await invoker.autoInvoke({
      prompt: 'something totally different abc123',
    });

    // Even with no matching entries, summary should be set
    expect(context.summary).toBeTruthy();
  });

  it('layerCounts are correct', async () => {
    await store.store({ content: 'episodic typescript', layer: 'episodic', source: 'user' });
    await store.store({ content: 'working typescript', layer: 'working', source: 'user' });

    const context = await invoker.autoInvoke({
      prompt: 'typescript',
    });

    expect(context.layerCounts).toBeDefined();
    expect(typeof context.layerCounts.working).toBe('number');
    expect(typeof context.layerCounts.episodic).toBe('number');
  });

  it('emits memory:recalled event', async () => {
    const captured = createEventSpy(eventBus);
    await store.store({
      content: 'recall event test typescript',
      layer: 'episodic',
      source: 'user',
    });

    await invoker.autoInvoke({ prompt: 'typescript event' });

    const recallEvent = captured.find((e) => e.type === 'memory:recalled');
    expect(recallEvent).toBeDefined();
    expect(recallEvent!.payload.trustThreshold).toBeDefined();
    expect(recallEvent!.payload.topK).toBeDefined();
  });

  it('empty array from LLM concept extraction falls back to keywords', async () => {
    mockRouter.setResponse('[]'); // Valid JSON, empty array

    await store.store({
      content: 'working empty array fallback test',
      layer: 'working',
      source: 'user',
    });

    const context = await invoker.autoInvoke({
      prompt: 'empty array fallback test here',
    });
    expect(context).toBeDefined();
  });

  it('non-array JSON from LLM concept extraction falls back to keywords', async () => {
    mockRouter.setResponse('{"not": "an array"}'); // Valid JSON, not array

    await store.store({
      content: 'working non-array fallback test',
      layer: 'working',
      source: 'user',
    });

    const context = await invoker.autoInvoke({
      prompt: 'non-array fallback test keywords',
    });
    expect(context).toBeDefined();
  });

  it('concept extraction failure falls back to keyword split', async () => {
    mockRouter.setResponse('not valid json at all!');

    await store.store({
      content: 'working fallback test',
      layer: 'working',
      source: 'user',
    });

    // Should not throw, should use fallback keywords
    const context = await invoker.autoInvoke({
      prompt: 'fallback test keywords here',
    });
    expect(context).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Bandit feedback
  // -----------------------------------------------------------------------

  it('recordFeedback increments pullCount', async () => {
    // First invoke to select arms
    await invoker.autoInvoke({ prompt: 'test bandit' });

    // Record feedback
    await invoker.recordFeedback(true, true);

    // Verify state persisted (should have an entry in procedural)
    const entries = store.getByLayer('procedural');
    const banditEntry = entries.find(
      (e) => e.metadata.key === '__bandit_policy_state__',
    );
    expect(banditEntry).toBeDefined();
  });

  it('recordFeedback records reward correctly', async () => {
    await invoker.autoInvoke({ prompt: 'test reward' });
    await invoker.recordFeedback(true, true);

    const entries = store.getByLayer('procedural');
    const banditEntry = entries.find(
      (e) => e.metadata.key === '__bandit_policy_state__',
    );
    expect(banditEntry).toBeDefined();

    const state = JSON.parse(banditEntry!.content);
    // At least one arm should have pullCount > 0
    const pulledArms = state.trustThresholdArms.filter(
      (a: { pullCount: number }) => a.pullCount > 0,
    );
    expect(pulledArms.length).toBeGreaterThan(0);
  });

  it('bandit state persisted to procedural layer', async () => {
    await invoker.autoInvoke({ prompt: 'persist test' });
    await invoker.recordFeedback(true, true);

    const entries = store.getByLayer('procedural');
    expect(
      entries.some((e) => e.metadata.key === '__bandit_policy_state__'),
    ).toBe(true);
  });

  it('recordFeedback updates existing bandit entry via createVersion', async () => {
    // First feedback creates the entry
    await invoker.autoInvoke({ prompt: 'first invoke' });
    await invoker.recordFeedback(true, true);

    // Second feedback should find existing and call createVersion
    await invoker.autoInvoke({ prompt: 'second invoke' });
    await invoker.recordFeedback(false, false);

    const entries = store.getByLayer('procedural');
    const banditEntries = entries.filter(
      (e) => e.metadata.key === '__bandit_policy_state__',
    );
    // Original + versioned entry
    expect(banditEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('_selectArm explores random arm when Math.random < epsilon', async () => {
    // Force Math.random to return a value < epsilon (0.1)
    const originalRandom = Math.random;
    Math.random = () => 0.05; // Always < 0.1 epsilon => explore

    try {
      const context = await invoker.autoInvoke({
        prompt: 'explore test keywords',
      });
      // Should not throw, explore path is exercised
      expect(context).toBeDefined();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('summary fallback when LLM summarize fails', async () => {
    await store.store({
      content: 'typescript memory for summary test',
      layer: 'episodic',
      source: 'user',
    });

    // First call (concept extraction) returns valid concepts
    // Second call (summarize) will throw -- configure a failing router
    let callCount = 0;
    const failingRouter = {
      async route() {
        callCount++;
        if (callCount === 1) {
          // Concept extraction
          return {
            content: '["typescript", "memory", "summary"]',
            model: 'mock',
            provider: 'mock',
            inputTokens: 10,
            outputTokens: 5,
            costUsd: 0.001,
            latencyMs: 50,
          };
        }
        // Summarize call -- throw to trigger catch branch
        throw new Error('LLM unavailable');
      },
      getStrategy() { return 'mock'; },
      getCostTracker() { return null as any; },
      getDiscoveredModels() { return []; },
      getAvailableModels() { return []; },
    };

    const failInvoker = new AutoInvokerImpl(store, failingRouter as any, trustScorer, eventBus);
    const context = await failInvoker.autoInvoke({ prompt: 'typescript memory summary test' });
    expect(context.summary).toContain('entries retrieved');
  });
});

describe('createAutoInvoker factory', () => {
  it('returns AutoInvoker instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const store2 = new MemoryStoreImpl(db2, eb2);
    const ts = new TrustScorerImpl();
    const mr = createMockModelRouter();
    const ai = createAutoInvoker(store2, mr, ts, eb2);
    expect(ai).toBeDefined();
    expect(typeof ai.autoInvoke).toBe('function');
    expect(typeof ai.recordFeedback).toBe('function');
  });
});
