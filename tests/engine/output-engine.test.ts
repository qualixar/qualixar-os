/**
 * Qualixar OS Phase 6 -- Output Engine Tests
 * TDD Round 3: Format tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OutputEngineImpl, createOutputEngine } from '../../src/engine/output-engine.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { TaskResult } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMockConfigManager(): ConfigManager {
  return {
    get: () => ({ mode: 'companion' }),
    getValue: () => undefined,
    reload: () => {},
  } as unknown as ConfigManager;
}

function createTestTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'test-task-id',
    status: 'completed',
    output: 'Hello, this is the task output.',
    artifacts: [
      { path: '/tmp/code.ts', content: 'const x = 1;', type: 'code' as const },
    ],
    cost: {
      total_usd: 0.0042,
      by_model: { 'claude-sonnet-4-6': 0.0042 },
      by_agent: { 'agent-1': 0.0042 },
      by_category: { code: 0.0042 },
      budget_remaining_usd: 9.9958,
    },
    judges: [
      {
        judgeModel: 'claude-sonnet-4-6',
        verdict: 'approve' as const,
        score: 0.95,
        feedback: 'Looks good',
        issues: [],
        durationMs: 500,
      },
      {
        judgeModel: 'gpt-4.1-mini',
        verdict: 'approve' as const,
        score: 0.88,
        feedback: 'Acceptable',
        issues: [],
        durationMs: 400,
      },
    ],
    teamDesign: null,
    duration_ms: 2500,
    metadata: { mode: 'companion', redesignCount: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OutputEngineImpl', () => {
  let engine: OutputEngineImpl;

  beforeEach(() => {
    engine = new OutputEngineImpl(createMockConfigManager());
  });

  // Test 18: formatJson returns valid JSON
  it('formatJson returns valid JSON with all fields', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'json');

    const parsed = JSON.parse(formatted.text);
    expect(parsed.taskId).toBe('test-task-id');
    expect(parsed.status).toBe('completed');
    expect(parsed.output).toBe('Hello, this is the task output.');
    expect(parsed.cost.total_usd).toBe(0.0042);
    expect(parsed.judges).toHaveLength(2);
    expect(parsed.duration_ms).toBe(2500);
  });

  // Test 19: formatCli includes cost
  it('formatCli includes cost string', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'cli');

    expect(formatted.text).toContain('Cost: $0.0042');
    expect(formatted.text).toContain('test-task-id');
    expect(formatted.text).toContain('completed');
    expect(formatted.text).toContain('Duration: 2500ms');
  });

  // Test 20: formatMarkdown uses headers
  it('formatMarkdown uses markdown headers', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'markdown');

    expect(formatted.text).toContain('## Task test-task-id');
    expect(formatted.text).toContain('**Status:** completed');
    expect(formatted.text).toContain('**Cost:** $0.0042');
  });

  // Test 21: formatHtml wraps in div
  it('formatHtml wraps in div with class', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'html');

    expect(formatted.text).toContain('<div class="task-result">');
    expect(formatted.text).toContain('<h2>Task test-task-id</h2>');
    expect(formatted.text).toContain('<pre><code>');
    expect(formatted.text).toContain('</div>');
  });

  // Test 22: format dispatches correctly
  it('format dispatches to correct formatter', () => {
    const result = createTestTaskResult();

    const cli = engine.format(result, 'cli');
    expect(cli.metadata.channel).toBe('cli');
    expect(cli.text).toContain('Task test-task-id -- completed');

    const json = engine.format(result, 'json');
    expect(json.metadata.channel).toBe('json');
    expect(() => JSON.parse(json.text)).not.toThrow();

    const md = engine.format(result, 'markdown');
    expect(md.metadata.channel).toBe('markdown');
    expect(md.text).toContain('## Task');

    const html = engine.format(result, 'html');
    expect(html.metadata.channel).toBe('html');
    expect(html.text).toContain('<div');
  });

  // Test 23: telegram uses markdown format
  it('telegram channel uses markdown format', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'telegram');
    expect(formatted.text).toContain('## Task');
    expect(formatted.metadata.channel).toBe('telegram');
  });

  // Test 24: discord uses markdown format
  it('discord channel uses markdown format', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'discord');
    expect(formatted.text).toContain('## Task');
    expect(formatted.metadata.channel).toBe('discord');
  });

  // Test 25: artifacts passed through
  it('artifacts are passed through in formatted output', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'json');
    expect(formatted.artifacts).toHaveLength(1);
    expect(formatted.artifacts[0].path).toBe('/tmp/code.ts');
  });

  // Test 26: metadata includes formatting info
  it('metadata includes formatting info', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'cli');
    expect(formatted.metadata.channel).toBe('cli');
    expect(formatted.metadata.formattedAt).toBeDefined();
    expect(formatted.metadata.taskId).toBe('test-task-id');
    expect(formatted.metadata.status).toBe('completed');
  });

  // Test 27: CLI truncates long output
  it('CLI truncates output longer than 5000 chars', () => {
    const longOutput = 'x'.repeat(6000);
    const result = createTestTaskResult({ output: longOutput });
    const formatted = engine.format(result, 'cli');
    expect(formatted.text).toContain('... (truncated)');
  });

  // Test 28: CLI lists artifacts
  it('CLI lists artifacts with type and path', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'cli');
    expect(formatted.text).toContain('[code] /tmp/code.ts');
  });

  // Test 29: HTML escapes special characters
  it('HTML escapes special characters', () => {
    const result = createTestTaskResult({ output: '<script>alert("xss")</script>' });
    const formatted = engine.format(result, 'html');
    expect(formatted.text).toContain('&lt;script&gt;');
    expect(formatted.text).not.toContain('<script>');
  });

  // Test 30: judge verdicts in markdown
  it('markdown includes judge verdicts as bullet list', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'markdown');
    expect(formatted.text).toContain('**Judge Verdicts:**');
    expect(formatted.text).toContain('claude-sonnet-4-6: approve');
    expect(formatted.text).toContain('gpt-4.1-mini: approve');
  });

  // Test 31: empty artifacts list
  it('handles empty artifacts list gracefully', () => {
    const result = createTestTaskResult({ artifacts: [] });
    const cli = engine.format(result, 'cli');
    expect(cli.text).not.toContain('Artifacts:');

    const md = engine.format(result, 'markdown');
    expect(md.text).not.toContain('**Artifacts:**');
  });

  // Test 32: empty judges list
  it('handles empty judges list gracefully', () => {
    const result = createTestTaskResult({ judges: [] });
    const md = engine.format(result, 'markdown');
    expect(md.text).not.toContain('**Judge Verdicts:**');
  });

  // Test 33: default channel falls back to JSON format
  it('unknown channel falls back to JSON format', () => {
    const result = createTestTaskResult();
    // Cast to bypass TypeScript to test the default branch
    const formatted = engine.format(result, 'unknown_channel' as never);
    expect(() => JSON.parse(formatted.text)).not.toThrow();
  });

  // Test 34: markdown wraps multiline output in code block
  it('markdown wraps multiline output in code block', () => {
    const result = createTestTaskResult({ output: 'line1\nline2\nline3' });
    const formatted = engine.format(result, 'markdown');
    expect(formatted.text).toContain('```');
    expect(formatted.text).toContain('line1\nline2\nline3');
  });

  // Test 35: markdown wraps output containing backticks in code block
  it('markdown wraps output containing backticks in code block', () => {
    const result = createTestTaskResult({ output: 'some ```code``` here' });
    const formatted = engine.format(result, 'markdown');
    expect(formatted.text).toContain('```');
  });

  // Test 36: markdown single-line no backticks uses inline
  it('markdown single-line output without backticks is inline', () => {
    const result = createTestTaskResult({ output: 'simple output' });
    const formatted = engine.format(result, 'markdown');
    expect(formatted.text).toContain('simple output');
    // Should NOT have triple backticks wrapping it
    const lines = formatted.text.split('\n');
    const codeBlockCount = lines.filter(l => l.trim() === '```').length;
    expect(codeBlockCount).toBe(0);
  });

  // Test 37: HTML includes judge verdicts
  it('HTML includes judge verdicts in list', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'html');
    expect(formatted.text).toContain('claude-sonnet-4-6: approve');
    expect(formatted.text).toContain('gpt-4.1-mini: approve');
    expect(formatted.text).toContain('<ul>');
    expect(formatted.text).toContain('<li>');
  });

  // Test 38: HTML with empty judges and artifacts
  it('HTML handles empty judges and artifacts', () => {
    const result = createTestTaskResult({ judges: [], artifacts: [] });
    const formatted = engine.format(result, 'html');
    expect(formatted.text).toContain('<div class="task-result">');
    expect(formatted.text).toContain('</div>');
    // Should not have the ul sections for judges/artifacts
    const ulCount = (formatted.text.match(/<ul>/g) || []).length;
    expect(ulCount).toBe(0);
  });

  // Test 39: HTML artifacts section
  it('HTML includes artifacts section', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'html');
    expect(formatted.text).toContain('[code]');
    expect(formatted.text).toContain('/tmp/code.ts');
  });

  // Test 40: markdown artifacts section
  it('markdown includes artifacts section', () => {
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'markdown');
    expect(formatted.text).toContain('**Artifacts:**');
    expect(formatted.text).toContain('[code] /tmp/code.ts');
  });
});

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

describe('createOutputEngine', () => {
  it('creates an OutputEngine instance', () => {
    const engine = createOutputEngine(createMockConfigManager());
    expect(engine).toBeDefined();
    const result = createTestTaskResult();
    const formatted = engine.format(result, 'json');
    expect(() => JSON.parse(formatted.text)).not.toThrow();
  });
});
