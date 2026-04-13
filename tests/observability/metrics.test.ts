/**
 * Qualixar OS Phase 9 — Metrics Tests
 * TDD: Tests written first, then implementation.
 *
 * Strategy: Use real OTEL API (noop meter by default).
 * Verify internal tracking and getMetrics() correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, type MetricsSummary } from '../../src/observability/metrics.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  // -----------------------------------------------------------------------
  // incrementTaskCount
  // -----------------------------------------------------------------------
  describe('incrementTaskCount', () => {
    it('increments count for a task type', () => {
      collector.incrementTaskCount('code-gen', 'completed');

      const summary = collector.getMetrics();
      expect(summary.taskCount['code-gen']).toBe(1);
    });

    it('accumulates multiple increments for the same type', () => {
      collector.incrementTaskCount('code-gen', 'completed');
      collector.incrementTaskCount('code-gen', 'failed');
      collector.incrementTaskCount('code-gen', 'completed');

      const summary = collector.getMetrics();
      expect(summary.taskCount['code-gen']).toBe(3);
    });

    it('tracks independent task types separately', () => {
      collector.incrementTaskCount('code-gen', 'completed');
      collector.incrementTaskCount('review', 'completed');
      collector.incrementTaskCount('review', 'completed');

      const summary = collector.getMetrics();
      expect(summary.taskCount['code-gen']).toBe(1);
      expect(summary.taskCount['review']).toBe(2);
    });

    it('tracks approval rate from approved vs total judged', () => {
      collector.incrementTaskCount('code-gen', 'approved');
      collector.incrementTaskCount('code-gen', 'approved');
      collector.incrementTaskCount('code-gen', 'rejected');
      collector.incrementTaskCount('code-gen', 'completed');

      const summary = collector.getMetrics();
      // approved=2, total terminal (approved+rejected+completed)=4
      expect(summary.approvalRate).toBeCloseTo(0.5, 5);
    });

    it('returns 0 approval rate when no tasks judged', () => {
      const summary = collector.getMetrics();
      expect(summary.approvalRate).toBe(0);
    });

    it('handles single approved task correctly', () => {
      collector.incrementTaskCount('test', 'approved');

      const summary = collector.getMetrics();
      expect(summary.approvalRate).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // recordLatency
  // -----------------------------------------------------------------------
  describe('recordLatency', () => {
    it('records latency for an operation', () => {
      collector.recordLatency('model-call', 150);

      const summary = collector.getMetrics();
      expect(summary.avgLatencyMs['model-call']).toBe(150);
    });

    it('computes average across multiple records', () => {
      collector.recordLatency('model-call', 100);
      collector.recordLatency('model-call', 200);
      collector.recordLatency('model-call', 300);

      const summary = collector.getMetrics();
      expect(summary.avgLatencyMs['model-call']).toBe(200);
    });

    it('tracks independent operations separately', () => {
      collector.recordLatency('model-call', 100);
      collector.recordLatency('judge', 50);

      const summary = collector.getMetrics();
      expect(summary.avgLatencyMs['model-call']).toBe(100);
      expect(summary.avgLatencyMs['judge']).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // recordCost
  // -----------------------------------------------------------------------
  describe('recordCost', () => {
    it('accumulates total cost', () => {
      collector.recordCost('gpt-4o', 0.05);
      collector.recordCost('claude-sonnet', 0.03);

      const summary = collector.getMetrics();
      expect(summary.totalCostUsd).toBeCloseTo(0.08, 10);
    });

    it('starts at zero', () => {
      const summary = collector.getMetrics();
      expect(summary.totalCostUsd).toBe(0);
    });

    it('handles many small increments without floating-point drift', () => {
      for (let i = 0; i < 100; i++) {
        collector.recordCost('model', 0.01);
      }
      const summary = collector.getMetrics();
      expect(summary.totalCostUsd).toBeCloseTo(1.0, 5);
    });
  });

  // -----------------------------------------------------------------------
  // recordAgentCount
  // -----------------------------------------------------------------------
  describe('recordAgentCount', () => {
    it('records agent count without throwing', () => {
      // Agent count is recorded on the OTEL gauge — no internal tracking
      // Just verify it doesn't throw
      expect(() => collector.recordAgentCount('sequential', 3)).not.toThrow();
    });

    it('handles zero count', () => {
      expect(() => collector.recordAgentCount('parallel', 0)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // recordJudgeScore
  // -----------------------------------------------------------------------
  describe('recordJudgeScore', () => {
    it('records judge score without throwing', () => {
      expect(() => collector.recordJudgeScore('quality', 0.95)).not.toThrow();
    });

    it('handles edge scores', () => {
      expect(() => collector.recordJudgeScore('safety', 0.0)).not.toThrow();
      expect(() => collector.recordJudgeScore('safety', 1.0)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // getMetrics (full summary)
  // -----------------------------------------------------------------------
  describe('getMetrics', () => {
    it('returns a complete MetricsSummary with all fields', () => {
      const summary = collector.getMetrics();

      expect(summary).toHaveProperty('taskCount');
      expect(summary).toHaveProperty('avgLatencyMs');
      expect(summary).toHaveProperty('totalCostUsd');
      expect(summary).toHaveProperty('approvalRate');
    });

    it('returns immutable summary (new object each call)', () => {
      collector.incrementTaskCount('a', 'completed');
      const s1 = collector.getMetrics();

      collector.incrementTaskCount('b', 'completed');
      const s2 = collector.getMetrics();

      expect(s1.taskCount).not.toEqual(s2.taskCount);
    });

    it('computes a realistic mixed workload correctly', () => {
      // Simulate a realistic workload
      collector.incrementTaskCount('code-gen', 'approved');
      collector.incrementTaskCount('code-gen', 'approved');
      collector.incrementTaskCount('review', 'rejected');
      collector.recordLatency('model-call', 200);
      collector.recordLatency('model-call', 400);
      collector.recordCost('gpt-4o', 0.10);
      collector.recordCost('claude-sonnet', 0.05);

      const summary = collector.getMetrics();
      expect(summary.taskCount['code-gen']).toBe(2);
      expect(summary.taskCount['review']).toBe(1);
      expect(summary.avgLatencyMs['model-call']).toBe(300);
      expect(summary.totalCostUsd).toBeCloseTo(0.15, 10);
      // 2 approved out of 3 terminal
      expect(summary.approvalRate).toBeCloseTo(2 / 3, 5);
    });
  });
});
