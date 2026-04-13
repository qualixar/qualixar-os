/**
 * Qualixar OS Phase 3 -- Reward Aggregator Tests
 * TDD Sequence #5: Pure math, tests score fusion.
 */

import { describe, it, expect } from 'vitest';
import { createRewardAggregator } from '../../src/quality/reward-aggregator.js';
import type { JudgeVerdict, ConsensusResult, JudgeIssue } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerdict(
  model: string,
  score: number,
  verdict: 'approve' | 'reject' | 'revise' = 'approve',
): JudgeVerdict {
  return {
    judgeModel: model,
    verdict,
    score,
    feedback: 'test',
    issues: [],
    durationMs: 1000,
  };
}

function makeConsensus(
  decision: 'approve' | 'reject' | 'revise',
): ConsensusResult {
  return {
    algorithm: 'weighted_majority',
    decision,
    confidence: 0.8,
    entropy: 0.5,
    agreementRatio: 0.8,
  };
}

function makeJudgeResult(
  verdicts: JudgeVerdict[],
  consensus: ConsensusResult,
) {
  return {
    taskId: 'task-1',
    round: 1,
    verdicts,
    consensus,
    issues: [] as JudgeIssue[],
  };
}

describe('RewardAggregator', () => {
  const aggregator = createRewardAggregator();

  it('returns single verdict score for single judge', () => {
    const judgeResult = makeJudgeResult(
      [makeVerdict('claude-opus-4-5', 0.9)],
      makeConsensus('approve'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      0.5,
      10_000,
      0,
      'code',
      'cascade',
    );

    expect(signal.judgeScore).toBeCloseTo(0.9, 5);
    expect(signal.approved).toBe(true);
    expect(signal.taskType).toBe('code');
    expect(signal.strategy).toBe('cascade');
  });

  it('computes weighted average of 2 verdicts', () => {
    // claude-opus-4-5: weight 1.0, score 0.8
    // gpt-4.1-mini: weight 0.6, score 0.6
    // weighted avg = (0.8*1.0 + 0.6*0.6) / (1.0 + 0.6) = 1.16 / 1.6 = 0.725
    const judgeResult = makeJudgeResult(
      [
        makeVerdict('claude-opus-4-5', 0.8),
        makeVerdict('gpt-4.1-mini', 0.6),
      ],
      makeConsensus('approve'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      1.0,
      20_000,
      0,
      'code',
      'balanced',
    );

    expect(signal.judgeScore).toBeCloseTo(0.725, 3);
  });

  it('higher-quality model gets higher weight', () => {
    // opus (1.0) with score 0.5 vs mini (0.6) with score 1.0
    // weighted avg = (0.5*1.0 + 1.0*0.6) / (1.0 + 0.6) = 1.1 / 1.6 = 0.6875
    // Without weighting: (0.5 + 1.0) / 2 = 0.75
    // So opus drags it below 0.75
    const judgeResult = makeJudgeResult(
      [
        makeVerdict('claude-opus-4-5', 0.5),
        makeVerdict('gpt-4.1-mini', 1.0),
      ],
      makeConsensus('approve'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      0.5,
      5000,
      0,
      'code',
      'cascade',
    );

    expect(signal.judgeScore).toBeCloseTo(0.6875, 3);
    // With equal weighting it would be 0.75, but opus pulls it down
    expect(signal.judgeScore).toBeLessThan(0.75);
  });

  it('returns approved=false for rejected consensus', () => {
    const judgeResult = makeJudgeResult(
      [makeVerdict('claude-opus-4-5', 0.2, 'reject')],
      makeConsensus('reject'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      1.0,
      10_000,
      1,
      'code',
      'quality',
    );

    expect(signal.approved).toBe(false);
    expect(signal.redesignCount).toBe(1);
  });

  it('handles 0 verdicts gracefully (score=0)', () => {
    const judgeResult = makeJudgeResult([], makeConsensus('reject'));

    const signal = aggregator.fuse(
      judgeResult,
      0.0,
      0,
      0,
      'code',
      'cascade',
    );

    expect(signal.judgeScore).toBe(0);
  });

  it('passes through teamDesignId when provided', () => {
    const judgeResult = makeJudgeResult(
      [makeVerdict('claude-opus-4-5', 0.8)],
      makeConsensus('approve'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      0.5,
      5000,
      0,
      'code',
      'cascade',
      'design-123',
    );

    expect(signal.teamDesignId).toBe('design-123');
  });

  it('score is clamped to [0, 1] by construction', () => {
    const judgeResult = makeJudgeResult(
      [makeVerdict('claude-opus-4-5', 1.0)],
      makeConsensus('approve'),
    );

    const signal = aggregator.fuse(
      judgeResult,
      0.0,
      0,
      0,
      'code',
      'cascade',
    );

    expect(signal.judgeScore).toBeGreaterThanOrEqual(0);
    expect(signal.judgeScore).toBeLessThanOrEqual(1);
  });
});
