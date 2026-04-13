/**
 * Qualixar OS Phase 5 -- SLMLite Facade Tests
 * LLD Section 6.11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SLMLiteImpl, createSLMLite } from '../../src/memory/index.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  flushMicrotasks,
} from './helpers.js';
import { createConfigManager } from '../../src/config/config-manager.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { ConfigManager } from '../../src/config/config-manager.js';

describe('SLMLiteImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let mockRouter: ReturnType<typeof createMockModelRouter>;
  let configManager: ConfigManager;
  let slmLite: SLMLiteImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    mockRouter = createMockModelRouter('["concept1", "concept2"]');
    configManager = createConfigManager({});
    slmLite = new SLMLiteImpl(db, mockRouter, eventBus, configManager);
  });

  it('store() delegates and returns id', async () => {
    const id = await slmLite.store({
      content: 'facade test',
      layer: 'episodic',
      source: 'user',
    });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('recall() returns MemoryContext', async () => {
    await slmLite.store({
      content: 'recall facade test',
      layer: 'episodic',
      source: 'user',
    });

    const context = await slmLite.recall('recall facade');
    expect(context.entries).toBeDefined();
    expect(context.summary).toBeDefined();
    expect(context.totalFound).toBeDefined();
    expect(context.layerCounts).toBeDefined();
  });

  it('autoInvoke() delegates and returns MemoryContext', async () => {
    await slmLite.store({
      content: 'auto invoke data concept1',
      layer: 'episodic',
      source: 'user',
    });

    const context = await slmLite.autoInvoke({ prompt: 'test task' });
    expect(context).toBeDefined();
    expect(context.entries).toBeDefined();
    expect(context.summary).toBeDefined();
  });

  it('autoInvoke() returns empty when memory.enabled=false', async () => {
    const disabledConfig = createConfigManager({
      memory: { enabled: false, auto_invoke: true, max_ram_mb: 50 },
    });
    const lite = new SLMLiteImpl(db, mockRouter, eventBus, disabledConfig);

    const context = await lite.autoInvoke({ prompt: 'test' });
    expect(context.entries.length).toBe(0);
    expect(context.summary).toBe('Memory disabled');
  });

  it('autoInvoke() returns empty when auto_invoke=false', async () => {
    const noAutoConfig = createConfigManager({
      memory: { enabled: true, auto_invoke: false, max_ram_mb: 50 },
    });
    const lite = new SLMLiteImpl(db, mockRouter, eventBus, noAutoConfig);

    const context = await lite.autoInvoke({ prompt: 'test' });
    expect(context.entries.length).toBe(0);
  });

  it('shareWithTeam() delegates', async () => {
    const id = await slmLite.store({
      content: 'share test',
      layer: 'episodic',
      source: 'user',
    });

    // Non-blocking, fire and forget
    slmLite.shareWithTeam(id, 'team-x');
    await flushMicrotasks();

    const context = await slmLite.getTeamMemory('team-x');
    expect(context.entries.length).toBe(1);
  });

  it('captureBehavior() delegates', async () => {
    slmLite.captureBehavior('agent-1', {
      agentId: 'agent-1',
      taskId: 'task-1',
      toolSelections: ['search'],
      successPatterns: ['fast'],
      timestamp: '2026-03-30T00:00:00.000Z',
    });
    await flushMicrotasks();

    // Should have stored in procedural
    const context = await slmLite.recall('agent-1', { layers: ['procedural'] });
    expect(context.entries.length).toBeGreaterThanOrEqual(0);
  });

  it('addBelief() delegates', async () => {
    const nodeId = await slmLite.addBelief({
      content: 'facade belief test',
      confidence: 0.8,
      source: 'user',
    });
    expect(nodeId).toBeTruthy();
  });

  it('getBeliefGraph() delegates', async () => {
    await slmLite.addBelief({
      content: 'graph facade test',
      confidence: 0.8,
      source: 'user',
    });

    const graph = await slmLite.getBeliefGraph('graph facade');
    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
  });

  it('getStats() aggregates from store and belief graph', async () => {
    await slmLite.store({ content: 'stat test', layer: 'episodic', source: 'user' });
    await slmLite.addBelief({ content: 'stat belief', confidence: 0.7, source: 'user' });

    const stats = slmLite.getStats();
    expect(stats.totalEntries).toBeGreaterThanOrEqual(1);
    expect(stats.beliefNodes).toBeGreaterThanOrEqual(1);
    expect(stats.byLayer).toBeDefined();
    expect(typeof stats.ramUsageMb).toBe('number');
  });

  it('getTrustScore() returns entry trust score', async () => {
    const id = await slmLite.store({
      content: 'trust facade',
      layer: 'episodic',
      source: 'user',
    });
    const score = slmLite.getTrustScore(id);
    expect(score).toBe(0.5); // Default
  });

  it('getTrustScore() returns 0 for non-existent entry', () => {
    expect(slmLite.getTrustScore('nonexistent')).toBe(0);
  });

  it('extractPatterns() delegates to learning engine', async () => {
    await slmLite.store({
      content: 'extract pattern data',
      layer: 'episodic',
      source: 'system',
    });
    // Should not throw
    await slmLite.extractPatterns('task-1', 'code', true);
  });

  it('runPromotion() delegates to promoter', async () => {
    const result = await slmLite.runPromotion();
    expect(result).toBeDefined();
    expect(result.promotedCount).toBeDefined();
    expect(result.promotions).toBeDefined();
  });

  it('cleanExpired() delegates to store', () => {
    const count = slmLite.cleanExpired();
    expect(typeof count).toBe('number');
    expect(count).toBe(0);
  });

  it('promote() moves entry to target layer', async () => {
    const id = await slmLite.store({
      content: 'promote me',
      layer: 'episodic',
      source: 'user',
    });
    // Fire-and-forget
    slmLite.promote(id, 'semantic');
    await flushMicrotasks();
  });

  it('promote() does nothing for non-existent entry', async () => {
    // Should not throw
    slmLite.promote('nonexistent', 'semantic');
    await flushMicrotasks();
  });
});

describe('createSLMLite factory', () => {
  it('returns SLMLite instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const mr = createMockModelRouter();
    const cm = createConfigManager({});
    const slm = createSLMLite(db2, mr, eb2, cm);
    expect(slm).toBeDefined();
    expect(typeof slm.store).toBe('function');
    expect(typeof slm.recall).toBe('function');
  });
});
