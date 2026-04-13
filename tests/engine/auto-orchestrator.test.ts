/**
 * Tests for Qualixar OS Auto-Orchestration ML Engine (BO-3)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutoOrchestrator,
  createAutoOrchestrator,
} from '../../src/engine/auto-orchestrator.js';
import type {
  OutcomeRecord,
  AutoOrchestratorDataProvider,
} from '../../src/engine/auto-orchestrator.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeOutcome(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    taskType: 'code',
    strategy: 'balanced',
    topology: 'pipeline',
    judgeScore: 0.85,
    costUsd: 0.05,
    durationMs: 5000,
    approved: true,
    redesignCount: 0,
    createdAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeProvider(
  records: readonly OutcomeRecord[],
): AutoOrchestratorDataProvider {
  return {
    getOutcomes(taskType?: string) {
      if (taskType) {
        return records.filter((r) => r.taskType === taskType);
      }
      return records;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoOrchestrator', () => {
  // ── No data (heuristic fallback) ─────────────────────────────

  describe('with no historical data', () => {
    let orch: AutoOrchestrator;

    beforeEach(() => {
      orch = createAutoOrchestrator(makeProvider([]));
    });

    it('returns heuristic recommendation for single agent', () => {
      const rec = orch.recommendTopology('code', 1, 5);
      expect(rec.topology).toBe('single');
      expect(rec.confidence).toBe(0.3);
      expect(rec.sampleSize).toBe(0);
    });

    it('returns pipeline for 2-3 agents', () => {
      const rec = orch.recommendTopology('code', 3, 5);
      expect(rec.topology).toBe('pipeline');
    });

    it('returns parallel_scatter_gather for 4+ agents', () => {
      const rec = orch.recommendTopology('code', 5, 10);
      expect(rec.topology).toBe('parallel_scatter_gather');
    });

    it('includes task type in reasoning', () => {
      const rec = orch.recommendTopology('research', 2, 5);
      expect(rec.reasoning).toContain('research');
    });

    it('returns empty array for rankTopologies', () => {
      const ranked = orch.rankTopologies('code', 5);
      expect(ranked).toEqual([]);
    });

    it('returns empty array for getStats', () => {
      const stats = orch.getStats('code');
      expect(stats).toEqual([]);
    });
  });

  // ── With historical data ─────────────────────────────────────

  describe('with historical data', () => {
    let orch: AutoOrchestrator;

    const records: OutcomeRecord[] = [
      // Pipeline: 4 runs, 3 approved (75%)
      makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.9, costUsd: 0.04 }),
      makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.8, costUsd: 0.05 }),
      makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.85, costUsd: 0.06 }),
      makeOutcome({ topology: 'pipeline', approved: false, judgeScore: 0.3, costUsd: 0.08 }),
      // Debate: 3 runs, 3 approved (100%)
      makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.95, costUsd: 0.10 }),
      makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.92, costUsd: 0.12 }),
      makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.90, costUsd: 0.11 }),
      // Single: 2 runs, 1 approved (50%)
      makeOutcome({ topology: 'single', approved: true, judgeScore: 0.70, costUsd: 0.02 }),
      makeOutcome({ topology: 'single', approved: false, judgeScore: 0.40, costUsd: 0.01 }),
    ];

    beforeEach(() => {
      orch = createAutoOrchestrator(makeProvider(records));
    });

    it('recommends the topology with best overall score', () => {
      const rec = orch.recommendTopology('code', 4, 1.0);
      // Debate has 100% success and high judge scores
      expect(rec.topology).toBe('debate');
      expect(rec.confidence).toBeGreaterThan(0.5);
      expect(rec.historicalSuccessRate).toBe(1);
    });

    it('respects agent count constraint (1 agent = single)', () => {
      const rec = orch.recommendTopology('code', 1, 1.0);
      expect(rec.topology).toBe('single');
    });

    it('respects agent count constraint (2 agents, complex topology)', () => {
      // Create data where mesh is best
      const meshRecords = [
        makeOutcome({ topology: 'mesh', approved: true, judgeScore: 0.99 }),
        makeOutcome({ topology: 'mesh', approved: true, judgeScore: 0.98 }),
        makeOutcome({ topology: 'mesh', approved: true, judgeScore: 0.97 }),
      ];
      const orch2 = createAutoOrchestrator(makeProvider(meshRecords));
      const rec = orch2.recommendTopology('code', 2, 1.0);
      // mesh not feasible for 2 agents, should fallback to pipeline
      expect(rec.topology).toBe('pipeline');
    });

    it('provides sample size in recommendation', () => {
      const rec = orch.recommendTopology('code', 4, 1.0);
      expect(rec.sampleSize).toBeGreaterThan(0);
    });

    it('includes average cost', () => {
      const rec = orch.recommendTopology('code', 4, 1.0);
      expect(rec.avgCostUsd).toBeGreaterThan(0);
    });
  });

  // ── getStats ─────────────────────────────────────────────────

  describe('getStats', () => {
    it('aggregates stats by topology and task type', () => {
      const records = [
        makeOutcome({ topology: 'pipeline', taskType: 'code' }),
        makeOutcome({ topology: 'pipeline', taskType: 'code' }),
        makeOutcome({ topology: 'debate', taskType: 'research' }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const stats = orch.getStats();
      expect(stats).toHaveLength(2);
    });

    it('filters by task type', () => {
      const records = [
        makeOutcome({ topology: 'pipeline', taskType: 'code' }),
        makeOutcome({ topology: 'debate', taskType: 'research' }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const stats = orch.getStats('code');
      expect(stats).toHaveLength(1);
      expect(stats[0].taskType).toBe('code');
    });

    it('calculates correct success rate', () => {
      const records = [
        makeOutcome({ approved: true }),
        makeOutcome({ approved: true }),
        makeOutcome({ approved: false }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const stats = orch.getStats();
      expect(stats[0].successRate).toBeCloseTo(2 / 3, 5);
    });

    it('calculates correct averages', () => {
      const records = [
        makeOutcome({ judgeScore: 0.8, costUsd: 0.10, durationMs: 1000, redesignCount: 1 }),
        makeOutcome({ judgeScore: 0.6, costUsd: 0.20, durationMs: 3000, redesignCount: 3 }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const stats = orch.getStats();
      expect(stats[0].avgJudgeScore).toBeCloseTo(0.7, 5);
      expect(stats[0].avgCostUsd).toBeCloseTo(0.15, 5);
      expect(stats[0].avgDurationMs).toBeCloseTo(2000, 5);
      expect(stats[0].avgRedesigns).toBeCloseTo(2, 5);
    });
  });

  // ── rankTopologies ───────────────────────────────────────────

  describe('rankTopologies', () => {
    it('returns topologies sorted by score descending', () => {
      const records = [
        makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.7 }),
        makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.7 }),
        makeOutcome({ topology: 'pipeline', approved: true, judgeScore: 0.7 }),
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.95 }),
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.95 }),
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.95 }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const ranked = orch.rankTopologies('code', 5);
      expect(ranked.length).toBe(2);
      expect(ranked[0].topology).toBe('debate');
    });

    it('includes confidence and reasoning', () => {
      const records = [
        makeOutcome({ topology: 'pipeline' }),
        makeOutcome({ topology: 'pipeline' }),
        makeOutcome({ topology: 'pipeline' }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const ranked = orch.rankTopologies('code', 5);
      expect(ranked[0].confidence).toBeGreaterThan(0);
      expect(ranked[0].reasoning).toBeTruthy();
    });
  });

  // ── Custom weights ───────────────────────────────────────────

  describe('custom weights', () => {
    it('respects custom weight overrides', () => {
      const records = [
        // Cheap but low quality
        makeOutcome({ topology: 'single', approved: true, judgeScore: 0.5, costUsd: 0.001 }),
        makeOutcome({ topology: 'single', approved: true, judgeScore: 0.5, costUsd: 0.001 }),
        makeOutcome({ topology: 'single', approved: true, judgeScore: 0.5, costUsd: 0.001 }),
        // Expensive but high quality
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.99, costUsd: 1.0 }),
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.99, costUsd: 1.0 }),
        makeOutcome({ topology: 'debate', approved: true, judgeScore: 0.99, costUsd: 1.0 }),
      ];

      // Weight cost heavily
      const costWeighted = createAutoOrchestrator(makeProvider(records), {
        weights: { costEfficiency: 0.9, successRate: 0.05, judgeScore: 0.05 },
      });
      const rec = costWeighted.recommendTopology('code', 4, 0.5);
      expect(rec.topology).toBe('single');
    });
  });

  // ── Custom minSamples ────────────────────────────────────────

  describe('custom minSamples', () => {
    it('affects confidence calculation', () => {
      const records = [makeOutcome()];
      const strict = createAutoOrchestrator(makeProvider(records), {
        minSamples: 100,
      });
      const rec = strict.recommendTopology('code', 4, 5);
      // Low confidence because 1 sample vs 100 minimum
      expect(rec.confidence).toBeLessThan(0.5);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles zero budget gracefully', () => {
      const records = [
        makeOutcome(),
        makeOutcome(),
        makeOutcome(),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const rec = orch.recommendTopology('code', 4, 0);
      expect(rec.topology).toBeTruthy();
    });

    it('handles all-failed outcomes', () => {
      const records = [
        makeOutcome({ approved: false, judgeScore: 0.1 }),
        makeOutcome({ approved: false, judgeScore: 0.2 }),
        makeOutcome({ approved: false, judgeScore: 0.1 }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const rec = orch.recommendTopology('code', 4, 5);
      expect(rec.historicalSuccessRate).toBe(0);
    });

    it('handles very high redesign counts', () => {
      const records = [
        makeOutcome({ redesignCount: 50 }),
        makeOutcome({ redesignCount: 50 }),
        makeOutcome({ redesignCount: 50 }),
      ];
      const orch = createAutoOrchestrator(makeProvider(records));
      const rec = orch.recommendTopology('code', 4, 5);
      expect(rec.topology).toBeTruthy();
    });
  });
});
