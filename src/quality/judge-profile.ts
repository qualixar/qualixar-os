// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Judge Profile Manager
 * LLD Section 2.3
 *
 * Manages configurable evaluation criteria per task type.
 * Built-in profiles: default, code, research, creative.
 * Custom profiles stored in judge_profiles DB table.
 */

import type { JudgeProfile } from '../types/common.js';
import type { QosDatabase } from '../db/database.js';

// ---------------------------------------------------------------------------
// Built-in Profiles (from REWRITE-SPEC Section 6 + LLD Section 2.3)
// ---------------------------------------------------------------------------

const BUILT_IN_PROFILES: Readonly<Record<string, JudgeProfile>> = {
  default: {
    name: 'default',
    criteria: [
      { name: 'correctness', description: 'Output is factually and logically correct', weight: 0.4 },
      { name: 'completeness', description: 'All aspects of the prompt are addressed', weight: 0.3 },
      { name: 'quality', description: 'Output is well-structured and clear', weight: 0.2 },
      { name: 'safety', description: 'No harmful or biased content', weight: 0.1 },
    ],
    weights: { correctness: 0.4, completeness: 0.3, quality: 0.2, safety: 0.1 },
    minJudges: 2,
    consensusAlgorithm: 'weighted_majority',
    timeoutMs: 60_000,
  },
  code: {
    name: 'code',
    criteria: [
      { name: 'correctness', description: 'Code compiles and produces expected output', weight: 0.35 },
      { name: 'completeness', description: 'All requirements implemented', weight: 0.25 },
      { name: 'quality', description: 'Clean code, good naming, proper error handling', weight: 0.2 },
      { name: 'security', description: 'No vulnerabilities, proper input validation', weight: 0.15 },
      { name: 'performance', description: 'Efficient algorithms and resource usage', weight: 0.05 },
    ],
    weights: { correctness: 0.35, completeness: 0.25, quality: 0.2, security: 0.15, performance: 0.05 },
    minJudges: 2,
    consensusAlgorithm: 'weighted_majority',
    timeoutMs: 120_000,
  },
  research: {
    name: 'research',
    criteria: [
      { name: 'accuracy', description: 'Claims are factually correct and verifiable', weight: 0.4 },
      { name: 'completeness', description: 'Covers all relevant aspects', weight: 0.25 },
      { name: 'sourcing', description: 'Claims backed by credible sources', weight: 0.25 },
      { name: 'clarity', description: 'Well-organized and clearly written', weight: 0.1 },
    ],
    weights: { accuracy: 0.4, completeness: 0.25, sourcing: 0.25, clarity: 0.1 },
    minJudges: 3,
    consensusAlgorithm: 'bft_inspired',
    timeoutMs: 120_000,
  },
  creative: {
    name: 'creative',
    criteria: [
      { name: 'relevance', description: 'Matches the prompt intent', weight: 0.3 },
      { name: 'quality', description: 'Well-crafted, engaging, polished', weight: 0.3 },
      { name: 'originality', description: 'Fresh perspective, not generic', weight: 0.25 },
      { name: 'coherence', description: 'Internal consistency and flow', weight: 0.15 },
    ],
    weights: { relevance: 0.3, quality: 0.3, originality: 0.25, coherence: 0.15 },
    minJudges: 2,
    consensusAlgorithm: 'raft_inspired',
    timeoutMs: 60_000,
  },
  analysis: {
    name: 'analysis',
    criteria: [
      { name: 'accuracy', description: 'Analysis results are factually and logically correct', weight: 0.35 },
      { name: 'completeness', description: 'All relevant aspects are covered', weight: 0.25 },
      { name: 'insight_quality', description: 'Depth and novelty of insights provided', weight: 0.25 },
      { name: 'actionability', description: 'Results can be acted upon effectively', weight: 0.15 },
    ],
    weights: { accuracy: 0.35, completeness: 0.25, insight_quality: 0.25, actionability: 0.15 },
    minJudges: 2,
    consensusAlgorithm: 'weighted_majority',
    timeoutMs: 90_000,
  },
};

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface JudgeProfileManager {
  getProfile(name: string): JudgeProfile;
  listProfiles(): readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class JudgeProfileManagerImpl implements JudgeProfileManager {
  private readonly db: QosDatabase | undefined;

  constructor(db?: QosDatabase) {
    this.db = db;
  }

  getProfile(name: string): JudgeProfile {
    // 1. Check built-in profiles
    if (BUILT_IN_PROFILES[name] !== undefined) {
      return BUILT_IN_PROFILES[name];
    }

    // 2. Check DB for custom profile
    if (this.db !== undefined) {
      const row = this.db.get<{ config: string }>(
        'SELECT config FROM judge_profiles WHERE name = ?',
        [name],
      );
      if (row !== undefined) {
        const profile = JSON.parse(row.config) as JudgeProfile;
        return {
          ...profile,
          weights: this.normalizeWeights(profile.weights),
        };
      }
    }

    // 3. Fallback to default
    return BUILT_IN_PROFILES['default'];
  }

  listProfiles(): readonly string[] {
    const builtIn = Object.keys(BUILT_IN_PROFILES);
    let custom: string[] = [];

    if (this.db !== undefined) {
      try {
        const rows = this.db.query<{ name: string }>(
          'SELECT name FROM judge_profiles',
        );
        custom = rows.map((r) => r.name);
      } catch {
        // Table may not exist yet if migrations haven't run
        custom = [];
      }
    }

    return Object.freeze([...new Set([...builtIn, ...custom])]);
  }

  private normalizeWeights(
    weights: Record<string, number>,
  ): Record<string, number> {
    const totalWeight = Object.values(weights).reduce(
      (sum, w) => sum + w,
      0,
    );
    if (totalWeight === 0) {
      throw new Error('All weights are zero');
    }
    const normalized: Record<string, number> = {};
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = value / totalWeight;
    }
    return normalized;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createJudgeProfileManager(
  db?: QosDatabase,
): JudgeProfileManager {
  return new JudgeProfileManagerImpl(db);
}
