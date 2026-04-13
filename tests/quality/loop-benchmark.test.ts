/**
 * Phase B3 -- Self-Improving Loop Benchmark Tests
 *
 * Tests the benchmark harness and analysis with mock executors.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createLoopBenchmark,
  type BenchmarkTask,
  type LoopExecutor,
  type IterationResult,
} from '../../src/quality/loop-benchmark.js';

// ---------------------------------------------------------------------------
// Mock Executor: Simulates improving scores over iterations
// ---------------------------------------------------------------------------

function createImprovingExecutor(baseScore = 0.5, improvementPerIter = 0.08): LoopExecutor {
  return {
    executeIteration: vi.fn(async (task: BenchmarkTask, iteration: number): Promise<IterationResult> => ({
      taskId: task.id,
      iteration,
      judgeScore: Math.min(1.0, baseScore + (iteration - 1) * improvementPerIter),
      topology: 'parallel',
      agentCount: 3,
      costUsd: 0.01 * iteration,
      durationMs: 1000,
      redesigned: iteration > 1,
    })),
  };
}

function createFlatExecutor(score = 0.7): LoopExecutor {
  return {
    executeIteration: vi.fn(async (task: BenchmarkTask, iteration: number): Promise<IterationResult> => ({
      taskId: task.id,
      iteration,
      judgeScore: score,
      topology: 'sequential',
      agentCount: 2,
      costUsd: 0.01,
      durationMs: 500,
      redesigned: false,
    })),
  };
}

const SAMPLE_TASKS: readonly BenchmarkTask[] = [
  { id: 'task-1', prompt: 'Build a REST API', type: 'code', expectedDifficulty: 'medium' },
  { id: 'task-2', prompt: 'Analyze market data', type: 'research', expectedDifficulty: 'easy' },
  { id: 'task-3', prompt: 'Write a compiler', type: 'code', expectedDifficulty: 'hard' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoopBenchmark', () => {
  it('runs all tasks for configured iterations', async () => {
    const benchmark = createLoopBenchmark({ maxIterations: 3 });
    const executor = createImprovingExecutor();

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.totalTasks).toBe(3);
    expect(summary.totalIterations).toBe(9); // 3 tasks × 3 iterations
    expect(executor.executeIteration).toHaveBeenCalledTimes(9);
  });

  it('detects improvement when scores increase over iterations', async () => {
    const benchmark = createLoopBenchmark({ maxIterations: 5 });
    const executor = createImprovingExecutor(0.5, 0.1);

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.tasksImproved).toBe(3); // All tasks improve
    expect(summary.meanImprovementPct).toBeGreaterThan(0);
    expect(summary.meanFinalScore).toBeGreaterThan(0.5);
  });

  it('produces convergence curve data', async () => {
    const benchmark = createLoopBenchmark({ maxIterations: 4 });
    const executor = createImprovingExecutor();

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.convergenceCurve).toHaveLength(4);
    expect(summary.convergenceCurve[0].iteration).toBe(1);
    // Mean score should increase over iterations
    expect(summary.convergenceCurve[3].meanScore).toBeGreaterThan(
      summary.convergenceCurve[0].meanScore,
    );
  });

  it('detects convergence when scores plateau', async () => {
    const benchmark = createLoopBenchmark({
      maxIterations: 5,
      convergenceEpsilon: 0.02,
      convergenceWindow: 2,
    });
    const executor = createFlatExecutor(0.85);

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.tasksConverged).toBe(3); // All converged (flat)
  });

  it('computes p-value for statistical significance', async () => {
    const benchmark = createLoopBenchmark({ maxIterations: 5 });
    const executor = createImprovingExecutor(0.4, 0.12);

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.pValue).not.toBeNull();
    // With consistent improvement across 3 tasks, should be significant
    expect(summary.significant).toBe(true);
  });

  it('analyze works with pre-recorded results', () => {
    const benchmark = createLoopBenchmark();

    const results: IterationResult[] = [
      { taskId: 'a', iteration: 1, judgeScore: 0.5, topology: 'p', agentCount: 2, costUsd: 0.01, durationMs: 100, redesigned: false },
      { taskId: 'a', iteration: 2, judgeScore: 0.7, topology: 'p', agentCount: 2, costUsd: 0.01, durationMs: 100, redesigned: true },
      { taskId: 'a', iteration: 3, judgeScore: 0.85, topology: 'p', agentCount: 3, costUsd: 0.02, durationMs: 150, redesigned: true },
    ];

    const summary = benchmark.analyze(results);

    expect(summary.totalTasks).toBe(1);
    expect(summary.totalIterations).toBe(3);
    expect(summary.tasksImproved).toBe(1);
    expect(summary.meanFinalScore).toBeCloseTo(0.85, 2);
    expect(summary.scoresByIteration).toHaveLength(3);
  });

  it('handles empty results gracefully', () => {
    const benchmark = createLoopBenchmark();
    const summary = benchmark.analyze([]);

    expect(summary.totalTasks).toBe(0);
    expect(summary.totalIterations).toBe(0);
    expect(summary.pValue).toBeNull();
    expect(summary.significant).toBe(false);
  });

  it('scoresByIteration shows mean across all tasks at each iteration', async () => {
    const benchmark = createLoopBenchmark({ maxIterations: 3 });
    const executor = createImprovingExecutor(0.5, 0.1);

    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    // Iteration 1: all tasks score 0.5, mean = 0.5
    expect(summary.scoresByIteration[0]).toBeCloseTo(0.5, 2);
    // Iteration 2: all tasks score 0.6, mean = 0.6
    expect(summary.scoresByIteration[1]).toBeCloseTo(0.6, 2);
    // Iteration 3: all tasks score 0.7, mean = 0.7
    expect(summary.scoresByIteration[2]).toBeCloseTo(0.7, 2);
  });
});
