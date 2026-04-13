// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Strategy Scorer
 * LLD Section 2.7
 *
 * Converts judge rejections into weighted scoring signals and strategy updates.
 * Records outcomes to strategy_memory and rl_training_log.
 * Emits rl:reward_recorded and rl:strategy_learned events.
 *
 * Note: This is a weighted scoring function, not reinforcement learning.
 * The name "Strategy Scorer" reflects the actual algorithm: composite
 * reward = quality*0.5 + cost*0.3 + speed*0.1 + approval*0.1, tracked
 * via exponential moving average per strategy.
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { StrategyMemory, StrategyRecord } from './strategy-memory.js';
import type { RewardSignal } from './reward-aggregator.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface StrategyRecommendation {
  readonly strategy: string;
  readonly confidence: number;
  readonly basedOnSamples: number;
  readonly alternatives: readonly { readonly strategy: string; readonly score: number }[];
}

export interface TrainingStats {
  readonly totalOutcomes: number;
  readonly strategyCounts: Record<string, number>;
  readonly avgRewardByStrategy: Record<string, number>;
  readonly topStrategies: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface StrategyScorer {
  recordOutcome(signal: RewardSignal): void;
  getRecommendation(taskType: string): StrategyRecommendation;
  getTrainingStats(): TrainingStats;
  getStats(): Record<string, unknown>;
  getStrategies(): readonly { readonly name: string; readonly score: number }[] | null;
}

/** @deprecated Use StrategyScorer instead. Alias kept for backward compat. */
export type RLTrainer = StrategyScorer;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class StrategyScorerImpl implements StrategyScorer {
  private readonly strategyMemory: StrategyMemory;
  private readonly db: QosDatabase;
  private readonly eventBus: EventBus;
  private readonly budgetMax: number;
  private readonly timeoutMs: number;
  private readonly confidenceThreshold: number;

  constructor(
    strategyMemory: StrategyMemory,
    db: QosDatabase,
    eventBus: EventBus,
    budgetMax: number = 10,
    timeoutMs: number = 300_000,
  ) {
    this.strategyMemory = strategyMemory;
    this.db = db;
    this.eventBus = eventBus;
    this.budgetMax = budgetMax;
    this.timeoutMs = timeoutMs;
    this.confidenceThreshold = 0.8;
  }

  recordOutcome(signal: RewardSignal): void {
    // Step 1: Compute composite reward
    const qualityComponent = signal.judgeScore * 0.5;
    const costComponent =
      (1 - Math.min(signal.costUsd / this.budgetMax, 1)) * 0.3;
    const speedComponent =
      (1 - Math.min(signal.durationMs / this.timeoutMs, 1)) * 0.1;
    const approvalComponent = signal.approved ? 0.1 : -0.1;
    const reward =
      qualityComponent + costComponent + speedComponent + approvalComponent;
    const clampedReward = Math.max(-1, Math.min(1, reward));

    // Step 2: UPSERT strategy_memory
    const existing = this.strategyMemory.get(
      signal.taskType,
      signal.strategy,
    );

    if (existing !== undefined) {
      const newSuccessCount =
        existing.success_count + (signal.approved ? 1 : 0);
      const newFailureCount =
        existing.failure_count + (signal.approved ? 0 : 1);
      const totalSamples = newSuccessCount + newFailureCount;
      const alpha = 0.1;
      const newAvgReward =
        existing.avg_reward * (1 - alpha) + clampedReward * alpha;
      const newConfidence = 1 - 1 / (1 + totalSamples * 0.1);

      this.strategyMemory.upsert({
        taskType: signal.taskType,
        strategy: signal.strategy,
        successCount: newSuccessCount,
        failureCount: newFailureCount,
        avgReward: newAvgReward,
        confidence: newConfidence,
      });
    } else {
      this.strategyMemory.upsert({
        taskType: signal.taskType,
        strategy: signal.strategy,
        successCount: signal.approved ? 1 : 0,
        failureCount: signal.approved ? 0 : 1,
        avgReward: clampedReward,
        confidence: 0.1,
      });
    }

    // Step 3: Insert into rl_training_log
    try {
      this.db.insert('rl_training_log', {
        id: generateId(),
        task_id: signal.taskId,
        state: JSON.stringify({
          taskType: signal.taskType,
          redesignCount: signal.redesignCount,
        }),
        action: JSON.stringify({
          strategy: signal.strategy,
          teamDesignId: signal.teamDesignId,
        }),
        reward: clampedReward,
        next_state: JSON.stringify({
          approved: signal.approved,
          judgeScore: signal.judgeScore,
        }),
        created_at: new Date().toISOString(),
      });
    } catch {
      // Training log write failed -- strategy memory already updated
    }

    // Step 4: Emit event
    this.eventBus.emit({
      type: 'rl:reward_recorded',
      payload: {
        taskId: signal.taskId,
        taskType: signal.taskType,
        strategy: signal.strategy,
        reward: clampedReward,
        approved: signal.approved,
      },
      source: 'strategy-scorer',
      taskId: signal.taskId,
    });

    // Step 5: Check confidence threshold
    const updated = this.strategyMemory.get(
      signal.taskType,
      signal.strategy,
    );
    if (
      updated !== undefined &&
      updated.confidence >= this.confidenceThreshold
    ) {
      const previousConfidence = existing?.confidence ?? 0;
      if (previousConfidence < this.confidenceThreshold) {
        this.eventBus.emit({
          type: 'rl:strategy_learned',
          payload: {
            taskType: signal.taskType,
            strategy: signal.strategy,
            confidence: updated.confidence,
            avgReward: updated.avg_reward,
            samples: updated.success_count + updated.failure_count,
          },
          source: 'strategy-scorer',
          taskId: signal.taskId,
        });
      }
    }
  }

  getRecommendation(taskType: string): StrategyRecommendation {
    const strategies = this.strategyMemory.getByTaskType(taskType);

    if (strategies.length === 0) {
      return {
        strategy: 'cascade',
        confidence: 0.5,
        basedOnSamples: 0,
        alternatives: [],
      };
    }

    // Filter viable strategies (confidence > 0.3)
    const viable = strategies.filter((s) => s.confidence > 0.3);

    if (viable.length === 0) {
      return {
        strategy: 'cascade',
        confidence: 0.5,
        basedOnSamples: 0,
        alternatives: strategies.map((s) => ({
          strategy: s.strategy,
          score: s.avg_reward,
        })),
      };
    }

    // Sort by avg_reward descending
    const sorted = [...viable].sort(
      (a, b) => b.avg_reward - a.avg_reward,
    );
    const top = sorted[0];

    return {
      strategy: top.strategy,
      confidence: top.confidence,
      basedOnSamples: top.success_count + top.failure_count,
      alternatives: sorted.slice(1).map((s) => ({
        strategy: s.strategy,
        score: s.avg_reward,
      })),
    };
  }

  getTrainingStats(): TrainingStats {
    const allStrategies = this.strategyMemory.getAll();

    const totalOutcomes = allStrategies.reduce(
      (sum, s) => sum + s.success_count + s.failure_count,
      0,
    );

    const strategyCounts: Record<string, number> = {};
    const avgRewardByStrategy: Record<string, number> = {};

    for (const s of allStrategies) {
      const key = s.strategy;
      strategyCounts[key] =
        (strategyCounts[key] ?? 0) + s.success_count + s.failure_count;
      avgRewardByStrategy[key] = s.avg_reward;
    }

    // Top strategy per task type
    const taskTypes = [...new Set(allStrategies.map((s) => s.task_type))];
    const topStrategies: Record<string, string> = {};
    for (const tt of taskTypes) {
      const best = allStrategies
        .filter((s) => s.task_type === tt)
        .sort((a, b) => b.avg_reward - a.avg_reward)[0];
      if (best) {
        topStrategies[tt] = best.strategy;
      }
    }

    return { totalOutcomes, strategyCounts, avgRewardByStrategy, topStrategies };
  }

  getStats(): Record<string, unknown> {
    return this.getTrainingStats() as unknown as Record<string, unknown>;
  }

  getStrategies(): readonly { readonly name: string; readonly score: number }[] | null {
    const allStrategies = this.strategyMemory.getAll();
    if (allStrategies.length === 0) return null;
    return allStrategies.map((s) => ({ name: s.strategy, score: s.avg_reward }));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStrategyScorer(
  strategyMemory: StrategyMemory,
  db: QosDatabase,
  eventBus: EventBus,
  budgetMax?: number,
  timeoutMs?: number,
): StrategyScorer {
  return new StrategyScorerImpl(strategyMemory, db, eventBus, budgetMax, timeoutMs);
}

/** @deprecated Use createStrategyScorer instead. Will be removed in v3.0. */
export const createRLTrainer = createStrategyScorer;
