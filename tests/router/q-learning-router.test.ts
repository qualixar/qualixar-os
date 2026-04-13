/**
 * Qualixar OS V2 -- QLearningRouter Unit Tests
 *
 * Tests for the meta-learner that selects which routing strategy
 * to use per task type via epsilon-greedy Q-learning (bandit formulation).
 *
 * Source of truth: Phase 1 LLD Section 2.9.
 * TDD Phase: RED -> GREEN
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import { QLearningRouter } from '../../src/router/q-learning-router.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Available strategy names matching LLD ACTIONS list. */
const ALL_STRATEGIES = ['cascade', 'cheapest', 'quality', 'balanced', 'pomdp'];

describe('QLearningRouter', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let router: QLearningRouter;

  beforeEach(() => {
    db = createDatabase(':memory:');
    eventBus = createEventBus(db);
    router = new QLearningRouter(db, eventBus);
  });

  // -------------------------------------------------------------------------
  // 1. selectStrategy returns a valid strategy name
  // -------------------------------------------------------------------------
  it('selectStrategy returns a valid strategy name', () => {
    const result = router.selectStrategy('code', 5, 3.0);

    expect(ALL_STRATEGIES).toContain(result);
  });

  // -------------------------------------------------------------------------
  // 2. selectStrategy with high epsilon explores randomly
  // -------------------------------------------------------------------------
  it('selectStrategy with high epsilon explores randomly', () => {
    // With default EPSILON_START = 0.3, run many trials.
    // At least some should differ if exploration is happening.
    // Force exploration by mocking Math.random to return < EPSILON.
    const originalRandom = Math.random;
    try {
      // Always explore (random < 0.3)
      Math.random = vi.fn(() => 0.1);

      const results = new Set<string>();
      // Multiple calls -- with randomness mocked to always return 0.1
      // for the exploration check, but the action selection within
      // exploration also uses Math.random. We need to vary that.
      // Re-mock to cycle through values for action selection.
      let callCount = 0;
      Math.random = vi.fn(() => {
        callCount++;
        // Odd calls: exploration check (return < epsilon to explore)
        // Even calls: action selection
        if (callCount % 2 === 1) return 0.1; // explore
        return (callCount / 100) % 1; // varying action pick
      });

      for (let i = 0; i < 50; i++) {
        results.add(router.selectStrategy(`task_${i}`, 5, 3.0));
      }

      // With random exploration, we expect at least 2 different strategies
      expect(results.size).toBeGreaterThanOrEqual(2);
    } finally {
      Math.random = originalRandom;
    }
  });

  // -------------------------------------------------------------------------
  // 3. recordReward updates Q-value
  // -------------------------------------------------------------------------
  it('recordReward updates Q-value correctly', () => {
    // Record a reward for a specific state-action pair
    router.recordReward('code', 5, 3.0, 'cascade', 0.9);

    const qTable = router.getQTable();

    // At least one state should have a non-zero Q-value for cascade
    const hasNonZeroValue = Object.values(qTable).some(
      (actions) => (actions['cascade'] ?? 0) > 0,
    );
    expect(hasNonZeroValue).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Q-values persist across instances (via DB)
  // -------------------------------------------------------------------------
  it('Q-values persist across instances via DB', () => {
    // Record exactly 20 rewards so persistence triggers at episodes 10 and 20.
    // The final persist at episode 20 captures the exact state.
    for (let i = 0; i < 20; i++) {
      router.recordReward('code', 5, 3.0, 'quality', 0.8);
    }

    // Get the current Q-table (state right after episode 20 persist)
    const qTableBefore = router.getQTable();

    // Create a new instance from the same DB
    const router2 = new QLearningRouter(db, eventBus);
    const qTableAfter = router2.getQTable();

    // The new instance should have the same Q-values
    expect(qTableAfter).toEqual(qTableBefore);
  });

  // -------------------------------------------------------------------------
  // 5. epsilon does NOT decay in selectStrategy (H-03 fix: only in recordReward)
  // -------------------------------------------------------------------------
  it('epsilon does NOT decay in selectStrategy (only in recordReward)', () => {
    const epsilonBefore = router.getEpsilon();

    router.selectStrategy('code', 5, 3.0);

    const epsilonAfter = router.getEpsilon();
    expect(epsilonAfter).toBe(epsilonBefore);
  });

  // -------------------------------------------------------------------------
  // 6. exploitation selects highest Q-value strategy
  // -------------------------------------------------------------------------
  it('exploitation selects highest Q-value strategy', () => {
    // Train the router to strongly prefer 'quality' for task type 'code'
    for (let i = 0; i < 30; i++) {
      router.recordReward('code', 5, 3.0, 'quality', 1.0);
      router.recordReward('code', 5, 3.0, 'cascade', 0.1);
      router.recordReward('code', 5, 3.0, 'cheapest', 0.1);
    }

    // Force exploitation by mocking Math.random > epsilon
    const originalRandom = Math.random;
    try {
      Math.random = vi.fn(() => 0.99); // always exploit

      const result = router.selectStrategy('code', 5, 3.0);

      expect(result).toBe('quality');
    } finally {
      Math.random = originalRandom;
    }
  });

  // -------------------------------------------------------------------------
  // 7. getQTable returns current Q-values
  // -------------------------------------------------------------------------
  it('getQTable returns current Q-values as a plain object', () => {
    // Initially empty
    const qTable = router.getQTable();
    expect(typeof qTable).toBe('object');

    // After recording
    router.recordReward('code', 5, 3.0, 'cascade', 0.7);
    const qTableAfter = router.getQTable();

    // Should have at least one state entry
    const states = Object.keys(qTableAfter);
    expect(states.length).toBeGreaterThanOrEqual(1);

    // Each state should have action -> Q-value entries
    for (const state of states) {
      expect(typeof qTableAfter[state]).toBe('object');
      const actions = Object.keys(qTableAfter[state]);
      for (const action of actions) {
        expect(typeof qTableAfter[state][action]).toBe('number');
      }
    }
  });

  // -------------------------------------------------------------------------
  // 8. getEpsilon returns current exploration rate
  // -------------------------------------------------------------------------
  it('getEpsilon returns a number within valid range', () => {
    const epsilon = router.getEpsilon();
    expect(epsilon).toBeGreaterThanOrEqual(0.05); // EPSILON_MIN
    expect(epsilon).toBeLessThanOrEqual(0.3);     // EPSILON_START
  });

  // -------------------------------------------------------------------------
  // 9. epsilon does not decay below EPSILON_MIN
  // -------------------------------------------------------------------------
  it('epsilon does not decay below EPSILON_MIN', () => {
    // Run many selections to decay epsilon
    for (let i = 0; i < 500; i++) {
      router.selectStrategy(`task_${i % 10}`, 5, 3.0);
    }

    expect(router.getEpsilon()).toBeGreaterThanOrEqual(0.05);
  });

  // -------------------------------------------------------------------------
  // 10. Q-update uses GAMMA=0 bandit formulation (ALPHA * (reward - Q))
  // -------------------------------------------------------------------------
  it('Q-update uses bandit formulation with GAMMA=0', () => {
    // With GAMMA=0: Q(s,a) += ALPHA * (reward - Q(s,a))
    // First update from 0: Q = 0 + 0.1 * (1.0 - 0) = 0.1
    router.recordReward('code', 5, 3.0, 'cascade', 1.0);

    const qTable = router.getQTable();
    const states = Object.keys(qTable);
    expect(states.length).toBeGreaterThanOrEqual(1);

    // Find the state and check the Q-value is approximately ALPHA * reward
    const stateEntry = Object.values(qTable)[0];
    expect(stateEntry['cascade']).toBeCloseTo(0.1, 5); // ALPHA=0.1 * (1.0 - 0)
  });

  // -------------------------------------------------------------------------
  // 11. constructor handles empty DB gracefully
  // -------------------------------------------------------------------------
  it('constructor handles empty DB gracefully (no persisted Q-table)', () => {
    // Fresh DB with no prior rl:update events
    const freshDb = createDatabase(':memory:');
    const freshBus = createEventBus(freshDb);
    const freshRouter = new QLearningRouter(freshDb, freshBus);

    expect(freshRouter.getQTable()).toEqual({});
    expect(freshRouter.getEpsilon()).toBe(0.3);

    freshDb.close();
  });
});
