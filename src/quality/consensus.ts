// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Consensus Engine
 * LLD Section 2.2
 *
 * Three consensus algorithms for judge verdicts:
 * - weighted_majority: Sum weighted votes. Approve if weighted approval > 0.5.
 * - bft_inspired: Requires 2/3 agreement. Single judge overridden by all others. Min 3.
 * - raft_inspired: First judge is "leader." Others confirm/reject. Split = leader wins.
 *
 * Pure math, no I/O, stateless.
 */

import type { JudgeVerdict, ConsensusResult } from '../types/common.js';

// ---------------------------------------------------------------------------
// Model Quality Weights (shared utility)
// ---------------------------------------------------------------------------

export const MODEL_QUALITY_WEIGHTS: Readonly<Record<string, number>> = {
  'claude-opus-4-5': 1.0,
  'gpt-4.1': 0.9,
  'gemini-2.5-pro': 0.9,
  'claude-sonnet-4-6': 0.8,
  'gpt-4.1-mini': 0.6,
  'gemini-2.0-flash': 0.6,
};

/**
 * Return quality weight for a model. Used by consensus + reward-aggregator.
 * Exact match -> prefix match -> local/bitnet -> 0.5 default.
 */
export function getModelQualityWeight(model: string): number {
  if (MODEL_QUALITY_WEIGHTS[model] !== undefined) {
    return MODEL_QUALITY_WEIGHTS[model];
  }
  for (const [key, weight] of Object.entries(MODEL_QUALITY_WEIGHTS)) {
    if (model.startsWith(key)) {
      return weight;
    }
  }
  if (model.includes('local') || model.includes('bitnet')) {
    return 0.5;
  }
  return 0.5;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface ConsensusEngine {
  resolve(
    verdicts: readonly JudgeVerdict[],
    algorithm: ConsensusResult['algorithm'],
  ): ConsensusResult;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ConsensusEngineImpl implements ConsensusEngine {
  resolve(
    verdicts: readonly JudgeVerdict[],
    algorithm: ConsensusResult['algorithm'],
  ): ConsensusResult {
    switch (algorithm) {
      case 'weighted_majority':
        return this.weightedMajority(verdicts);
      case 'bft_inspired':
        return this.bftInspired(verdicts);
      case 'raft_inspired':
        return this.raftInspired(verdicts);
      default:
        throw new Error(`Unknown consensus algorithm: ${algorithm as string}`);
    }
  }

  private weightedMajority(
    verdicts: readonly JudgeVerdict[],
  ): ConsensusResult {
    const weights = verdicts.map((v) => getModelQualityWeight(v.judgeModel));

    let totalWeightedVote = 0;
    let totalWeight = 0;
    for (let i = 0; i < verdicts.length; i++) {
      const voteValue =
        verdicts[i].verdict === 'approve'
          ? 1.0
          : verdicts[i].verdict === 'revise'
            ? 0.5
            : 0.0;
      totalWeightedVote += weights[i] * voteValue;
      totalWeight += weights[i];
    }

    const ratio = totalWeight > 0 ? totalWeightedVote / totalWeight : 0;

    let decision: 'approve' | 'reject' | 'revise';
    if (ratio > 0.5) {
      decision = 'approve';
    } else if (ratio > 0.3) {
      decision = 'revise';
    } else {
      decision = 'reject';
    }

    const confidence = Math.abs(ratio - 0.5) * 2;
    const entropy = this.shannonEntropy(verdicts);
    const agreementCount = verdicts.filter(
      (v) => v.verdict === decision,
    ).length;
    const agreementRatio =
      verdicts.length > 0 ? agreementCount / verdicts.length : 0;

    return {
      algorithm: 'weighted_majority',
      decision,
      confidence,
      entropy,
      agreementRatio,
    };
  }

  private bftInspired(verdicts: readonly JudgeVerdict[]): ConsensusResult {
    if (verdicts.length < 3) {
      throw new Error('bft_inspired requires minimum 3 judges');
    }

    const counts: Record<string, number> = {
      approve: 0,
      reject: 0,
      revise: 0,
    };
    for (const v of verdicts) {
      counts[v.verdict]++;
    }

    const sortedVerdicts = Object.entries(counts).sort(
      (a, b) => b[1] - a[1],
    );
    const [mostCommonVerdict, mostCommonCount] = sortedVerdicts[0];

    const threshold = Math.ceil((2 / 3) * verdicts.length);

    let decision: 'approve' | 'reject' | 'revise';
    if (mostCommonCount >= threshold) {
      decision = mostCommonVerdict as 'approve' | 'reject' | 'revise';
    } else {
      decision = 'revise';
    }

    const _confidence = mostCommonCount / verdicts.length;
    const entropy = this.shannonEntropy(verdicts);
    const agreementRatio = mostCommonCount / verdicts.length;

    return {
      algorithm: 'bft_inspired',
      decision,
      confidence: _confidence,
      entropy,
      agreementRatio,
    };
  }

  private raftInspired(verdicts: readonly JudgeVerdict[]): ConsensusResult {
    if (verdicts.length === 0) {
      throw new Error('raft_inspired requires at least 1 judge');
    }

    const leader = verdicts[0];
    const followers = verdicts.slice(1);

    if (followers.length === 0) {
      return {
        algorithm: 'raft_inspired',
        decision: leader.verdict,
        confidence: 0.5,
        entropy: 0,
        agreementRatio: 1.0,
      };
    }

    const confirmations = followers.filter(
      (f) => f.verdict === leader.verdict,
    ).length;
    const confirmThreshold = Math.ceil(followers.length / 2);

    let decision: 'approve' | 'reject' | 'revise';
    if (confirmations >= confirmThreshold) {
      decision = leader.verdict;
    } else {
      const followerCounts: Record<string, number> = {
        approve: 0,
        reject: 0,
        revise: 0,
      };
      for (const f of followers) {
        followerCounts[f.verdict]++;
      }
      const sorted = Object.entries(followerCounts).sort(
        (a, b) => b[1] - a[1],
      );
      if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
        decision = leader.verdict;
      } else {
        decision = sorted[0][0] as 'approve' | 'reject' | 'revise';
      }
    }

    const totalAgreeing = verdicts.filter(
      (v) => v.verdict === decision,
    ).length;
    const _confidence = totalAgreeing / verdicts.length;
    const entropy = this.shannonEntropy(verdicts);
    const agreementRatio = totalAgreeing / verdicts.length;

    return {
      algorithm: 'raft_inspired',
      decision,
      confidence: _confidence,
      entropy,
      agreementRatio,
    };
  }

  private shannonEntropy(verdicts: readonly JudgeVerdict[]): number {
    const total = verdicts.length;
    if (total === 0) return 0;

    const counts: Record<string, number> = {
      approve: 0,
      reject: 0,
      revise: 0,
    };
    for (const v of verdicts) {
      counts[v.verdict]++;
    }

    let entropy = 0;
    for (const count of Object.values(counts)) {
      if (count === 0) continue;
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createConsensusEngine(): ConsensusEngine {
  return new ConsensusEngineImpl();
}
