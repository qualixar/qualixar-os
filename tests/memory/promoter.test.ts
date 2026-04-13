/**
 * Qualixar OS Phase 5 -- Promoter Tests
 * LLD Section 6.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { PromoterImpl, createPromoter } from '../../src/memory/promoter.js';
import { TrustScorerImpl } from '../../src/memory/trust-scorer.js';
import { createTestDb, createTestEventBus, createEventSpy } from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('PromoterImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;
  let promoter: PromoterImpl;
  let trustScorer: TrustScorerImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
    trustScorer = new TrustScorerImpl();
    promoter = new PromoterImpl(store, trustScorer, eventBus);
  });

  it('promotes working -> episodic when accessCount >= 3', async () => {
    const id = await store.store({ content: 'accessed', layer: 'working', source: 'user' });
    // Simulate 3 accesses
    await store.recall('accessed', { layers: ['working'] });
    await store.recall('accessed', { layers: ['working'] });
    await store.recall('accessed', { layers: ['working'] });

    const result = await promoter.runPromotion();
    expect(result.promotedCount).toBeGreaterThanOrEqual(1);
    const promotion = result.promotions.find((p) => p.entryId === id);
    expect(promotion).toBeDefined();
    expect(promotion!.from).toBe('working');
    expect(promotion!.to).toBe('episodic');
  });

  it('does NOT promote working when accessCount < 3', async () => {
    await store.store({ content: 'few accesses', layer: 'working', source: 'user' });
    await store.recall('few', { layers: ['working'] });
    // Only 1 access

    const result = await promoter.runPromotion();
    const workingToEpisodic = result.promotions.filter(
      (p) => p.from === 'working' && p.to === 'episodic',
    );
    expect(workingToEpisodic.length).toBe(0);
  });

  it('promotes episodic -> semantic when confirmed_sessions >= 2 AND trust >= 0.6', async () => {
    const id = await store.store({
      content: 'confirmed knowledge',
      layer: 'episodic',
      source: 'user',
      metadata: { confirmed_sessions: 3 },
    });
    store.updateTrustScore(id, 0.7);

    const result = await promoter.runPromotion();
    const promotion = result.promotions.find((p) => p.entryId === id);
    expect(promotion).toBeDefined();
    expect(promotion!.to).toBe('semantic');
  });

  it('does NOT promote episodic with only 1 session', async () => {
    const id = await store.store({
      content: 'single session',
      layer: 'episodic',
      source: 'user',
      metadata: { confirmed_sessions: 1 },
    });
    store.updateTrustScore(id, 0.7);

    const result = await promoter.runPromotion();
    const episodicToSemantic = result.promotions.filter(
      (p) => p.entryId === id && p.to === 'semantic',
    );
    expect(episodicToSemantic.length).toBe(0);
  });

  it('does NOT promote episodic when trust < 0.6', async () => {
    const id = await store.store({
      content: 'low trust episodic',
      layer: 'episodic',
      source: 'user',
      metadata: { confirmed_sessions: 3 },
    });
    store.updateTrustScore(id, 0.5);

    const result = await promoter.runPromotion();
    const toSemantic = result.promotions.filter(
      (p) => p.entryId === id && p.to === 'semantic',
    );
    expect(toSemantic.length).toBe(0);
  });

  it('promotes behavioral episodic -> procedural when accessCount >= 5', async () => {
    const id = await store.store({
      content: 'behavioral pattern',
      layer: 'episodic',
      source: 'behavioral',
    });
    // Simulate 5 accesses
    for (let i = 0; i < 5; i++) {
      await store.recall('behavioral pattern', { layers: ['episodic'] });
    }

    const result = await promoter.runPromotion();
    const promotion = result.promotions.find((p) => p.entryId === id);
    expect(promotion).toBeDefined();
    expect(promotion!.to).toBe('procedural');
  });

  it('archives when trust < 0.15', async () => {
    const id = await store.store({
      content: 'very low trust',
      layer: 'episodic',
      source: 'user',
    });
    store.updateTrustScore(id, 0.1);

    const result = await promoter.runPromotion();
    const archivePromotion = result.promotions.find(
      (p) => p.entryId === id && p.to === 'archived',
    );
    expect(archivePromotion).toBeDefined();
  });

  it('checkEntry returns matching rule', async () => {
    const id = await store.store({ content: 'check me', layer: 'working', source: 'user' });
    // Simulate 3 accesses
    await store.recall('check me', { layers: ['working'] });
    await store.recall('check me', { layers: ['working'] });
    await store.recall('check me', { layers: ['working'] });

    const entry = store.getById(id)!;
    const rule = promoter.checkEntry(entry);
    expect(rule).not.toBeNull();
    expect(rule!.to).toBe('episodic');
  });

  it('checkEntry returns null when no match', async () => {
    const id = await store.store({ content: 'no match', layer: 'working', source: 'user' });
    store.updateTrustScore(id, 0.5);
    const entry = store.getById(id)!;
    const rule = promoter.checkEntry(entry);
    expect(rule).toBeNull();
  });

  it('emits memory:promoted event', async () => {
    const captured = createEventSpy(eventBus);
    const id = await store.store({ content: 'promo event', layer: 'working', source: 'user' });
    await store.recall('promo event', { layers: ['working'] });
    await store.recall('promo event', { layers: ['working'] });
    await store.recall('promo event', { layers: ['working'] });

    await promoter.runPromotion();
    const promoEvent = captured.find((e) => e.type === 'memory:promoted');
    expect(promoEvent).toBeDefined();
  });

  it('getRules returns all rules', () => {
    expect(promoter.getRules().length).toBe(6);
  });
});

describe('createPromoter factory', () => {
  it('returns Promoter instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const store2 = new MemoryStoreImpl(db2, eb2);
    const ts = new TrustScorerImpl();
    const p = createPromoter(store2, ts, eb2);
    expect(p).toBeDefined();
    expect(typeof p.runPromotion).toBe('function');
    expect(typeof p.getRules).toBe('function');
    expect(typeof p.checkEntry).toBe('function');
  });
});
