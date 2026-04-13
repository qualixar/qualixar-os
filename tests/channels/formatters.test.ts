/**
 * Qualixar OS Phase 7 -- Formatters Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatResult,
  formatStatus,
  formatCost,
  formatError,
} from '../../src/channels/formatters.js';
import type { TaskResult, CostSummary } from '../../src/types/common.js';
import type { TaskStatus } from '../../src/engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResult: TaskResult = {
  taskId: 'task-001',
  status: 'completed',
  output: 'Hello world output',
  artifacts: [
    { path: '/out/main.ts', content: 'code', type: 'code' },
  ],
  cost: {
    total_usd: 0.0512,
    by_model: { 'claude-sonnet-4-6': 0.04, 'gpt-4.1-mini': 0.0112 },
    by_agent: { 'agent-1': 0.0512 },
    by_category: { inference: 0.0512 },
    budget_remaining_usd: 9.9488,
  },
  judges: [
    {
      judgeModel: 'claude-sonnet-4-6',
      verdict: 'approve',
      score: 0.92,
      feedback: 'Looks good',
      issues: [],
      durationMs: 1200,
    },
    {
      judgeModel: 'gpt-4.1-mini',
      verdict: 'reject',
      score: 0.4,
      feedback: 'Needs work',
      issues: [],
      durationMs: 800,
    },
  ],
  teamDesign: null,
  duration_ms: 5432,
  metadata: {},
};

const mockStatus: TaskStatus = {
  taskId: 'task-002',
  phase: 'run',
  progress: 65,
  currentAgents: ['agent-1', 'agent-2'],
  redesignCount: 0,
  costSoFar: 0.025,
  startedAt: '2026-03-30T10:00:00.000Z',
};

const mockCost: CostSummary = {
  total_usd: 1.2345,
  by_model: { 'claude-sonnet-4-6': 1.0, 'gpt-4.1-mini': 0.2345 },
  by_agent: { 'agent-1': 0.8, 'agent-2': 0.4345 },
  by_category: { inference: 1.0, embedding: 0.2345 },
  budget_remaining_usd: 8.7655,
};

// ---------------------------------------------------------------------------
// formatResult
// ---------------------------------------------------------------------------

describe('formatResult', () => {
  it('formats as CLI with ANSI bold and task header', () => {
    const out = formatResult(mockResult, 'cli');
    expect(out).toContain('\x1b[1m');
    expect(out).toContain('task-001');
    expect(out).toContain('completed');
    expect(out).toContain('Hello world output');
    expect(out).toContain('$0.0512');
    expect(out).toContain('1 approved');
    expect(out).toContain('1 rejected');
    expect(out).toContain('5432ms');
    expect(out).toContain('[code] /out/main.ts');
  });

  it('truncates long output in CLI format', () => {
    const longResult = { ...mockResult, output: 'x'.repeat(6000) };
    const out = formatResult(longResult, 'cli');
    expect(out).toContain('... (truncated)');
    expect(out.length).toBeLessThan(6500);
  });

  it('formats as JSON', () => {
    const out = formatResult(mockResult, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.taskId).toBe('task-001');
    expect(parsed.status).toBe('completed');
    expect(parsed.cost.total_usd).toBe(0.0512);
  });

  it('formats as markdown', () => {
    const out = formatResult(mockResult, 'markdown');
    expect(out).toContain('## Task task-001');
    expect(out).toContain('**Status:** completed');
    expect(out).toContain('```');
    expect(out).toContain('**Cost:** $0.0512');
    expect(out).toContain('claude-sonnet-4-6: approve');
  });

  it('formats telegram same as markdown', () => {
    const md = formatResult(mockResult, 'markdown');
    const tg = formatResult(mockResult, 'telegram');
    expect(tg).toBe(md);
  });

  it('formats discord same as markdown', () => {
    const md = formatResult(mockResult, 'markdown');
    const dc = formatResult(mockResult, 'discord');
    expect(dc).toBe(md);
  });

  it('formats as HTML with div wrapper', () => {
    const out = formatResult(mockResult, 'html');
    expect(out).toContain('<div class="task-result">');
    expect(out).toContain('<h2>Task task-001</h2>');
    expect(out).toContain('<strong>Status:</strong> completed');
    expect(out).toContain('</div>');
  });

  it('escapes HTML in output', () => {
    const xssResult = { ...mockResult, output: '<script>alert("xss")</script>' };
    const out = formatResult(xssResult, 'html');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('handles result with no artifacts', () => {
    const noArtifacts = { ...mockResult, artifacts: [] };
    const out = formatResult(noArtifacts, 'cli');
    expect(out).not.toContain('Artifacts:');
  });

  it('handles result with no judges in markdown', () => {
    const noJudges = { ...mockResult, judges: [] };
    const out = formatResult(noJudges, 'markdown');
    expect(out).not.toContain('**Judge Verdicts:**');
  });
});

// ---------------------------------------------------------------------------
// formatStatus
// ---------------------------------------------------------------------------

describe('formatStatus', () => {
  it('formats as CLI one-liner', () => {
    const out = formatStatus(mockStatus, 'cli');
    expect(out).toContain('Task task-002');
    expect(out).toContain('Phase: run');
    expect(out).toContain('Progress: 65%');
    expect(out).toContain('Cost: $0.0250');
  });

  it('formats as JSON', () => {
    const out = formatStatus(mockStatus, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.taskId).toBe('task-002');
    expect(parsed.phase).toBe('run');
  });

  it('formats as markdown with bold task', () => {
    const out = formatStatus(mockStatus, 'markdown');
    expect(out).toContain('**Task task-002**');
    expect(out).toContain('Phase: run');
  });

  it('formats as HTML with div', () => {
    const out = formatStatus(mockStatus, 'html');
    expect(out).toContain('<div class="task-status">');
    expect(out).toContain('<strong>Task task-002</strong>');
  });

  it('telegram matches markdown', () => {
    expect(formatStatus(mockStatus, 'telegram')).toBe(formatStatus(mockStatus, 'markdown'));
  });

  it('discord matches markdown', () => {
    expect(formatStatus(mockStatus, 'discord')).toBe(formatStatus(mockStatus, 'markdown'));
  });
});

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe('formatCost', () => {
  it('formats as CLI with total and remaining', () => {
    const out = formatCost(mockCost, 'cli');
    expect(out).toContain('Total: $1.2345');
    expect(out).toContain('Remaining: $8.7655');
    expect(out).toContain('claude-sonnet-4-6: $1.0000');
  });

  it('formats as JSON', () => {
    const out = formatCost(mockCost, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.total_usd).toBe(1.2345);
  });

  it('formats as markdown with table', () => {
    const out = formatCost(mockCost, 'markdown');
    expect(out).toContain('| Model | Cost |');
    expect(out).toContain('| claude-sonnet-4-6 | $1.0000 |');
  });

  it('formats as HTML', () => {
    const out = formatCost(mockCost, 'html');
    expect(out).toContain('<div class="cost-summary">');
    expect(out).toContain('$1.2345');
  });

  it('handles empty by_model in CLI', () => {
    const emptyCost = { ...mockCost, by_model: {} };
    const out = formatCost(emptyCost, 'cli');
    expect(out).not.toContain('By Model:');
  });

  it('handles empty by_model in markdown', () => {
    const emptyCost = { ...mockCost, by_model: {} };
    const out = formatCost(emptyCost, 'markdown');
    expect(out).not.toContain('| Model |');
  });
});

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
  const err = new Error('Something went wrong');

  it('formats as CLI with red ANSI', () => {
    const out = formatError(err, 'cli');
    expect(out).toContain('\x1b[31m');
    expect(out).toContain('Something went wrong');
    expect(out).toContain('\x1b[0m');
  });

  it('formats as JSON', () => {
    const out = formatError(err, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.error).toBe('Something went wrong');
  });

  it('formats as markdown', () => {
    const out = formatError(err, 'markdown');
    expect(out).toBe('**Error:** Something went wrong');
  });

  it('formats as HTML with escaped message', () => {
    const xssErr = new Error('<script>alert("xss")</script>');
    const out = formatError(xssErr, 'html');
    expect(out).toContain('<div class="error">');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('telegram matches markdown', () => {
    expect(formatError(err, 'telegram')).toBe(formatError(err, 'markdown'));
  });

  it('discord matches markdown', () => {
    expect(formatError(err, 'discord')).toBe(formatError(err, 'markdown'));
  });
});

// ---------------------------------------------------------------------------
// default (fallback) branch coverage
// ---------------------------------------------------------------------------

describe('default format fallback', () => {
  const unknownFormat = 'unknown-format' as any;

  it('formatResult defaults to JSON for unknown format', () => {
    const out = formatResult(mockResult, unknownFormat);
    const parsed = JSON.parse(out);
    expect(parsed.taskId).toBe('task-001');
  });

  it('formatStatus defaults to JSON for unknown format', () => {
    const out = formatStatus(mockStatus, unknownFormat);
    const parsed = JSON.parse(out);
    expect(parsed.taskId).toBe('task-002');
  });

  it('formatCost defaults to JSON for unknown format', () => {
    const out = formatCost(mockCost, unknownFormat);
    const parsed = JSON.parse(out);
    expect(parsed.total_usd).toBe(1.2345);
  });

  it('formatError defaults to JSON for unknown format', () => {
    const err = new Error('Oops');
    const out = formatError(err, unknownFormat);
    const parsed = JSON.parse(out);
    expect(parsed.error).toBe('Oops');
  });
});
