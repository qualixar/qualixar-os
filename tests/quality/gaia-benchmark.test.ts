/**
 * Phase D1 -- GAIA Benchmark Harness Tests
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createGaiaBenchmark,
  checkAnswer,
  PUBLISHED_BASELINES,
  type GaiaTask,
  type GaiaExecutor,
  type GaiaResult,
} from '../../src/quality/gaia-benchmark.js';

const SAMPLE_TASKS: readonly GaiaTask[] = [
  { id: 'g1', question: 'What is 2+2?', expectedAnswer: '4', level: 1, category: 'math', tools: [] },
  { id: 'g2', question: 'Capital of France?', expectedAnswer: 'Paris', level: 1, category: 'knowledge', tools: [] },
  { id: 'g3', question: 'Solve x^2=4', expectedAnswer: '2', level: 2, category: 'math', tools: [] },
];

function createMockExecutor(correctRate = 0.67): GaiaExecutor {
  let callCount = 0;
  return {
    execute: vi.fn(async (task: GaiaTask) => {
      callCount++;
      const correct = callCount <= Math.ceil(SAMPLE_TASKS.length * correctRate);
      return {
        answer: correct ? task.expectedAnswer : 'wrong answer',
        costUsd: 0.01,
        durationMs: 2000,
        agentsUsed: 3,
        topology: 'parallel',
      };
    }),
  };
}

describe('checkAnswer', () => {
  it('exact match', () => {
    expect(checkAnswer('Paris', 'Paris').exact).toBe(true);
  });
  it('case insensitive', () => {
    expect(checkAnswer('paris', 'Paris').correct).toBe(true);
  });
  it('contained match', () => {
    expect(checkAnswer('The answer is 4.', '4').correct).toBe(true);
  });
  it('no match', () => {
    expect(checkAnswer('Tokyo', 'Paris').correct).toBe(false);
  });
});

describe('GaiaBenchmark', () => {
  it('runs tasks and computes accuracy', async () => {
    const benchmark = createGaiaBenchmark();
    const executor = createMockExecutor(1.0);
    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.totalTasks).toBe(3);
    expect(summary.accuracy).toBeGreaterThan(0);
    expect(executor.execute).toHaveBeenCalledTimes(3);
  });

  it('computes accuracy by level', async () => {
    const benchmark = createGaiaBenchmark();
    const executor = createMockExecutor(1.0);
    const summary = await benchmark.run(SAMPLE_TASKS, executor);

    expect(summary.accuracyByLevel[1]).toBeDefined();
    expect(summary.accuracyByLevel[1].total).toBe(2);
  });

  it('handles executor failure gracefully', async () => {
    const benchmark = createGaiaBenchmark();
    const failExecutor: GaiaExecutor = {
      execute: vi.fn(async () => { throw new Error('API down'); }),
    };
    const summary = await benchmark.run(SAMPLE_TASKS, failExecutor);

    expect(summary.totalTasks).toBe(3);
    expect(summary.accuracy).toBe(0);
  });

  it('analyze works with pre-recorded results', () => {
    const benchmark = createGaiaBenchmark();
    const results: GaiaResult[] = [
      { taskId: 'g1', level: 1, answer: '4', correct: true, exactMatch: true, costUsd: 0.01, durationMs: 1000, agentsUsed: 2, topology: 'p' },
      { taskId: 'g2', level: 2, answer: 'wrong', correct: false, exactMatch: false, costUsd: 0.02, durationMs: 2000, agentsUsed: 3, topology: 'p' },
    ];
    const summary = benchmark.analyze(results);
    expect(summary.accuracy).toBeCloseTo(0.5, 2);
  });

  it('compareWithBaselines includes QOS entry', async () => {
    const benchmark = createGaiaBenchmark();
    const summary = benchmark.analyze([
      { taskId: 'g1', level: 1, answer: '4', correct: true, exactMatch: true, costUsd: 0.01, durationMs: 1000, agentsUsed: 2, topology: 'p' },
    ]);
    const comparison = benchmark.compareWithBaselines(summary);

    expect(comparison.length).toBe(PUBLISHED_BASELINES.length + 1);
    expect(comparison[comparison.length - 1].system).toBe('Qualixar OS');
  });

  it('published baselines include AIOS', () => {
    const aios = PUBLISHED_BASELINES.find((b) => b.system === 'AIOS');
    expect(aios).toBeDefined();
    expect(aios!.accuracy).toBe(0.32);
  });
});
