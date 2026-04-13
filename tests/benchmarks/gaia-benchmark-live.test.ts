/**
 * Qualixar OS D1 -- Live GAIA Benchmark Runner
 *
 * Runs GAIA-style tasks against real Azure AI (gpt-5.4-mini) and compares
 * accuracy with published baselines. Skips when no API key.
 *
 * Also includes structural tests that always run (no API key needed).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createGaiaBenchmark,
  checkAnswer,
  PUBLISHED_BASELINES,
  type GaiaExecutor,
  type GaiaTask,
  type GaiaResult,
} from '../../src/quality/gaia-benchmark.js';
import { createQos } from '../../src/bootstrap.js';
import { QosConfigSchema, type QosConfig } from '../../src/types/common.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { ModelRouter } from '../../src/router/model-router.js';

// ---------------------------------------------------------------------------
// Azure Config
// ---------------------------------------------------------------------------

function getAzureConfig(): QosConfig {
  return QosConfigSchema.parse({
    mode: 'companion',
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
    providers: {
      azure: {
        type: 'azure-openai',
        endpoint:
          process.env.AZURE_AI_ENDPOINT ??
          'https://your-azure-endpoint.cognitiveservices.azure.com',
        api_key_env: 'AZURE_AI_API_KEY',
        api_version: '2024-12-01-preview',
      },
    },
    models: {
      primary: 'azure/gpt-5.4-mini',
      catalog: [
        {
          name: 'azure/gpt-5.4-mini',
          provider: 'azure',
          deployment: 'gpt-5.4-mini',
          quality_score: 0.92,
          cost_per_input_token: 0.0000006,
          cost_per_output_token: 0.0000024,
          max_tokens: 4096,
        },
      ],
    },
    budget: { max_usd: 5.0 },
  });
}

// ---------------------------------------------------------------------------
// Real GAIA Executor (uses live Azure model)
// ---------------------------------------------------------------------------

class RealGaiaExecutor implements GaiaExecutor {
  constructor(private readonly _router: ModelRouter) {}

  async execute(task: GaiaTask) {
    const start = performance.now();
    const response = await this._router.route({
      prompt: `Answer this question concisely and accurately:\n${task.question}\nProvide ONLY the answer, no explanation.`,
      taskType: 'analysis',
      maxTokens: 100,
    });
    return {
      answer: response.content.trim(),
      costUsd: response.costUsd,
      durationMs: performance.now() - start,
      agentsUsed: 1,
      topology: 'single',
    };
  }
}

// ---------------------------------------------------------------------------
// Mock GAIA Executor (for structural tests -- no API key needed)
// ---------------------------------------------------------------------------

class MockGaiaExecutor implements GaiaExecutor {
  readonly calls: string[] = [];

  async execute(task: GaiaTask) {
    this.calls.push(task.id);
    // Return expected answer for odd-indexed tasks, wrong for even
    const idx = parseInt(task.id.replace(/\D/g, ''), 10);
    const answer = idx % 2 === 1 ? task.expectedAnswer : 'wrong answer';
    return {
      answer,
      costUsd: 0.001,
      durationMs: 10,
      agentsUsed: 1,
      topology: 'single',
    };
  }
}

// ---------------------------------------------------------------------------
// GAIA Tasks
// ---------------------------------------------------------------------------

const GAIA_TASKS: readonly GaiaTask[] = [
  // Level 1 (factual)
  { id: 'G1', question: 'What is the capital of France?', expectedAnswer: 'Paris', level: 1, category: 'geography', tools: [] },
  { id: 'G2', question: 'What is 15 * 17?', expectedAnswer: '255', level: 1, category: 'math', tools: [] },
  { id: 'G3', question: 'Who wrote Romeo and Juliet?', expectedAnswer: 'William Shakespeare', level: 1, category: 'literature', tools: [] },
  { id: 'G4', question: 'What is the chemical symbol for gold?', expectedAnswer: 'Au', level: 1, category: 'science', tools: [] },
  { id: 'G5', question: 'What year did World War II end?', expectedAnswer: '1945', level: 1, category: 'history', tools: [] },
  { id: 'G6', question: 'What is the square root of 144?', expectedAnswer: '12', level: 1, category: 'math', tools: [] },
  { id: 'G7', question: 'What language is primarily spoken in Brazil?', expectedAnswer: 'Portuguese', level: 1, category: 'geography', tools: [] },
  // Level 2 (reasoning)
  { id: 'G8', question: 'If a train travels at 60 mph for 2.5 hours, how far does it go?', expectedAnswer: '150 miles', level: 2, category: 'math', tools: [] },
  { id: 'G9', question: 'What is the next number in the sequence: 2, 6, 12, 20, ...?', expectedAnswer: '30', level: 2, category: 'math', tools: [] },
  { id: 'G10', question: 'If all roses are flowers and some flowers fade quickly, can we conclude all roses fade quickly?', expectedAnswer: 'No', level: 2, category: 'logic', tools: [] },
  { id: 'G11', question: 'A store offers 20% off a $80 item. What is the final price?', expectedAnswer: '$64', level: 2, category: 'math', tools: [] },
  { id: 'G12', question: 'What is the sum of the first 10 positive integers?', expectedAnswer: '55', level: 2, category: 'math', tools: [] },
  { id: 'G13', question: 'If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?', expectedAnswer: '5 minutes', level: 2, category: 'logic', tools: [] },
  { id: 'G14', question: 'What comes next: Monday, Wednesday, Friday, ...?', expectedAnswer: 'Sunday', level: 2, category: 'logic', tools: [] },
  // Level 3 (complex reasoning)
  { id: 'G15', question: 'A bat and ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost?', expectedAnswer: '$0.05', level: 3, category: 'math', tools: [] },
  { id: 'G16', question: 'If you have 3 boxes, one with only apples, one with only oranges, and one with both, and all labels are wrong, how many boxes do you need to open to correctly label all?', expectedAnswer: '1', level: 3, category: 'logic', tools: [] },
  { id: 'G17', question: 'What is the derivative of x^3 + 2x^2 - 5x + 1?', expectedAnswer: '3x^2 + 4x - 5', level: 3, category: 'math', tools: [] },
  { id: 'G18', question: 'In a room of 23 people, what is the approximate probability that two share a birthday?', expectedAnswer: '50%', level: 3, category: 'probability', tools: [] },
  { id: 'G19', question: 'How many days are there in 4 years (including one leap year)?', expectedAnswer: '1461', level: 3, category: 'math', tools: [] },
  { id: 'G20', question: 'If a recursive function has base case n=0 returning 1, and f(n)=n*f(n-1), what is f(5)?', expectedAnswer: '120', level: 3, category: 'math', tools: [] },
] as const;

// ---------------------------------------------------------------------------
// Structural Tests (always run)
// ---------------------------------------------------------------------------

describe('D1 GAIA Benchmark -- Structural', () => {
  it('MockGaiaExecutor satisfies the GaiaExecutor interface', async () => {
    const executor = new MockGaiaExecutor();
    const benchmark = createGaiaBenchmark();

    const summary = await benchmark.run(GAIA_TASKS, executor);

    expect(summary.totalTasks).toBe(20);
    expect(summary.correctCount).toBeGreaterThan(0);
    expect(summary.accuracy).toBeGreaterThan(0);
    expect(summary.accuracy).toBeLessThanOrEqual(1);
    expect(executor.calls).toHaveLength(20);
  });

  it('checkAnswer handles exact and fuzzy matches', () => {
    expect(checkAnswer('Paris', 'Paris')).toEqual({ exact: true, correct: true });
    expect(checkAnswer('paris', 'Paris')).toEqual({ exact: true, correct: true });
    expect(checkAnswer('The answer is Paris', 'Paris')).toEqual({ exact: false, correct: true });
    expect(checkAnswer('London', 'Paris')).toEqual({ exact: false, correct: false });
  });

  it('compareWithBaselines includes published systems and QOS', async () => {
    const executor = new MockGaiaExecutor();
    const benchmark = createGaiaBenchmark();

    const summary = await benchmark.run(GAIA_TASKS, executor);
    const comparison = benchmark.compareWithBaselines(summary);

    expect(comparison.length).toBe(PUBLISHED_BASELINES.length + 1);
    const qos = comparison.find((c) => c.system === 'Qualixar OS');
    expect(qos).toBeDefined();
    expect(qos!.accuracy).toBe(summary.accuracy);
  });

  it('accuracy by level breaks down correctly', async () => {
    const executor = new MockGaiaExecutor();
    const benchmark = createGaiaBenchmark();

    const summary = await benchmark.run(GAIA_TASKS, executor);

    expect(summary.accuracyByLevel[1]).toBeDefined();
    expect(summary.accuracyByLevel[2]).toBeDefined();
    expect(summary.accuracyByLevel[3]).toBeDefined();
    expect(summary.accuracyByLevel[1].total).toBe(7);
    expect(summary.accuracyByLevel[2].total).toBe(7);
    expect(summary.accuracyByLevel[3].total).toBe(6);
  });

  it('analyze works with pre-recorded results', () => {
    const benchmark = createGaiaBenchmark();
    const results: readonly GaiaResult[] = [
      { taskId: 'G1', level: 1, answer: 'Paris', correct: true, exactMatch: true, costUsd: 0.001, durationMs: 50, agentsUsed: 1, topology: 'single' },
      { taskId: 'G2', level: 1, answer: '256', correct: false, exactMatch: false, costUsd: 0.001, durationMs: 60, agentsUsed: 1, topology: 'single' },
      { taskId: 'G3', level: 2, answer: 'No', correct: true, exactMatch: true, costUsd: 0.001, durationMs: 70, agentsUsed: 1, topology: 'single' },
    ];

    const summary = benchmark.analyze(results);

    expect(summary.totalTasks).toBe(3);
    expect(summary.correctCount).toBe(2);
    expect(summary.accuracy).toBeCloseTo(2 / 3);
    expect(summary.accuracyByLevel[1].total).toBe(2);
    expect(summary.accuracyByLevel[1].correct).toBe(1);
  });

  it('handles empty results gracefully', () => {
    const benchmark = createGaiaBenchmark();
    const summary = benchmark.analyze([]);

    expect(summary.totalTasks).toBe(0);
    expect(summary.correctCount).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.meanCostUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Live Test (skips when no Azure key)
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.AZURE_AI_API_KEY)(
  'D1 Live GAIA Benchmark',
  () => {
    let orc: Orchestrator | undefined;

    afterEach(() => {
      if (orc?.db) {
        try {
          orc.db.close();
        } catch {
          // Already closed
        }
      }
      orc = undefined;
    });

    it(
      'runs 20 GAIA tasks with gpt-5.4-mini on Azure GTIC',
      async () => {
        orc = createQos(getAzureConfig());
        const executor = new RealGaiaExecutor(orc.modelRouter);
        const benchmark = createGaiaBenchmark();

        const summary = await benchmark.run(GAIA_TASKS, executor);
        const comparison = benchmark.compareWithBaselines(summary);

        // Save results
        const resultPath = path.resolve(
          __dirname,
          '../../.backup/pivot2/benchmarks/gaia-results.json',
        );
        fs.mkdirSync(path.dirname(resultPath), { recursive: true });
        fs.writeFileSync(
          resultPath,
          JSON.stringify({ summary, comparison }, null, 2),
        );

        expect(summary.totalTasks).toBe(20);
        expect(summary.accuracy).toBeGreaterThan(0);
      },
      300_000,
    );
  },
);
