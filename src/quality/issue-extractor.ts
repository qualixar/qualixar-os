// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Issue Extractor
 * LLD Section 2.6
 *
 * Parse judge feedback into structured JudgeIssue[].
 * If verdicts already contain inline issues, return those (deduplicated).
 * Otherwise, use LLM to extract issues from unstructured feedback text.
 */

import type { JudgeVerdict, JudgeIssue, ModelRequest, ModelResponse } from '../types/common.js';

const MAX_ISSUE_EXTRACTION_TOKENS = 2000;

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface IssueExtractor {
  extract(verdicts: readonly JudgeVerdict[]): Promise<JudgeIssue[]>;
}

// ---------------------------------------------------------------------------
// ModelRouter subset (to avoid circular dependency)
// ---------------------------------------------------------------------------

export interface IssueExtractorModelRouter {
  route(request: ModelRequest): Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class IssueExtractorImpl implements IssueExtractor {
  private readonly modelRouter: IssueExtractorModelRouter;

  constructor(modelRouter: IssueExtractorModelRouter) {
    this.modelRouter = modelRouter;
  }

  async extract(verdicts: readonly JudgeVerdict[]): Promise<JudgeIssue[]> {
    const feedbackTexts = verdicts.map((v) => ({
      judge: v.judgeModel,
      verdict: v.verdict,
      feedback: v.feedback,
      inlineIssues: v.issues,
    }));

    // Merge inline issues from verdicts
    const allIssues: JudgeIssue[] = [];
    for (const ft of feedbackTexts) {
      for (const issue of ft.inlineIssues) {
        allIssues.push(issue);
      }
    }

    // If verdicts already have structured issues, skip LLM extraction
    if (allIssues.length > 0) {
      return this.deduplicateIssues(allIssues);
    }

    // Fallback: Use LLM to parse unstructured feedback into issues
    const extractionPrompt = `Analyze the following judge feedback and extract structured issues.

Judge feedback:
${feedbackTexts.map((f) => `[${f.judge}] (${f.verdict}): ${f.feedback}`).join('\n\n')}

Return a JSON array where each element has:
- "severity": "critical" | "high" | "medium" | "low"
- "category": string (e.g., "correctness", "security", "performance", "completeness")
- "description": string (clear description of the issue)
- "location": string or null (file path or section if mentioned)
- "suggestedFix": string or null (how to fix it)`;

    try {
      const response = await this.modelRouter.route({
        prompt: extractionPrompt,
        systemPrompt:
          'You are an issue extraction system. Return only valid JSON array.',
        temperature: 0.0,
        maxTokens: MAX_ISSUE_EXTRACTION_TOKENS,
        taskType: 'judge',
      });

      const parsed = JSON.parse(response.content) as JudgeIssue[];
      return this.deduplicateIssues([...allIssues, ...parsed]);
    } catch {
      // LLM returned non-JSON: return whatever inline issues we collected
      return allIssues;
    }
  }

  private deduplicateIssues(issues: JudgeIssue[]): JudgeIssue[] {
    const seen = new Set<string>();
    const deduped: JudgeIssue[] = [];

    for (const issue of issues) {
      const key = `${issue.severity}:${issue.category}:${issue.description.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(issue);
      }
    }

    return deduped;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIssueExtractor(
  modelRouter: IssueExtractorModelRouter,
): IssueExtractor {
  return new IssueExtractorImpl(modelRouter);
}
