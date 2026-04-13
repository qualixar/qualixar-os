/**
 * Tests for Qualixar OS Graceful Degradation Engine (BO-2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DegradationEngine,
  createDegradationEngine,
} from '../../src/engine/degradation.js';
import type {
  DegradationTier,
  DegradationRecommendation,
} from '../../src/engine/degradation.js';

describe('DegradationEngine', () => {
  let engine: DegradationEngine;

  beforeEach(() => {
    engine = createDegradationEngine();
  });

  // ── Construction ─────────────────────────────────────────────

  describe('construction', () => {
    it('creates engine with default tier definitions', () => {
      const tiers = engine.getTierDefinitions();
      expect(tiers).toHaveLength(4);
      expect(tiers[0].name).toBe('autonomous_swarm');
      expect(tiers[3].name).toBe('human_in_loop');
    });

    it('accepts custom tier definitions', () => {
      const custom: DegradationTier[] = [
        {
          name: 'autonomous_swarm',
          description: 'test',
          failureThreshold: 0,
          allowedTopologies: ['all'],
        },
        {
          name: 'human_in_loop',
          description: 'test',
          failureThreshold: 1,
          allowedTopologies: ['single'],
        },
      ];
      const customEngine = new DegradationEngine(custom);
      expect(customEngine.getTierDefinitions()).toHaveLength(2);
    });
  });

  // ── suggestDegradation ───────────────────────────────────────

  describe('suggestDegradation', () => {
    it('returns autonomous_swarm for 0 failures', () => {
      const rec = engine.suggestDegradation('pipeline', 0);
      expect(rec.tier.name).toBe('autonomous_swarm');
      expect(rec.changed).toBe(false);
    });

    it('returns autonomous_swarm for 1 failure', () => {
      const rec = engine.suggestDegradation('pipeline', 1);
      expect(rec.tier.name).toBe('autonomous_swarm');
    });

    it('returns deterministic_graph for 2 failures', () => {
      const rec = engine.suggestDegradation('pipeline', 2);
      expect(rec.tier.name).toBe('deterministic_graph');
      expect(rec.changed).toBe(true);
    });

    it('returns single_agent for 4 failures', () => {
      const rec = engine.suggestDegradation('pipeline', 4);
      expect(rec.tier.name).toBe('single_agent');
    });

    it('returns human_in_loop for 6 failures', () => {
      const rec = engine.suggestDegradation('pipeline', 6);
      expect(rec.tier.name).toBe('human_in_loop');
    });

    it('stays at human_in_loop for >6 failures', () => {
      const rec = engine.suggestDegradation('pipeline', 100);
      expect(rec.tier.name).toBe('human_in_loop');
    });

    it('tracks different topologies independently', () => {
      engine.suggestDegradation('pipeline', 4);
      const rec = engine.suggestDegradation('mesh', 0);
      expect(rec.tier.name).toBe('autonomous_swarm');
    });

    it('includes reasoning in the recommendation', () => {
      const rec = engine.suggestDegradation('pipeline', 3);
      expect(rec.reasoning).toContain('pipeline');
    });

    it('reports changed=true on tier transition', () => {
      // First call at tier 0
      engine.suggestDegradation('test', 0);
      // Jump to tier 1
      const rec = engine.suggestDegradation('test', 2);
      expect(rec.changed).toBe(true);
      expect(rec.previousTierName).toBe('autonomous_swarm');
    });

    it('reports changed=false when staying at same tier', () => {
      engine.suggestDegradation('test', 3);
      const rec = engine.suggestDegradation('test', 3);
      expect(rec.changed).toBe(false);
    });
  });

  // ── recordFailure / recordSuccess ────────────────────────────

  describe('recordFailure', () => {
    it('increments failure count and returns recommendation', () => {
      const rec1 = engine.recordFailure('pipeline');
      expect(rec1.tier.name).toBe('autonomous_swarm'); // 1 failure

      const rec2 = engine.recordFailure('pipeline');
      expect(rec2.tier.name).toBe('deterministic_graph'); // 2 failures
    });

    it('accumulates failures across calls', () => {
      for (let i = 0; i < 6; i++) {
        engine.recordFailure('debate');
      }
      const tier = engine.getCurrentTier('debate');
      expect(tier.name).toBe('human_in_loop');
    });
  });

  describe('recordSuccess', () => {
    it('resets failure count to 0', () => {
      engine.recordFailure('pipeline');
      engine.recordFailure('pipeline');
      engine.recordFailure('pipeline');
      engine.recordSuccess('pipeline');

      const counts = engine.getFailureCounts();
      expect(counts.get('pipeline')).toBe(0);
    });

    it('resets tier to autonomous_swarm', () => {
      for (let i = 0; i < 5; i++) engine.recordFailure('pipeline');
      engine.recordSuccess('pipeline');
      expect(engine.getCurrentTier('pipeline').name).toBe('autonomous_swarm');
    });
  });

  // ── getCurrentTier ───────────────────────────────────────────

  describe('getCurrentTier', () => {
    it('returns autonomous_swarm for unknown topology', () => {
      expect(engine.getCurrentTier('unknown').name).toBe('autonomous_swarm');
    });

    it('reflects the latest suggestion', () => {
      engine.suggestDegradation('test', 5);
      expect(engine.getCurrentTier('test').name).toBe('single_agent');
    });
  });

  // ── requiresHuman ────────────────────────────────────────────

  describe('requiresHuman', () => {
    it('returns false for autonomous tiers', () => {
      expect(engine.requiresHuman('pipeline')).toBe(false);
    });

    it('returns true after enough failures', () => {
      for (let i = 0; i < 6; i++) engine.recordFailure('pipeline');
      expect(engine.requiresHuman('pipeline')).toBe(true);
    });
  });

  // ── getFailureCounts ─────────────────────────────────────────

  describe('getFailureCounts', () => {
    it('returns empty map initially', () => {
      expect(engine.getFailureCounts().size).toBe(0);
    });

    it('returns immutable copy', () => {
      engine.recordFailure('test');
      const counts = engine.getFailureCounts();
      expect(counts.get('test')).toBe(1);
      // Original map should not be the same reference
      expect(counts).not.toBe(engine.getFailureCounts());
    });
  });

  // ── reset ────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state', () => {
      engine.recordFailure('a');
      engine.recordFailure('b');
      engine.reset();
      expect(engine.getFailureCounts().size).toBe(0);
      expect(engine.getCurrentTier('a').name).toBe('autonomous_swarm');
    });
  });

  // ── Tier allowed topologies ──────────────────────────────────

  describe('tier allowed topologies', () => {
    it('autonomous_swarm allows many topologies', () => {
      const tier = engine.getTierDefinitions()[0];
      expect(tier.allowedTopologies.length).toBeGreaterThan(5);
    });

    it('single_agent allows only single', () => {
      const tier = engine.getTierDefinitions()[2];
      expect(tier.allowedTopologies).toEqual(['single']);
    });

    it('human_in_loop allows only single', () => {
      const tier = engine.getTierDefinitions()[3];
      expect(tier.allowedTopologies).toEqual(['single']);
    });
  });

  // ── Frozen recommendations ───────────────────────────────────

  describe('immutability', () => {
    it('recommendation object is frozen', () => {
      const rec = engine.suggestDegradation('test', 0);
      expect(Object.isFrozen(rec)).toBe(true);
    });
  });
});
