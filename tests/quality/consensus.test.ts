/**
 * Qualixar OS Phase 3 -- Consensus Engine Tests
 * TDD Sequence #1: Pure math, zero dependencies.
 */

import { describe, it, expect } from 'vitest';
import { createConsensusEngine, getModelQualityWeight } from '../../src/quality/consensus.js';
import type { JudgeVerdict } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerdict(
  verdict: 'approve' | 'reject' | 'revise',
  model: string = 'claude-sonnet-4-6',
  score: number = 0.8,
): JudgeVerdict {
  return {
    judgeModel: model,
    verdict,
    score,
    feedback: `Feedback for ${verdict}`,
    issues: [],
    durationMs: 1000,
  };
}

describe('ConsensusEngine', () => {
  const engine = createConsensusEngine();

  // -------------------------------------------------------------------------
  // getModelQualityWeight
  // -------------------------------------------------------------------------

  describe('getModelQualityWeight', () => {
    it('returns exact match weight for known models', () => {
      expect(getModelQualityWeight('claude-opus-4-5')).toBe(1.0);
      expect(getModelQualityWeight('gpt-4.1')).toBe(0.9);
      expect(getModelQualityWeight('gemini-2.5-pro')).toBe(0.9);
      expect(getModelQualityWeight('claude-sonnet-4-6')).toBe(0.8);
      expect(getModelQualityWeight('gpt-4.1-mini')).toBe(0.6);
      expect(getModelQualityWeight('gemini-2.0-flash')).toBe(0.6);
    });

    it('returns prefix match for versioned models', () => {
      expect(getModelQualityWeight('claude-opus-4-5-2026')).toBe(1.0);
      expect(getModelQualityWeight('gpt-4.1-turbo')).toBe(0.9);
    });

    it('returns 0.5 for local/bitnet models', () => {
      expect(getModelQualityWeight('local:bitnet-3b')).toBe(0.5);
      expect(getModelQualityWeight('bitnet-3b')).toBe(0.5);
    });

    it('returns 0.5 for unknown models', () => {
      expect(getModelQualityWeight('some-unknown-model')).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // weighted_majority
  // -------------------------------------------------------------------------

  describe('weighted_majority', () => {
    it('returns approve when 3 judges approve', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
        makeVerdict('approve', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.algorithm).toBe('weighted_majority');
      expect(result.decision).toBe('approve');
      expect(result.agreementRatio).toBe(1.0);
    });

    it('returns reject when 2 reject + 1 approve', () => {
      const verdicts = [
        makeVerdict('reject', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('approve', 'gpt-4.1-mini'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.decision).toBe('reject');
    });

    it('returns revise when ratio is between 0.3 and 0.5', () => {
      // 1 revise (0.8*0.5=0.4) + 1 reject (0.6*0=0)
      // ratio = 0.4 / 1.4 ≈ 0.286 -> reject actually
      // Let me construct properly: we need ratio between 0.3 and 0.5
      // 1 approve (0.6*1=0.6) + 2 reject (0.9*0 + 0.8*0 = 0)
      // ratio = 0.6 / 2.3 ≈ 0.26 -> reject
      // Use: 1 revise (1.0*0.5=0.5) + 1 reject (0.9*0=0)
      // ratio = 0.5 / 1.9 ≈ 0.26 -> reject still
      // Use: 2 revise + 1 reject
      // 2*(0.9*0.5)=0.9 + 1*(0.8*0.0)=0 = 0.9, total_w=0.9+0.9+0.8=2.6
      // ratio = 0.9/2.6 = 0.346 -> revise!
      const verdicts = [
        makeVerdict('revise', 'gpt-4.1'),
        makeVerdict('revise', 'gemini-2.5-pro'),
        makeVerdict('reject', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.decision).toBe('revise');
    });

    it('computes confidence as distance from 0.5 boundary', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      // ratio = 1.0 -> confidence = |1.0 - 0.5| * 2 = 1.0
      expect(result.confidence).toBe(1.0);
    });

    it('returns entropy of 0 for unanimous verdict', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.entropy).toBe(0);
    });

    it('returns positive entropy for split verdict', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('revise', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.entropy).toBeGreaterThan(0);
    });

    it('handles empty verdicts gracefully', () => {
      const result = engine.resolve([], 'weighted_majority');
      expect(result.decision).toBe('reject');
      expect(result.agreementRatio).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // bft_inspired
  // -------------------------------------------------------------------------

  describe('bft_inspired', () => {
    it('throws with fewer than 3 judges', () => {
      const verdicts = [
        makeVerdict('approve'),
        makeVerdict('approve'),
      ];
      expect(() => engine.resolve(verdicts, 'bft_inspired')).toThrow(
        'bft_inspired requires minimum 3 judges',
      );
    });

    it('returns approve when 2/3 agree (ceil(2/3*3)=2)', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
        makeVerdict('reject', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'bft_inspired');
      expect(result.decision).toBe('approve');
      expect(result.algorithm).toBe('bft_inspired');
    });

    it('returns revise when no supermajority', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('revise', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'bft_inspired');
      expect(result.decision).toBe('revise');
    });

    it('returns reject when 3/3 reject', () => {
      const verdicts = [
        makeVerdict('reject', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('reject', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'bft_inspired');
      expect(result.decision).toBe('reject');
    });

    it('computes confidence as ratio of majority', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
        makeVerdict('approve', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'bft_inspired');
      expect(result.confidence).toBe(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // raft_inspired
  // -------------------------------------------------------------------------

  describe('raft_inspired', () => {
    it('throws with 0 judges', () => {
      expect(() => engine.resolve([], 'raft_inspired')).toThrow(
        'raft_inspired requires at least 1 judge',
      );
    });

    it('returns leader verdict with single judge', () => {
      const verdicts = [makeVerdict('approve', 'claude-opus-4-5')];
      const result = engine.resolve(verdicts, 'raft_inspired');
      expect(result.decision).toBe('approve');
      expect(result.confidence).toBe(0.5);
      expect(result.entropy).toBe(0);
      expect(result.agreementRatio).toBe(1.0);
    });

    it('returns leader verdict when confirmed by majority', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('approve', 'gpt-4.1'),
        makeVerdict('reject', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'raft_inspired');
      expect(result.decision).toBe('approve');
    });

    it('overrides leader when followers disagree', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('reject', 'claude-sonnet-4-6'),
        makeVerdict('reject', 'gpt-4.1-mini'),
      ];
      const result = engine.resolve(verdicts, 'raft_inspired');
      expect(result.decision).toBe('reject');
    });

    it('leader wins on tie among followers', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('revise', 'claude-sonnet-4-6'),
      ];
      // followers: 1 reject, 1 revise -> tie -> leader (approve) wins
      const result = engine.resolve(verdicts, 'raft_inspired');
      expect(result.decision).toBe('approve');
    });
  });

  // -------------------------------------------------------------------------
  // shannonEntropy
  // -------------------------------------------------------------------------

  describe('entropy', () => {
    it('returns 0 for unanimous decision', () => {
      const verdicts = [
        makeVerdict('approve'),
        makeVerdict('approve'),
        makeVerdict('approve'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.entropy).toBe(0);
    });

    it('returns max entropy for perfect 3-way split', () => {
      const verdicts = [
        makeVerdict('approve', 'claude-opus-4-5'),
        makeVerdict('reject', 'gpt-4.1'),
        makeVerdict('revise', 'claude-sonnet-4-6'),
      ];
      const result = engine.resolve(verdicts, 'weighted_majority');
      expect(result.entropy).toBeCloseTo(Math.log2(3), 5);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown algorithm
  // -------------------------------------------------------------------------

  it('throws on unknown algorithm', () => {
    expect(() =>
      engine.resolve([], 'unknown_algo' as 'weighted_majority'),
    ).toThrow('Unknown consensus algorithm');
  });
});
