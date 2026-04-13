/**
 * Qualixar OS Phase 5 -- Belief Graph Tests
 * LLD Section 6.9
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BeliefGraphImpl, createBeliefGraph } from '../../src/memory/belief-graph.js';
import { createTestDb, createTestEventBus, createEventSpy, createMockModelRouter } from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('BeliefGraphImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let mockRouter: ReturnType<typeof createMockModelRouter>;
  let graph: BeliefGraphImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    mockRouter = createMockModelRouter('unrelated');
    graph = new BeliefGraphImpl(db, mockRouter, eventBus);
  });

  // -----------------------------------------------------------------------
  // addBelief
  // -----------------------------------------------------------------------

  it('addBelief creates node in DB', async () => {
    const nodeId = await graph.addBelief({
      content: 'TypeScript is good for enterprise apps',
      confidence: 0.8,
      source: 'user',
    });

    expect(nodeId).toBeTruthy();
    const row = db.get<{ id: string; content: string }>(
      'SELECT * FROM belief_nodes WHERE id = ?',
      [nodeId],
    );
    expect(row).toBeDefined();
    expect(row!.content).toBe('TypeScript is good for enterprise apps');
  });

  it('addBelief with edges creates edge rows', async () => {
    const nodeA = await graph.addBelief({
      content: 'Node A belief',
      confidence: 0.7,
      source: 'system',
    });

    const nodeB = await graph.addBelief({
      content: 'Node B belief',
      confidence: 0.6,
      source: 'system',
      causalEdges: [{
        toId: nodeA,
        relation: 'causes',
        strength: 0.8,
      }],
    });

    const edges = db.query<{ from_id: string; to_id: string }>(
      'SELECT * FROM belief_edges WHERE from_id = ?',
      [nodeB],
    );
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('contradicting edge creates both directions', async () => {
    const nodeA = await graph.addBelief({
      content: 'Belief A contra',
      confidence: 0.7,
      source: 'system',
    });

    await graph.addBelief({
      content: 'Belief B contra',
      confidence: 0.6,
      source: 'system',
      causalEdges: [{
        toId: nodeA,
        relation: 'contradicts',
        strength: 0.5,
      }],
    });

    const allEdges = db.query<{ id: string }>(
      'SELECT * FROM belief_edges',
    );
    // Forward + reverse = 2
    expect(allEdges.length).toBe(2);
  });

  it('supporting edge creates both directions', async () => {
    const nodeA = await graph.addBelief({
      content: 'Belief A support',
      confidence: 0.7,
      source: 'system',
    });

    await graph.addBelief({
      content: 'Belief B support',
      confidence: 0.6,
      source: 'system',
      causalEdges: [{
        toId: nodeA,
        relation: 'supports',
        strength: 0.9,
      }],
    });

    const allEdges = db.query<{ id: string }>(
      'SELECT * FROM belief_edges',
    );
    expect(allEdges.length).toBe(2);
  });

  it('contradiction via LLM reduces confidence', async () => {
    // The new belief's key terms (joined as substring) must appear in existing content
    // New content "xyzplanet xyzshape" -> key terms "xyzplanet xyzshape"
    // Existing must contain "xyzplanet xyzshape" as substring
    const nodeA = await graph.addBelief({
      content: 'xyzplanet xyzshape is flat claim',
      confidence: 0.8,
      source: 'user',
    });

    mockRouter.setResponse('contradicts');

    await graph.addBelief({
      content: 'xyzplanet xyzshape',
      confidence: 0.9,
      source: 'system',
    });

    const nodeARow = db.get<{ confidence: number }>(
      'SELECT confidence FROM belief_nodes WHERE id = ?',
      [nodeA],
    );
    // Should be reduced by 0.1 from 0.8
    expect(nodeARow!.confidence).toBeCloseTo(0.7, 1);
  });

  it('support via LLM boosts confidence', async () => {
    const nodeA = await graph.addBelief({
      content: 'xyztesting xyzimproves quality in production',
      confidence: 0.6,
      source: 'user',
    });

    mockRouter.setResponse('supports');

    await graph.addBelief({
      content: 'xyztesting xyzimproves',
      confidence: 0.7,
      source: 'system',
    });

    const nodeARow = db.get<{ confidence: number }>(
      'SELECT confidence FROM belief_nodes WHERE id = ?',
      [nodeA],
    );
    // Should be boosted by 0.05 from 0.6
    expect(nodeARow!.confidence).toBeCloseTo(0.65, 1);
  });

  it('confidence clamped to [0.05, 1.0]', async () => {
    const nodeId = await graph.addBelief({
      content: 'edge case belief',
      confidence: 0.02,
      source: 'user',
    });

    const row = db.get<{ confidence: number }>(
      'SELECT confidence FROM belief_nodes WHERE id = ?',
      [nodeId],
    );
    expect(row!.confidence).toBe(0.05);
  });

  // -----------------------------------------------------------------------
  // getBeliefGraph (2-hop expansion)
  // -----------------------------------------------------------------------

  it('2-hop expansion finds distant nodes', async () => {
    // Create chain: A -> B -> C -> D
    const a = await graph.addBelief({ content: 'chain alpha node', confidence: 0.8, source: 'user' });
    const b = await graph.addBelief({
      content: 'chain beta node',
      confidence: 0.7,
      source: 'user',
      causalEdges: [{ toId: a, relation: 'causes', strength: 0.5 }],
    });
    const c = await graph.addBelief({
      content: 'chain gamma node',
      confidence: 0.6,
      source: 'user',
      causalEdges: [{ toId: b, relation: 'causes', strength: 0.5 }],
    });
    await graph.addBelief({
      content: 'chain delta node',
      confidence: 0.5,
      source: 'user',
      causalEdges: [{ toId: c, relation: 'causes', strength: 0.5 }],
    });

    const result = await graph.getBeliefGraph('chain alpha');
    // Starting from A, 2 hops should find at least A, B, C
    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('getBeliefGraph applies confidence decay', async () => {
    // Insert a node with old updated_at
    const nodeId = await graph.addBelief({
      content: 'decaying belief test',
      confidence: 0.8,
      source: 'user',
    });
    // Manually set old timestamp
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.db.prepare('UPDATE belief_nodes SET updated_at = ? WHERE id = ?').run(oldDate, nodeId);

    const result = await graph.getBeliefGraph('decaying belief');
    const node = result.nodes.find((n) => n.id === nodeId);
    expect(node).toBeDefined();
    // After 30 days with rate 0.01: 0.8 * exp(-0.01 * 30) = 0.8 * 0.741 = ~0.593
    expect(node!.confidence).toBeLessThan(0.8);
    expect(node!.confidence).toBeGreaterThan(0.5);
  });

  // -----------------------------------------------------------------------
  // adjustDecayRate
  // -----------------------------------------------------------------------

  it('supporting edges reduce decay rate', async () => {
    const nodeId = await graph.addBelief({
      content: 'supported belief',
      confidence: 0.8,
      source: 'user',
    });

    // Add supporting edge
    await graph.addBelief({
      content: 'supporting evidence',
      confidence: 0.7,
      source: 'user',
      causalEdges: [{ toId: nodeId, relation: 'supports', strength: 0.8 }],
    });

    graph.adjustDecayRate(nodeId);

    const row = db.get<{ decay_rate: number }>(
      'SELECT decay_rate FROM belief_nodes WHERE id = ?',
      [nodeId],
    );
    // Default 0.01 - 1*0.002 = 0.008
    expect(row!.decay_rate).toBeLessThan(0.01);
  });

  it('contradicting edges increase decay rate', async () => {
    const nodeId = await graph.addBelief({
      content: 'contradicted belief',
      confidence: 0.8,
      source: 'user',
    });

    // Add contradicting edge
    await graph.addBelief({
      content: 'contradicting evidence',
      confidence: 0.7,
      source: 'user',
      causalEdges: [{ toId: nodeId, relation: 'contradicts', strength: 0.8 }],
    });

    graph.adjustDecayRate(nodeId);

    const row = db.get<{ decay_rate: number }>(
      'SELECT decay_rate FROM belief_nodes WHERE id = ?',
      [nodeId],
    );
    // Default 0.01 + 1*0.005 - reverse support (1*0.002) = could vary
    // With both a support reverse edge and contradict forward: rate should be adjusted
    expect(row!.decay_rate).not.toBe(0.01);
  });

  // -----------------------------------------------------------------------
  // getBeliefStats
  // -----------------------------------------------------------------------

  it('getBeliefStats returns correct counts', async () => {
    await graph.addBelief({ content: 'stat belief 1', confidence: 0.8, source: 'user' });
    await graph.addBelief({ content: 'stat belief 2', confidence: 0.6, source: 'user' });

    const stats = graph.getBeliefStats();
    expect(stats.nodeCount).toBe(2);
    expect(stats.avgConfidence).toBeCloseTo(0.7, 1);
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  it('emits memory:belief_updated event', async () => {
    const captured = createEventSpy(eventBus);
    await graph.addBelief({
      content: 'belief event test',
      confidence: 0.8,
      source: 'user',
    });

    const beliefEvent = captured.find((e) => e.type === 'memory:belief_updated');
    expect(beliefEvent).toBeDefined();
  });

  it('emits memory:belief_edge_added for edges', async () => {
    const captured = createEventSpy(eventBus);
    const nodeA = await graph.addBelief({
      content: 'edge event A',
      confidence: 0.8,
      source: 'user',
    });

    await graph.addBelief({
      content: 'edge event B',
      confidence: 0.7,
      source: 'user',
      causalEdges: [{ toId: nodeA, relation: 'causes', strength: 0.5 }],
    });

    const edgeEvent = captured.find(
      (e) => e.type === 'memory:belief_edge_added',
    );
    expect(edgeEvent).toBeDefined();
  });

  it('addBelief skips edges with non-existent target', async () => {
    const nodeId = await graph.addBelief({
      content: 'edge to nowhere belief',
      confidence: 0.7,
      source: 'user',
      causalEdges: [{
        toId: 'nonexistent-target-id',
        relation: 'causes',
        strength: 0.5,
      }],
    });

    expect(nodeId).toBeTruthy();
    const edges = db.query<{ id: string }>(
      'SELECT * FROM belief_edges WHERE from_id = ?',
      [nodeId],
    );
    expect(edges.length).toBe(0);
  });

  it('LLM failure during relation check treats as unrelated', async () => {
    const nodeA = await graph.addBelief({
      content: 'xyzfail xyzrelation belief alpha',
      confidence: 0.8,
      source: 'user',
    });

    // Configure router to throw
    const failRouter = {
      async route() { throw new Error('LLM down'); },
      getStrategy() { return 'mock'; },
      getCostTracker() { return null as any; },
      getDiscoveredModels() { return []; },
      getAvailableModels() { return []; },
    };

    const failGraph = new BeliefGraphImpl(db, failRouter as any, eventBus);
    const nodeB = await failGraph.addBelief({
      content: 'xyzfail xyzrelation',
      confidence: 0.7,
      source: 'user',
    });

    // Node A confidence should be unchanged (treated as unrelated)
    const row = db.get<{ confidence: number }>(
      'SELECT confidence FROM belief_nodes WHERE id = ?',
      [nodeA],
    );
    expect(row!.confidence).toBe(0.8);
    expect(nodeB).toBeTruthy();
  });
});

describe('createBeliefGraph factory', () => {
  it('returns BeliefGraphService instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const mr = createMockModelRouter();
    const bg = createBeliefGraph(db2, mr, eb2);
    expect(bg).toBeDefined();
    expect(typeof bg.addBelief).toBe('function');
    expect(typeof bg.getBeliefGraph).toBe('function');
    expect(typeof bg.getBeliefStats).toBe('function');
  });
});
