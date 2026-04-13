// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 9 — OpenTelemetry Metrics Collection
 *
 * Wraps OTEL metric instruments with internal tracking so the dashboard
 * and orchestrator can query a synchronous MetricsSummary at any time.
 *
 * @module observability/metrics
 */

import { metrics } from '@opentelemetry/api';
import type {
  Counter,
  Histogram,
  UpDownCounter,
  Meter,
} from '@opentelemetry/api';
import { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of key metrics for the dashboard or orchestrator. */
export interface MetricsSummary {
  /** Task counts keyed by task type. */
  readonly taskCount: Readonly<Record<string, number>>;
  /** Average latency (ms) keyed by operation name. */
  readonly avgLatencyMs: Readonly<Record<string, number>>;
  /** Cumulative cost in USD across all model calls. */
  readonly totalCostUsd: number;
  /** Ratio of approved tasks to total terminal-status tasks (0–1). */
  readonly approvalRate: number;
}

/** Terminal statuses that count toward total judged. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'approved',
  'rejected',
  'completed',
  'failed',
]);

// ---------------------------------------------------------------------------
// Internal tracking types
// ---------------------------------------------------------------------------

interface LatencyBucket {
  sum: number;
  count: number;
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

/**
 * Central metrics collector for Qualixar OS.
 *
 * Records to both OTEL instruments (for export) and internal maps
 * (for synchronous in-process queries via `getMetrics()`).
 */
export class MetricsCollector {
  // OTEL instruments
  private readonly meter: Meter;
  private readonly taskCounter: Counter;
  private readonly latencyHistogram: Histogram;
  private readonly costCounter: Counter;
  private readonly agentGauge: UpDownCounter;
  private readonly judgeScoreHistogram: Histogram;

  // Internal tracking (mirrors OTEL for sync reads)
  private readonly taskCounts: Map<string, number> = new Map();
  private readonly latencyBuckets: Map<string, LatencyBucket> = new Map();
  private totalCost = 0;
  private approvedCount = 0;
  private totalJudged = 0;

  constructor() {
    this.meter = metrics.getMeter('qualixar-os', VERSION);

    this.taskCounter = this.meter.createCounter('qos.tasks', {
      description: 'Total tasks processed by type and status',
      unit: '1',
    });

    this.latencyHistogram = this.meter.createHistogram('qos.latency', {
      description: 'Operation latency in milliseconds',
      unit: 'ms',
    });

    this.costCounter = this.meter.createCounter('qos.cost', {
      description: 'Cumulative LLM cost in USD',
      unit: 'USD',
    });

    this.agentGauge = this.meter.createUpDownCounter('qos.agents', {
      description: 'Current active agent count by topology',
      unit: '1',
    });

    this.judgeScoreHistogram = this.meter.createHistogram('qos.judge_score', {
      description: 'Judge evaluation scores (0–1)',
      unit: '1',
    });
  }

  /**
   * Increment the task counter for a given type and status.
   *
   * Terminal statuses (`approved`, `rejected`, `completed`, `failed`) are
   * tracked for approval-rate calculation.
   */
  incrementTaskCount(taskType: string, status: string): void {
    // OTEL export
    this.taskCounter.add(1, {
      'task.type': taskType,
      'task.status': status,
    });

    // Internal tracking
    const current = this.taskCounts.get(taskType) ?? 0;
    this.taskCounts.set(taskType, current + 1);

    if (status === 'approved') {
      this.approvedCount += 1;
    }
    if (TERMINAL_STATUSES.has(status)) {
      this.totalJudged += 1;
    }
  }

  /** Record an operation's latency in milliseconds. */
  recordLatency(operation: string, durationMs: number): void {
    this.latencyHistogram.record(durationMs, { operation });

    const bucket = this.latencyBuckets.get(operation) ?? { sum: 0, count: 0 };
    this.latencyBuckets.set(operation, {
      sum: bucket.sum + durationMs,
      count: bucket.count + 1,
    });
  }

  /** Record cost for a model call in USD. */
  recordCost(model: string, costUsd: number): void {
    this.costCounter.add(costUsd, { model });
    this.totalCost += costUsd;
  }

  /** Record the current active agent count for a topology. */
  recordAgentCount(topology: string, count: number): void {
    this.agentGauge.add(count, { topology });
  }

  /** Record a judge evaluation score (0–1). */
  recordJudgeScore(profile: string, score: number): void {
    this.judgeScoreHistogram.record(score, { 'judge.profile': profile });
  }

  /**
   * Compute and return a point-in-time metrics summary.
   *
   * Returns a new immutable object on every call — safe to cache or diff.
   */
  getMetrics(): MetricsSummary {
    // Snapshot task counts
    const taskCount: Record<string, number> = {};
    for (const [key, value] of this.taskCounts) {
      taskCount[key] = value;
    }

    // Compute average latencies
    const avgLatencyMs: Record<string, number> = {};
    for (const [key, bucket] of this.latencyBuckets) {
      avgLatencyMs[key] = bucket.count > 0
        ? bucket.sum / bucket.count
        : 0;
    }

    return {
      taskCount,
      avgLatencyMs,
      totalCostUsd: this.totalCost,
      approvalRate: this.totalJudged > 0
        ? this.approvedCount / this.totalJudged
        : 0,
    };
  }
}
