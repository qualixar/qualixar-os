// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Auto-Orchestration ML Engine (Blue Ocean BO-3)
 *
 * Uses Q-Learning outcome data from the database to recommend topologies
 * for incoming tasks. This is Qualixar OS's competitive moat -- no other
 * agent OS learns which topology to use from its own execution history.
 *
 * The engine does NOT access the database directly -- it accepts a
 * DataProvider interface so it can be tested in isolation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single historical outcome record (mirrors rl_outcomes table shape). */
export interface OutcomeRecord {
  readonly taskType: string;
  readonly strategy: string;
  readonly topology: string;
  readonly judgeScore: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly approved: boolean;
  readonly redesignCount: number;
  readonly createdAt: string;
}

/** Topology recommendation returned by the engine. */
export interface TopologyRecommendation {
  /** Recommended topology name. */
  readonly topology: string;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Human-readable reasoning. */
  readonly reasoning: string;
  /** Historical success rate for this topology + task type. */
  readonly historicalSuccessRate: number;
  /** Average cost for this topology + task type. */
  readonly avgCostUsd: number;
  /** Number of historical data points used. */
  readonly sampleSize: number;
}

/** Aggregated statistics for a topology + task type pair. */
export interface TopologyStats {
  readonly topology: string;
  readonly taskType: string;
  readonly totalRuns: number;
  readonly successCount: number;
  readonly successRate: number;
  readonly avgJudgeScore: number;
  readonly avgCostUsd: number;
  readonly avgDurationMs: number;
  readonly avgRedesigns: number;
}

/** Data provider interface -- abstracts DB access for testability. */
export interface AutoOrchestratorDataProvider {
  /** Fetch all outcome records, optionally filtered by task type. */
  getOutcomes(taskType?: string): readonly OutcomeRecord[];
}

// ---------------------------------------------------------------------------
// Score Weights
// ---------------------------------------------------------------------------

/** Weights for the multi-objective scoring function. */
interface ScoreWeights {
  readonly successRate: number;
  readonly judgeScore: number;
  readonly costEfficiency: number;
  readonly redesignPenalty: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = Object.freeze({
  successRate: 0.40,
  judgeScore: 0.30,
  costEfficiency: 0.20,
  redesignPenalty: 0.10,
});

// ---------------------------------------------------------------------------
// AutoOrchestrator
// ---------------------------------------------------------------------------

/**
 * Recommends topologies based on historical execution data.
 *
 * Scoring formula (per topology):
 *   score = w_success * successRate
 *         + w_judge  * avgJudgeScore
 *         + w_cost   * costEfficiency
 *         - w_redesign * (avgRedesigns / maxRedesigns)
 *
 * Where costEfficiency = 1 - (avgCost / budget) clamped to [0, 1].
 */
export class AutoOrchestrator {
  private readonly dataProvider: AutoOrchestratorDataProvider;
  private readonly weights: ScoreWeights;
  /** Minimum samples required before making a confident recommendation. */
  private readonly minSamples: number;

