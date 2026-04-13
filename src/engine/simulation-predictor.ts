// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase C5 -- Simulation Predictor
 *
 * Predicts task outcomes using historical data from forge_designs,
 * model_calls, and judge_results tables. Enhances the existing
 * SimulationEngine with data-driven cost, quality, and duration estimates.
 *
 * Source: Phase C5, SOUL-VS-CODE-GAP-ANALYSIS.md (P5)
 */

import type { QosDatabase } from '../db/database.js';
import type { TeamDesign, TaskOptions } from '../types/common.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationPrediction {
  readonly estimatedCostUsd: number;
  readonly estimatedDurationMs: number;
  readonly estimatedQualityScore: number;
  readonly failureProbability: number;
  readonly confidence: number;           // 0-1, based on data availability
  readonly basedOnSamples: number;
  readonly recommendation: 'proceed' | 'caution' | 'redesign';
}

export interface SimulationPredictor {
  predict(design: TeamDesign, task: TaskOptions): SimulationPrediction;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface HistoricalRow {
  readonly topology: string;
  readonly task_type: string;
  readonly cost_usd: number;
  readonly duration_ms: number;
  readonly score: number | null;
  readonly status: string;
}

class SimulationPredictorImpl implements SimulationPredictor {
  private readonly _db: QosDatabase;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  predict(design: TeamDesign, task: TaskOptions): SimulationPrediction {
    // Query historical data for similar topology + task type
    const rows = this._queryHistorical(design.topology, task.type ?? 'custom');
    const exactMatches = rows.filter(
      (r) => r.topology === design.topology && r.task_type === (task.type ?? 'custom'),
    );
    const topologyMatches = rows.filter((r) => r.topology === design.topology);

    // Use exact matches first, fall back to topology matches, then all data
    const samples = exactMatches.length >= 3
      ? exactMatches
      : topologyMatches.length >= 3
        ? topologyMatches
        : rows;

    if (samples.length === 0) {
      return this._noPrediction(design);
    }

    // Compute aggregates
    const costs = samples.map((r) => r.cost_usd);
    const durations = samples.map((r) => r.duration_ms);
    const scores = samples.filter((r) => r.score !== null).map((r) => r.score!);
    const failures = samples.filter((r) => r.status === 'failed').length;

    const meanCost = costs.reduce((s, v) => s + v, 0) / costs.length;
    const meanDuration = durations.reduce((s, v) => s + v, 0) / durations.length;
    const meanScore = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : 0.5;
    const failureRate = failures / samples.length;

    // Use mean historical cost directly (H-12: removed misleading hardcoded scaling)
    const estimatedCost = meanCost;

    // Confidence based on sample size (capped at 1.0)
    const confidence = Math.min(samples.length / 10, 1.0);

    // Recommendation
    let recommendation: SimulationPrediction['recommendation'];
    if (failureRate > 0.5 || meanScore < 0.4) {
      recommendation = 'redesign';
    } else if (failureRate > 0.2 || meanScore < 0.6) {
      recommendation = 'caution';
    } else {
      recommendation = 'proceed';
    }

    // Budget check
    if (task.budget_usd !== undefined && estimatedCost > task.budget_usd) {
      recommendation = 'caution';
    }

    return {
      estimatedCostUsd: estimatedCost,
      estimatedDurationMs: meanDuration,
      estimatedQualityScore: meanScore,
      failureProbability: failureRate,
      confidence,
      basedOnSamples: samples.length,
      recommendation,
    };
  }

  private _queryHistorical(topology: string, taskType: string): readonly HistoricalRow[] {
    try {
      return this._db.db.prepare(`
        SELECT
          t.type as task_type,
          t.status,
          t.cost_usd,
          t.duration_ms,
          fd.topology,
          (SELECT AVG(jr.score) FROM judge_results jr WHERE jr.task_id = t.id) as score
        FROM tasks t
        LEFT JOIN forge_designs fd ON fd.task_id = t.id
        WHERE (fd.topology = ? OR t.type = ?)
          AND t.status IN ('completed', 'failed')
        ORDER BY t.created_at DESC
        LIMIT 50
      `).all(topology, taskType) as HistoricalRow[];
    } catch {
      return [];
    }
  }

  private _getAverageAgentCount(
    _samples: readonly HistoricalRow[],
  ): number {
    // Approximate from topology defaults
    return 3; // conservative default
  }

  private _noPrediction(design: TeamDesign): SimulationPrediction {
    // Heuristic fallback when no historical data exists
    const estimatedCost = 0.01 * design.agents.length;
    return {
      estimatedCostUsd: estimatedCost,
      estimatedDurationMs: 5000 * design.agents.length,
      estimatedQualityScore: 0.5,
      failureProbability: 0.2,
      confidence: 0,
      basedOnSamples: 0,
      recommendation: 'caution',
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSimulationPredictor(db: QosDatabase): SimulationPredictor {
  return new SimulationPredictorImpl(db);
}
