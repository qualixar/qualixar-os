// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- ProtocolRouter
 * LLD Section 2.6
 *
 * Rule-based transport selection engine. Decides which transport to use for
 * each agent based on location, capabilities, and historical performance.
 *
 * CRITICAL: This is NOT ML/LLM-based. It uses a deterministic decision tree
 * with optional performance-history weighting.
 *
 * All SQL uses db.db.prepare(sql).run(params) -- NEVER db.insert().
 */

import { generateId } from '../../utils/id.js';
import type { QosDatabase } from '../../db/database.js';
import type { EventBus } from '../../events/event-bus.js';
import type {
  ProtocolRouter,
  LocationRegistry,
  AgentTransport,
  ProtocolMetric,
  TransportRecommendation,
  TransportConfig,
  TransportType,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ProtocolRouterImpl implements ProtocolRouter {
  constructor(
    private readonly _registry: LocationRegistry,
    private readonly _transports: {
      readonly local: AgentTransport;
      readonly a2a: AgentTransport;
      readonly hybrid: AgentTransport;
    },
    private readonly _eventBus: EventBus,
    private readonly _db: QosDatabase,
    private readonly _config: TransportConfig,
  ) {}

  /**
   * Decision tree for selecting transport for a single agent.
   * Steps follow LLD Section 2.6 exactly.
   */
  selectTransport(agentId: string, _taskType?: string): AgentTransport {
    // 1. Look up agent
    const entry = this._registry.lookup(agentId);

    // 2. If entry is undefined -> default to local
    if (!entry) {
      return this._transports.local;
    }

    // 3. If explicit local override
    if (entry.transport === 'local') {
      return this._transports.local;
    }

    // 4. If explicit a2a override
    if (entry.transport === 'a2a') {
      if (entry.location === 'local') {
        // Agent marked a2a but location is local -- use local transport
        return this._transports.local;
      }
      return this._transports.a2a;
    }

    // 5. If auto (intelligent selection)
    if (entry.transport === 'auto') {
      if (entry.location === 'local') {
        return this._transports.local;
      }

      // Remote + auto: check performance history
      const recommendation = this.getRecommendation(agentId);

      if (recommendation.confidence >= 0.7 && recommendation.transport === 'local') {
        return this._transports.local;
      }

      if (recommendation.confidence >= 0.7 && recommendation.successRate < 0.5) {
        // Poor success rate on remote -- fallback to local if configured
        if (this._config.fallbackToLocal) {
          return this._transports.local;
        }
      }

      return this._transports.a2a;
    }

    // 7. Fallback: local
    return this._transports.local;
  }

  /**
   * Select transport for an entire team.
   * Pure local / pure remote / hybrid based on agent composition.
   */
  selectTransportForTeam(
    agents: readonly { readonly id: string }[],
  ): AgentTransport {
    const localCount = agents.filter((a) => this._registry.isLocal(a.id)).length;
    const remoteCount = agents.length - localCount;

    if (remoteCount === 0) {
      return this._transports.local;
    }
    if (localCount === 0) {
      return this._transports.a2a;
    }
    return this._transports.hybrid;
  }

  /**
   * Record a transport performance metric.
   * Uses raw prepared statement (not db.insert()) for consistency.
   */
  recordMetric(metric: ProtocolMetric): void {
    const id = metric.id || generateId();

    this._db.db
      .prepare(
        `INSERT INTO protocol_metrics (id, agent_id, transport, latency_ms, success, task_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        metric.agentId,
        metric.transport,
        metric.latencyMs,
        metric.success ? 1 : 0,
        metric.taskType ?? null,
        metric.createdAt,
      );

    this._eventBus.emit({
      type: 'transport:metric_recorded',
      payload: {
        agentId: metric.agentId,
        transport: metric.transport,
        latencyMs: metric.latencyMs,
      },
      source: 'protocol-router',
    });
  }

  /**
   * Get transport recommendation based on historical metrics.
   * Queries last 50 metrics, groups by transport, scores each.
   * Score = successRate * (1 / (1 + avgLatencyMs / 1000))
   */
  getRecommendation(agentId: string): TransportRecommendation {
    const rows = this._db.db
      .prepare(
        `SELECT transport, latency_ms, success
         FROM protocol_metrics
         WHERE agent_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all(agentId) as readonly {
      readonly transport: string;
      readonly latency_ms: number;
      readonly success: number;
    }[];

    // No data: return default recommendation
    if (rows.length === 0) {
      return {
        transport: 'local',
        confidence: 0.0,
        reason: 'No performance data',
        avgLatencyMs: 0,
        successRate: 1.0,
      };
    }

    // Group by transport
    const groups = new Map<
      string,
      { totalLatency: number; successCount: number; total: number }
    >();

    for (const row of rows) {
      const existing = groups.get(row.transport);
      if (existing) {
        existing.totalLatency += row.latency_ms;
        existing.successCount += row.success;
        existing.total += 1;
      } else {
        groups.set(row.transport, {
          totalLatency: row.latency_ms,
          successCount: row.success,
          total: 1,
        });
      }
    }

    // Score each transport group
    let bestTransport: TransportType = 'local';
    let bestScore = -1;
    let bestAvgLatency = 0;
    let bestSuccessRate = 0;

    for (const [transport, group] of groups) {
      const avgLatencyMs = group.totalLatency / group.total;
      const successRate = group.successCount / group.total;
      const score = successRate * (1 / (1 + avgLatencyMs / 1000));

      if (score > bestScore) {
        bestScore = score;
        bestTransport = transport as TransportType;
        bestAvgLatency = avgLatencyMs;
        bestSuccessRate = successRate;
      }
    }

    // Confidence: more data = more confident (capped at 1.0)
    const confidence = Math.min(rows.length / 20, 1.0);

    return {
      transport: bestTransport,
      confidence,
      reason: `Based on ${rows.length} historical metrics`,
      avgLatencyMs: bestAvgLatency,
      successRate: bestSuccessRate,
    };
  }

  /**
   * Prune metrics older than the specified number of days.
   * Returns count of deleted rows.
   */
  pruneOldMetrics(olderThanDays: number): number {
    const result = this._db.db
      .prepare(
        `DELETE FROM protocol_metrics WHERE created_at < datetime('now', '-' || ? || ' days')`,
      )
      .run(olderThanDays);

    this._eventBus.emit({
      type: 'transport:metrics_pruned',
      payload: { olderThanDays, deletedCount: result.changes },
      source: 'protocol-router',
    });

    return result.changes;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new ProtocolRouter instance.
 * @param registry - LocationRegistry for agent location lookups.
 * @param transports - Map of available transport implementations.
 * @param eventBus - EventBus for emitting transport events.
 * @param db - QosDatabase (protocol_metrics table must exist via phase10b migration).
 * @param config - Transport configuration.
 */
export function createProtocolRouter(
  registry: LocationRegistry,
  transports: {
    readonly local: AgentTransport;
    readonly a2a: AgentTransport;
    readonly hybrid: AgentTransport;
  },
  eventBus: EventBus,
  db: QosDatabase,
  config: TransportConfig,
): ProtocolRouter {
  return new ProtocolRouterImpl(registry, transports, eventBus, db, config);
}