  constructor(
    dataProvider: AutoOrchestratorDataProvider,
    options?: {
      readonly weights?: Partial<ScoreWeights>;
      readonly minSamples?: number;
    },
  ) {
    this.dataProvider = dataProvider;
    this.weights = options?.weights
      ? { ...DEFAULT_WEIGHTS, ...options.weights }
      : DEFAULT_WEIGHTS;
    this.minSamples = options?.minSamples ?? 3;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Recommend the best topology for the given task parameters.
   */
  recommendTopology(
    taskType: string,
    agentCount: number,
    budget: number,
  ): TopologyRecommendation {
    const stats = this.aggregateStats(taskType);

    if (stats.length === 0) {
      return this.buildDefaultRecommendation(taskType, agentCount, budget);
    }

    // Score each topology
    const scored = stats.map((s) => ({
      stats: s,
      score: this.scoreTopology(s, budget),
    }));

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const confidence = this.calculateConfidence(best.stats, best.score);

    // Filter by agent count feasibility
    const feasibleTopology = this.filterByAgentCount(
      best.stats.topology,
      agentCount,
    );

    return Object.freeze({
      topology: feasibleTopology,
      confidence,
      reasoning: this.buildReasoning(best.stats, best.score, agentCount, budget),
      historicalSuccessRate: best.stats.successRate,
      avgCostUsd: best.stats.avgCostUsd,
      sampleSize: best.stats.totalRuns,
    });
  }

  /**
   * Get aggregated statistics for all topologies, optionally filtered.
   */
  getStats(taskType?: string): readonly TopologyStats[] {
    return this.aggregateStats(taskType);
  }

  /**
   * Get all available topologies ranked by overall score for a budget.
   */
  rankTopologies(
    taskType: string,
    budget: number,
  ): readonly TopologyRecommendation[] {
    const stats = this.aggregateStats(taskType);

    if (stats.length === 0) {
      return [];
    }

    const scored = stats.map((s) => ({
      stats: s,
      score: this.scoreTopology(s, budget),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.map((entry) =>
      Object.freeze({
        topology: entry.stats.topology,
        confidence: this.calculateConfidence(entry.stats, entry.score),
        reasoning: `Score: ${entry.score.toFixed(3)} (${entry.stats.totalRuns} runs)`,
        historicalSuccessRate: entry.stats.successRate,
        avgCostUsd: entry.stats.avgCostUsd,
        sampleSize: entry.stats.totalRuns,
      }),
    );
  }

  // ── Private helpers ───────────────────────────────────────────

  private aggregateStats(taskType?: string): TopologyStats[] {
    const outcomes = this.dataProvider.getOutcomes(taskType);

    // Group by topology + taskType
    const groups = new Map<string, OutcomeRecord[]>();
    for (const o of outcomes) {
      const key = `${o.topology}::${o.taskType}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(o);
      } else {
        groups.set(key, [o]);
      }
    }

    const result: TopologyStats[] = [];
    for (const [, records] of groups) {
      if (records.length === 0) continue;

      const successCount = records.filter((r) => r.approved).length;
      const totalRuns = records.length;

      result.push({
        topology: records[0].topology,
        taskType: records[0].taskType,
        totalRuns,
        successCount,
        successRate: totalRuns > 0 ? successCount / totalRuns : 0,
        avgJudgeScore:
          records.reduce((sum, r) => sum + r.judgeScore, 0) / totalRuns,
        avgCostUsd:
          records.reduce((sum, r) => sum + r.costUsd, 0) / totalRuns,
        avgDurationMs:
          records.reduce((sum, r) => sum + r.durationMs, 0) / totalRuns,
        avgRedesigns:
          records.reduce((sum, r) => sum + r.redesignCount, 0) / totalRuns,
      });
    }

    return result;
  }

  private scoreTopology(stats: TopologyStats, budget: number): number {
    const costEfficiency = budget > 0
      ? Math.max(0, Math.min(1, 1 - stats.avgCostUsd / budget))
      : 0.5;

    const maxRedesigns = 5; // normalizer
    const redesignPenalty = Math.min(1, stats.avgRedesigns / maxRedesigns);

    return (
      this.weights.successRate * stats.successRate +
      this.weights.judgeScore * stats.avgJudgeScore +
      this.weights.costEfficiency * costEfficiency -
      this.weights.redesignPenalty * redesignPenalty
    );
  }

  private calculateConfidence(stats: TopologyStats, score: number): number {
    // Confidence grows with sample size (sigmoid-like) and score
    const sampleFactor = Math.min(1, stats.totalRuns / (this.minSamples * 3));
    const scoreFactor = Math.max(0, Math.min(1, score));
    return Number((sampleFactor * 0.6 + scoreFactor * 0.4).toFixed(3));
  }

  private filterByAgentCount(topology: string, agentCount: number): string {
    // If only 1 agent available, force single topology
    if (agentCount <= 1) return 'single';
    // If 2 agents, limit to simpler topologies
    if (agentCount === 2 && ['mesh', 'ring', 'star', 'tournament'].includes(topology)) {
      return 'pipeline';
    }
    return topology;
  }

  private buildDefaultRecommendation(
    taskType: string,
    agentCount: number,
    budget: number,
  ): TopologyRecommendation {
    // No historical data -- use heuristic defaults
    const topology = agentCount <= 1
      ? 'single'
      : agentCount <= 3
        ? 'pipeline'
        : 'parallel_scatter_gather';

    return Object.freeze({
      topology,
      confidence: 0.3,
      reasoning: `No historical data for task type "${taskType}". Using heuristic: ${topology} for ${agentCount} agent(s) with $${budget} budget.`,
      historicalSuccessRate: 0,
      avgCostUsd: 0,
      sampleSize: 0,
    });
  }

  private buildReasoning(
    stats: TopologyStats,
    score: number,
    agentCount: number,
    budget: number,
  ): string {
    const parts: string[] = [
      `Best topology: ${stats.topology}`,
      `Score: ${score.toFixed(3)}`,
      `Success rate: ${(stats.successRate * 100).toFixed(1)}%`,
      `Avg judge score: ${stats.avgJudgeScore.toFixed(2)}`,
      `Avg cost: $${stats.avgCostUsd.toFixed(4)}`,
      `Sample size: ${stats.totalRuns}`,
      `Agent count: ${agentCount}, Budget: $${budget}`,
    ];
    return parts.join(' | ');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an AutoOrchestrator with the given data provider.
 */
export function createAutoOrchestrator(
  dataProvider: AutoOrchestratorDataProvider,
  options?: {
    readonly weights?: Partial<ScoreWeights>;
    readonly minSamples?: number;
  },
): AutoOrchestrator {
  return new AutoOrchestrator(dataProvider, options);
}
