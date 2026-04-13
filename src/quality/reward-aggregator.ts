// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Reward Aggregator
 * LLD Section 2.8
 *
 * Fuse multiple judge scores into a single RewardSignal.
 * Weighted average using model quality weights.
 * Pure math, no I/O, stateless.
 */

import type { JudgeResult, JudgeVerdict } from '../types/common.js';
import { getModelQualityWeight } from './consensus.js';

// ---------------------------------------------------------------------------
// RewardSignal (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface RewardSignal {
  readonly taskId: string;
  readonly taskType: string;
  readonly strategy: string;
  readonly teamDesignId?: string;
  readonly judgeScore: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly approved: boolean;
  readonly redesignCount: number;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface RewardAggregator {
  fuse(
    judgeResult: JudgeResult,
    costUsd: number,
    durationMs: number,
    redesignCount: number,
    taskType: string,
    strategy: string,
    teamDesignId?: string,
  ): RewardSignal;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class RewardAggregatorImpl implements RewardAggregator {
  fuse(
    judgeResult: JudgeResult,
    costUsd: number,
    durationMs: number,
    redesignCount: number,
    taskType: string,
    strategy: string,
    teamDesignId?: string,
  ): RewardSignal {
    const verdicts: readonly JudgeVerdict[] = judgeResult.verdicts;

    // Weight scores by judge model quality
    const weights = verdicts.map((v) => getModelQualityWeight(v.judgeModel));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Compute weighted average score
    let weightedScore = 0;
    for (let i = 0; i < verdicts.length; i++) {
      weightedScore += verdicts[i].score * weights[i];
    }
    const judgeScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    return {
      taskId: judgeResult.taskId,
      taskType,
      strategy,
      teamDesignId,
      judgeScore,
      costUsd,
      durationMs,
      approved: judgeResult.consensus.decision === 'approve',
      redesignCount,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRewardAggregator(): RewardAggregator {
  return new RewardAggregatorImpl();
}
