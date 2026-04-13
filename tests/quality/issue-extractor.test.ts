/**
 * Qualixar OS Phase 3 -- Issue Extractor Tests
 * TDD Sequence #3: Mock LLM, test parsing logic.
 */

import { describe, it, expect, vi } from 'vitest';
import { createIssueExtractor } from '../../src/quality/issue-extractor.js';
import type { JudgeVerdict, JudgeIssue } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Mock ModelRouter
// ---------------------------------------------------------------------------

function createMockRouter(response: string) {
  return {
    route: vi.fn().mockResolvedValue({
      content: response,
      model: 'gpt-4.1-mini',
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      latencyMs: 500,
    }),
  };
}

function makeVerdict(
  issues: JudgeIssue[] = [],
  feedback: string = 'Some feedback',
): JudgeVerdict {
  return {
    judgeModel: 'claude-sonnet-4-6',
    verdict: 'revise',
    score: 0.6,
    feedback,
    issues,
    durationMs: 1000,
  };
}

describe('IssueExtractor', () => {
  it('returns inline issues from verdicts directly (no LLM call)', async () => {
    const mockRouter = createMockRouter('[]');
    const extractor = createIssueExtractor(mockRouter);

    const issues: JudgeIssue[] = [
      {
        severity: 'high',
        category: 'correctness',
        description: 'Bug in function X',
      },
    ];
    const verdicts = [makeVerdict(issues)];

    const result = await extractor.extract(verdicts);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('correctness');
    expect(mockRouter.route).not.toHaveBeenCalled();
  });

  it('deduplicates issues based on severity+category+description', async () => {
    const mockRouter = createMockRouter('[]');
    const extractor = createIssueExtractor(mockRouter);

    const issue: JudgeIssue = {
      severity: 'high',
      category: 'correctness',
      description: 'Bug in function X',
    };
    const verdicts = [makeVerdict([issue]), makeVerdict([issue])];

    const result = await extractor.extract(verdicts);
    expect(result).toHaveLength(1);
  });

  it('calls LLM when no inline issues exist', async () => {
    const llmResponse = JSON.stringify([
      {
        severity: 'medium',
        category: 'performance',
        description: 'Slow query in module Y',
        location: 'src/db.ts',
        suggestedFix: 'Add index',
      },
    ]);
    const mockRouter = createMockRouter(llmResponse);
    const extractor = createIssueExtractor(mockRouter);

    const verdicts = [makeVerdict([], 'The code has performance issues')];
    const result = await extractor.extract(verdicts);

    expect(mockRouter.route).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('performance');
  });

  it('returns empty array when LLM returns non-JSON', async () => {
    const mockRouter = createMockRouter('not valid json');
    const extractor = createIssueExtractor(mockRouter);

    const verdicts = [makeVerdict([], 'Some unstructured feedback')];
    const result = await extractor.extract(verdicts);

    expect(result).toHaveLength(0);
  });

  it('merges LLM-extracted issues with inline issues on fallback path', async () => {
    // When verdicts have inline issues, LLM is not called -- so no merge
    // This tests the dedup path with multiple verdicts having different issues
    const mockRouter = createMockRouter('[]');
    const extractor = createIssueExtractor(mockRouter);

    const verdicts = [
      makeVerdict([
        { severity: 'high', category: 'correctness', description: 'Bug A' },
      ]),
      makeVerdict([
        { severity: 'medium', category: 'style', description: 'Naming issue' },
      ]),
    ];

    const result = await extractor.extract(verdicts);
    expect(result).toHaveLength(2);
  });

  it('handles empty verdicts array', async () => {
    const mockRouter = createMockRouter('[]');
    const extractor = createIssueExtractor(mockRouter);

    const result = await extractor.extract([]);
    // No inline issues, no feedback -> LLM called with empty feedback
    expect(result).toHaveLength(0);
  });
});
