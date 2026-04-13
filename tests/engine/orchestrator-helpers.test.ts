/**
 * Qualixar OS Session 15 -- Orchestrator Helpers Tests (M-03)
 *
 * Dedicated test file for pure helper functions extracted from the orchestrator.
 */

import { describe, it, expect } from 'vitest';
import {
  extractArtifacts,
  buildTaskResult,
  buildDurableState,
  type TaskStatus,
} from '../../src/engine/orchestrator-helpers.js';
import type { CostSummary } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// extractArtifacts
// ---------------------------------------------------------------------------

describe('extractArtifacts', () => {
  it('returns empty array for empty agentResults', () => {
    const result = extractArtifacts({
      agentResults: [],
      outputs: [],
      aggregatedOutput: '',
      topology: 'sequential',
      totalCostUsd: 0,
      durationMs: 0,
    });
    expect(result).toEqual([]);
  });

  it('extracts code blocks as artifacts', () => {
    const result = extractArtifacts({
      agentResults: [
        {
          agentId: 'a1',
          role: 'developer',
          output: 'Here is code:\n```ts\nconst x = 1;\n```',
          costUsd: 0,
          durationMs: 0,
          status: 'completed',
        },
      ],
      outputs: [],
      aggregatedOutput: '',
      topology: 'sequential',
      totalCostUsd: 0,
      durationMs: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('const x = 1;');
    expect(result[0].type).toBe('code');
  });

  it('extracts multiple code blocks from multiple agents', () => {
    const result = extractArtifacts({
      agentResults: [
        {
          agentId: 'a1', role: 'dev', status: 'completed', costUsd: 0, durationMs: 0,
          output: '```js\nfoo()\n```\n```ts\nbar()\n```',
        },
        {
          agentId: 'a2', role: 'test', status: 'completed', costUsd: 0, durationMs: 0,
          output: '```py\nprint("hello")\n```',
        },
      ],
      outputs: [], aggregatedOutput: '', topology: 'sequential', totalCostUsd: 0, durationMs: 0,
    });
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no code blocks present', () => {
    const result = extractArtifacts({
      agentResults: [
        {
          agentId: 'a1', role: 'dev', status: 'completed', costUsd: 0, durationMs: 0,
          output: 'No code here, just text.',
        },
      ],
      outputs: [], aggregatedOutput: '', topology: 'sequential', totalCostUsd: 0, durationMs: 0,
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTaskResult
// ---------------------------------------------------------------------------

describe('buildTaskResult', () => {
  const costSummary: CostSummary = {
    total_usd: 0.01,
    by_model: {},
    by_agent: {},
    by_category: {},
    budget_remaining_usd: 9.99,
  };

  it('builds a completed TaskResult with all fields', () => {
    const result = buildTaskResult(
      'test-1',        // taskId
      'completed',     // status
      'hello world',   // output
      [],              // artifacts
      null,            // teamDesign
      [],              // judges
      1000,            // durationMs
      'companion',     // mode
      0,               // redesignCount
      5,               // memoryEntriesUsed
      costSummary,     // costSummary
    );

    expect(result.taskId).toBe('test-1');
    expect(result.status).toBe('completed');
    expect(result.output).toBe('hello world');
    expect(result.cost.total_usd).toBe(0.01);
    expect(result.duration_ms).toBe(1000);
    expect(result.artifacts).toEqual([]);
    expect(result.metadata.mode).toBe('companion');
    expect(result.metadata.redesignCount).toBe(0);
    expect(result.metadata.memoryEntriesUsed).toBe(5);
  });

  it('builds a failed TaskResult', () => {
    const result = buildTaskResult(
      'test-2', 'failed', 'error occurred', [], null, [], 500, 'power', 2, 0, costSummary,
    );
    expect(result.status).toBe('failed');
    expect(result.metadata.mode).toBe('power');
    expect(result.metadata.redesignCount).toBe(2);
  });

  it('builds a cancelled TaskResult', () => {
    const result = buildTaskResult(
      'test-3', 'cancelled', '', [], null, [], 100, 'companion', 0, 0, costSummary,
    );
    expect(result.status).toBe('cancelled');
  });

  it('includes topology from team design', () => {
    const result = buildTaskResult(
      'test-4', 'completed', 'done', [], {
        id: 'td-1', taskType: 'code', topology: 'parallel',
        agents: [], reasoning: '', estimatedCostUsd: 0, version: 1,
      }, [], 100, 'power', 0, 0, costSummary,
    );
    expect(result.metadata.topology).toBe('parallel');
    expect(result.teamDesign).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TaskStatus interface shape
// ---------------------------------------------------------------------------

describe('TaskStatus type', () => {
  it('satisfies the TaskStatus interface', () => {
    const status: TaskStatus = {
      taskId: 'ts-1',
      phase: 'init',
      progress: 0,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: 0,
      startedAt: new Date().toISOString(),
    };
    expect(status.phase).toBe('init');
    expect(status.progress).toBe(0);
  });

  it('supports all valid phase values', () => {
    const phases: TaskStatus['phase'][] = ['init', 'memory', 'forge', 'simulate', 'run', 'judge', 'output'];
    for (const phase of phases) {
      const status: TaskStatus = {
        taskId: 'ts', phase, progress: 50, currentAgents: ['a1'],
        redesignCount: 1, costSoFar: 0.05, startedAt: new Date().toISOString(),
        lastCheckpoint: new Date().toISOString(),
      };
      expect(status.phase).toBe(phase);
    }
  });
});
