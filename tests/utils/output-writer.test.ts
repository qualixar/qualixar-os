/**
 * Tests for output-writer.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeOutputToDisk, extractCodeBlocks } from '../../src/utils/output-writer.js';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TaskResult } from '../../src/types/common.js';

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'test-task-001',
    status: 'completed',
    output: 'Hello from Qualixar OS',
    artifacts: [],
    cost: {
      total_usd: 0.0042,
      by_model: { 'gpt-4.1': 0.0042 },
      by_agent: {},
      by_category: {},
      budget_remaining_usd: 9.9958,
    },
    judges: [
      {
        judgeModel: 'gpt-4.1',
        verdict: 'approve',
        score: 0.95,
        feedback: 'Good output',
        issues: [],
        round: 1,
      },
    ],
    teamDesign: {
      id: 'design-1',
      topology: 'sequential',
      agents: [{ role: 'writer', model: 'gpt-4.1', systemPrompt: '' }],
      reasoning: 'Simple task',
      estimatedCostUsd: 0.01,
      version: 1,
    },
    duration_ms: 5432,
    metadata: {
      mode: 'companion',
      redesignCount: 0,
      memoryEntriesUsed: 0,
    },
    ...overrides,
  };
}

describe('writeOutputToDisk', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'qos-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates output.md and metadata.json', async () => {
    const result = makeResult();
    const outputDir = await writeOutputToDisk(tmpDir, 'test-task-001', result);

    expect(existsSync(join(outputDir, 'output.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'metadata.json'))).toBe(true);

    const md = readFileSync(join(outputDir, 'output.md'), 'utf-8');
    expect(md).toContain('Hello from Qualixar OS');
    expect(md).toContain('test-task-001');
    expect(md).toContain('$0.0042');

    const meta = JSON.parse(readFileSync(join(outputDir, 'metadata.json'), 'utf-8'));
    expect(meta.taskId).toBe('test-task-001');
    expect(meta.status).toBe('completed');
    expect(meta.cost.total_usd).toBe(0.0042);
    expect(meta.judges).toHaveLength(1);
    expect(meta.judges[0].verdict).toBe('approve');
  });

  it('creates artifacts directory when artifacts exist', async () => {
    const result = makeResult({
      artifacts: [
        { path: 'src/hello.ts', type: 'code', content: 'console.log("hi")' },
        { path: 'docs/readme.md', type: 'doc', content: '# Hello' },
      ],
    });
    const outputDir = await writeOutputToDisk(tmpDir, 'test-task-002', result);

    expect(existsSync(join(outputDir, 'artifacts', 'hello.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'artifacts', 'readme.md'))).toBe(true);
    expect(readFileSync(join(outputDir, 'artifacts', 'hello.ts'), 'utf-8')).toBe(
      'console.log("hi")',
    );
  });

  it('skips artifacts directory when no artifacts', async () => {
    const result = makeResult();
    const outputDir = await writeOutputToDisk(tmpDir, 'test-task-003', result);
    expect(existsSync(join(outputDir, 'artifacts'))).toBe(false);
  });

  it('handles failed task status', async () => {
    const result = makeResult({ status: 'failed', output: 'Error occurred' });
    const outputDir = await writeOutputToDisk(tmpDir, 'test-task-004', result);

    const md = readFileSync(join(outputDir, 'output.md'), 'utf-8');
    expect(md).toContain('**Status:** failed');
    expect(md).toContain('Error occurred');
  });

  it('handles task with no judges', async () => {
    const result = makeResult({ judges: [] });
    const outputDir = await writeOutputToDisk(tmpDir, 'test-task-005', result);

    const md = readFileSync(join(outputDir, 'output.md'), 'utf-8');
    expect(md).not.toContain('Judge Verdicts');
  });

  it('returns the correct output directory path', async () => {
    const result = makeResult();
    const outputDir = await writeOutputToDisk(tmpDir, 'my-task-id', result);
    expect(outputDir).toBe(join(tmpDir, 'qos-output', 'my-task-id'));
  });

  it('extracts code blocks from output and saves as source files', async () => {
    const codeOutput = [
      'Here is your ecommerce app:',
      '',
      '```typescript:src/index.ts',
      'import express from "express";',
      'const app = express();',
      'app.listen(3000);',
      '```',
      '',
      '```html:public/index.html',
      '<!DOCTYPE html>',
      '<html><body>Hello</body></html>',
      '```',
      '',
      '```css',
      'body { margin: 0; }',
      '```',
    ].join('\n');

    const result = makeResult({ output: codeOutput });
    const outputDir = await writeOutputToDisk(tmpDir, 'code-task', result);

    expect(existsSync(join(outputDir, 'src', 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'public', 'index.html'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'file-1.css'))).toBe(true);

    expect(readFileSync(join(outputDir, 'src', 'src', 'index.ts'), 'utf-8')).toContain(
      'import express',
    );

    const meta = JSON.parse(readFileSync(join(outputDir, 'metadata.json'), 'utf-8'));
    expect(meta.filesWritten.length).toBeGreaterThanOrEqual(3);
  });
});

describe('extractCodeBlocks', () => {
  it('extracts blocks with language and path', () => {
    const text = '```typescript:src/app.ts\nconst x = 1;\n```';
    const files = extractCodeBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].language).toBe('typescript');
    expect(files[0].content).toBe('const x = 1;');
  });

  it('auto-generates filename when no path given', () => {
    const text = '```python\nprint("hello")\n```';
    const files = extractCodeBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('file-1.py');
  });

  it('extracts multiple blocks', () => {
    const text = '```js\nconst a=1;\n```\n\n```css\nbody{}\n```';
    const files = extractCodeBlocks(text);
    expect(files).toHaveLength(2);
  });

  it('skips empty code blocks', () => {
    const text = '```js\n\n```';
    const files = extractCodeBlocks(text);
    expect(files).toHaveLength(0);
  });

  it('extracts path from first-line comment hint', () => {
    const text = '```typescript\n// filename: utils/helpers.ts\nexport function help() {}\n```';
    const files = extractCodeBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('utils/helpers.ts');
  });
});
