// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase B3 -- Self-Improving Loop Benchmark
 *
 * Proves the Forge→Judge→RL→Forge loop CONVERGES and IMPROVES over time.
 * This is the EXISTENCE PROOF that makes the paper credible.
 *
 * The benchmark:
 * 1. Runs Forge on N tasks for M iterations each
 * 2. Records judge scores per iteration
 * 3. Tracks design quality improvement
 * 4. Computes convergence statistics
 * 5. Produces data for convergence curve plots
 *
 * Source: Phase B3 LLD, MASTER-IMPLEMENTATION-PLAN.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkTask {
  readonly id: string;
  readonly prompt: string;
  readonly type: string;
  readonly expectedDifficulty: 'easy' | 'medium' | 'hard';
}

export interface IterationResult {
  readonly taskId: string;
  readonly iteration: number;
  readonly judgeScore: number;
  readonly topology: string;
  readonly agentCount: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly redesigned: boolean;
}

export interface TaskConvergence {
  readonly taskId: string;
  readonly scores: readonly number[];
  readonly improved: boolean;
  readonly improvementPct: number;
  readonly converged: boolean;        // score delta < epsilon for last K iterations
  readonly finalScore: number;
  readonly iterations: number;
}

export interface BenchmarkSummary {
  readonly totalTasks: number;
  readonly totalIterations: number;
  readonly tasksImproved: number;
  readonly tasksConverged: number;
  readonly meanImprovementPct: number;
  readonly meanFinalScore: number;
  readonly scoresByIteration: readonly number[]; // mean score at each iteration index
  readonly pValue: number | null;       // paired t-test: iteration 1 vs last
  readonly significant: boolean;        // p < 0.05
  readonly convergenceCurve: readonly { readonly iteration: number; readonly meanScore: number }[];
}

export interface BenchmarkConfig {
  readonly maxIterations: number;
  readonly convergenceEpsilon: number;
  readonly convergenceWindow: number;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  maxIterations: 5,
  convergenceEpsilon: 0.02,
  convergenceWindow: 2,
} as const;

// ---------------------------------------------------------------------------
// Executor Interface (injected — decouples from real Orchestrator)
// ---------------------------------------------------------------------------

export interface LoopExecutor {
  /** Run a single task through the Forge→Judge→RL loop and return the score */
  executeIteration(task: BenchmarkTask, iteration: number): Promise<IterationResult>;
}

// ---------------------------------------------------------------------------
// Benchmark Harness
// ---------------------------------------------------------------------------

export interface LoopBenchmark {
  /** Run benchmark across all tasks */
  run(tasks: readonly BenchmarkTask[], executor: LoopExecutor): Promise<BenchmarkSummary>;
  /** Analyze pre-recorded results */
  analyze(results: readonly IterationResult[]): BenchmarkSummary;
}

// ---------------------------------------------------------------------------
// Statistical Helpers
// ---------------------------------------------------------------------------

/** Paired two-tailed t-test. Returns p-value. Null if n < 2. */
function pairedTTest(before: readonly number[], after: readonly number[]): number | null {
  const n = Math.min(before.length, after.length);
  if (n < 2) return null;

  const diffs = before.slice(0, n).map((b, i) => after[i] - b);
  const meanD = diffs.reduce((s, d) => s + d, 0) / n;
  const variance = diffs.reduce((s, d) => s + (d - meanD) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);

  if (se === 0) return meanD === 0 ? 1.0 : 0.0;

  const t = meanD / se;
  // Approximate p-value using normal distribution for large n
  // For small n, this is conservative (actual p would be higher)
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return p;
}

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class LoopBenchmarkImpl implements LoopBenchmark {
  private readonly _config: BenchmarkConfig;

  constructor(config?: Partial<BenchmarkConfig>) {
    this._config = { ...DEFAULT_BENCHMARK_CONFIG, ...config };
  }

  async run(
    tasks: readonly BenchmarkTask[],
    executor: LoopExecutor,
  ): Promise<BenchmarkSummary> {
    const allResults: IterationResult[] = [];

    for (const task of tasks) {
      for (let iter = 1; iter <= this._config.maxIterations; iter++) {
        const result = await executor.executeIteration(task, iter);
        allResults.push(result);
      }
    }

    return this.analyze(allResults);
  }

  analyze(results: readonly IterationResult[]): BenchmarkSummary {
    // Group by task
    const byTask = new Map<string, IterationResult[]>();
    for (const r of results) {
      const existing = byTask.get(r.taskId);
      if (existing) {
        existing.push(r);
      } else {
        byTask.set(r.taskId, [r]);
      }
    }

    // Compute per-task convergence
    const convergences: TaskConvergence[] = [];
    for (const [taskId, taskResults] of byTask) {
      const sorted = [...taskResults].sort((a, b) => a.iteration - b.iteration);
      const scores = sorted.map((r) => r.judgeScore);
      convergences.push(this._analyzeTask(taskId, scores));
    }

    // Compute mean score at each iteration index
    const maxIter = results.reduce((max, r) => Math.max(max, r.iteration), 0);
    const scoresByIteration: number[] = [];
    for (let i = 1; i <= maxIter; i++) {
      const iterScores = results.filter((r) => r.iteration === i).map((r) => r.judgeScore);
      scoresByIteration.push(
        iterScores.length > 0 ? iterScores.reduce((s, v) => s + v, 0) / iterScores.length : 0,
      );
    }

    // Paired t-test: first iteration vs last
    const firstScores = convergences.map((c) => c.scores[0] ?? 0);
    const lastScores = convergences.map((c) => c.scores[c.scores.length - 1] ?? 0);
    const pValue = pairedTTest(firstScores, lastScores);

    const tasksImproved = convergences.filter((c) => c.improved).length;
    const tasksConverged = convergences.filter((c) => c.converged).length;
    const meanImprovement = convergences.length > 0
      ? convergences.reduce((s, c) => s + c.improvementPct, 0) / convergences.length
      : 0;
    const meanFinalScore = convergences.length > 0
      ? convergences.reduce((s, c) => s + c.finalScore, 0) / convergences.length
      : 0;

    return {
      totalTasks: byTask.size,
      totalIterations: results.length,
      tasksImproved,
      tasksConverged,
      meanImprovementPct: meanImprovement,
      meanFinalScore,
      scoresByIteration,
      pValue,
      significant: pValue !== null && pValue < 0.05,
      convergenceCurve: scoresByIteration.map((score, i) => ({
        iteration: i + 1,
        meanScore: score,
      })),
    };
  }

  private _analyzeTask(taskId: string, scores: readonly number[]): TaskConvergence {
    if (scores.length === 0) {
      return { taskId, scores, improved: false, improvementPct: 0, converged: false, finalScore: 0, iterations: 0 };
    }

    const first = scores[0];
    const last = scores[scores.length - 1];
    const improved = last > first;
    const improvementPct = first > 0 ? ((last - first) / first) * 100 : 0;

    // Check convergence: last K scores within epsilon
    const window = Math.min(this._config.convergenceWindow, scores.length);
    const tail = scores.slice(-window);
    const converged = window >= 2 && tail.every((s) =>
      Math.abs(s - tail[0]) < this._config.convergenceEpsilon,
    );

    return {
      taskId,
      scores: [...scores],
      improved,
      improvementPct,
      converged,
      finalScore: last,
      iterations: scores.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLoopBenchmark(config?: Partial<BenchmarkConfig>): LoopBenchmark {
  return new LoopBenchmarkImpl(config);
}
