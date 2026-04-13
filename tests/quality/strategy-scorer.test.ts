/**
 * Qualixar OS Phase 3 -- Strategy Scorer Tests
 * TDD Sequence #7: Reward computation, convergence, events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStrategyScorer } from '../../src/quality/strategy-scorer.js';
import { createStrategyMemory } from '../../src/quality/strategy-memory.js';
import { createDatabase } from '../../src/db/database.js';
import { createEventBus } from '../../src/events/event-bus.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { StrategyMemory } from '../../src/quality/strategy-memory.js';
import type { RewardSignal } from '../../src/quality/reward-aggregator.js';

function makeSignal(overrides: Partial<RewardSignal> = {}): RewardSignal {
  return {
    taskId: 'task-1',
    taskType: 'code',
    strategy: 'cascade',
    judgeScore: 0.8,
    costUsd: 0.5,
    durationMs: 10_000,
    approved: true,
    redesignCount: 0,
    ...overrides,
  };
}

describe('StrategyScorer', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let sm: StrategyMemory;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
    eventBus = createEventBus(db);
    sm = createStrategyMemory(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // recordOutcome
  // -------------------------------------------------------------------------

  it('creates strategy memory entry on first outcome', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(makeSignal());

    const record = sm.get('code', 'cascade');
    expect(record).toBeDefined();
    expect(record!.success_count).toBe(1);
    expect(record!.failure_count).toBe(0);
  });

  it('updates strategy memory on subsequent outcomes', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(makeSignal());
    trainer.recordOutcome(makeSignal({ approved: false }));

    const record = sm.get('code', 'cascade');
    expect(record!.success_count).toBe(1);
    expect(record!.failure_count).toBe(1);
  });

  it('computes correct composite reward', () => {
    const trainer = createStrategyScorer(sm, db, eventBus, 10, 300_000);
    trainer.recordOutcome(
      makeSignal({
        judgeScore: 1.0,
        costUsd: 0.0,
        durationMs: 0,
        approved: true,
      }),
    );

    // reward = 1.0*0.5 + (1-0/10)*0.3 + (1-0/300000)*0.1 + 0.1
    // = 0.5 + 0.3 + 0.1 + 0.1 = 1.0 (clamped to 1.0)
    const record = sm.get('code', 'cascade');
    expect(record!.avg_reward).toBeCloseTo(1.0, 1);
  });

  it('applies negative approval component for rejected signals', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(
      makeSignal({
        judgeScore: 0.2,
        costUsd: 9.0,
        durationMs: 250_000,
        approved: false,
      }),
    );

    const record = sm.get('code', 'cascade');
    // Low score, high cost, long time, not approved -> low reward
    expect(record!.avg_reward).toBeLessThan(0.3);
  });

  it('uses EMA for avg_reward updates', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    // First signal: high reward
    trainer.recordOutcome(
      makeSignal({
        taskId: 'task-1',
        judgeScore: 1.0,
        costUsd: 0,
        durationMs: 0,
        approved: true,
      }),
    );
    const first = sm.get('code', 'cascade');
    const firstReward = first!.avg_reward;

    // Second signal: low reward
    trainer.recordOutcome(
      makeSignal({
        taskId: 'task-2',
        judgeScore: 0.2,
        costUsd: 9.0,
        durationMs: 250_000,
        approved: false,
      }),
    );
    const second = sm.get('code', 'cascade');

    // EMA should smooth: new = old * 0.9 + new * 0.1
    // So second avg should be closer to first than to new
    expect(second!.avg_reward).toBeGreaterThan(0.0);
    expect(second!.avg_reward).toBeLessThan(firstReward);
  });

  it('increases confidence with more samples', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    trainer.recordOutcome(makeSignal({ taskId: 'task-1' }));
    const after1 = sm.get('code', 'cascade');

    for (let i = 2; i <= 10; i++) {
      trainer.recordOutcome(makeSignal({ taskId: `task-${i}` }));
    }
    const after10 = sm.get('code', 'cascade');

    expect(after10!.confidence).toBeGreaterThan(after1!.confidence);
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  it('emits rl:reward_recorded on every outcome', () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('rl:reward_recorded', handler);

    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(makeSignal());

    expect(handler).toHaveBeenCalled();
  });

  it('emits rl:strategy_learned when confidence crosses 0.8', () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('rl:strategy_learned', handler);

    const trainer = createStrategyScorer(sm, db, eventBus);

    // Pump many outcomes to build confidence
    // confidence = 1 - 1/(1 + n*0.1), need n where this >= 0.8
    // 0.8 = 1 - 1/(1+n*0.1) => 1/(1+n*0.1) = 0.2 => 1+n*0.1 = 5 => n = 40
    for (let i = 0; i < 45; i++) {
      trainer.recordOutcome(
        makeSignal({ taskId: `task-${i}`, approved: true }),
      );
    }

    expect(handler).toHaveBeenCalled();
  });

  it('does not emit rl:strategy_learned below threshold', () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('rl:strategy_learned', handler);

    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(makeSignal());

    expect(handler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // RL training log
  // -------------------------------------------------------------------------

  it('inserts into rl_training_log', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    trainer.recordOutcome(makeSignal());

    const row = db.get<{ task_id: string }>(
      'SELECT task_id FROM rl_training_log WHERE task_id = ?',
      ['task-1'],
    );
    expect(row).toBeDefined();
    expect(row!.task_id).toBe('task-1');
  });

  // -------------------------------------------------------------------------
  // getRecommendation
  // -------------------------------------------------------------------------

  it('returns cascade default with no data', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    const rec = trainer.getRecommendation('code');
    expect(rec.strategy).toBe('cascade');
    expect(rec.confidence).toBe(0.5);
    expect(rec.basedOnSamples).toBe(0);
  });

  it('returns cascade fallback when all strategies have low confidence (lines 200-204)', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    // Record just 1 outcome for a strategy -- confidence = 1 - 1/(1+1*0.1) = 0.0909
    // That's below the 0.3 viable threshold
    trainer.recordOutcome(
      makeSignal({ taskId: 'task-low', strategy: 'lowconf', approved: true }),
    );

    const record = sm.get('code', 'lowconf');
    expect(record).toBeDefined();
    // Verify confidence is indeed below 0.3
    expect(record!.confidence).toBeLessThan(0.3);

    const rec = trainer.getRecommendation('code');
    // All strategies below 0.3 confidence -> viable.length === 0 -> fallback
    expect(rec.strategy).toBe('cascade');
    expect(rec.confidence).toBe(0.5);
    expect(rec.basedOnSamples).toBe(0);
    // Alternatives should list the low-confidence strategies
    expect(rec.alternatives.length).toBeGreaterThan(0);
    expect(rec.alternatives[0].strategy).toBe('lowconf');
  });

  it('returns best strategy based on avg_reward', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    // Record many signals for 'quality' strategy
    for (let i = 0; i < 20; i++) {
      trainer.recordOutcome(
        makeSignal({
          taskId: `q-${i}`,
          strategy: 'quality',
          judgeScore: 0.95,
          approved: true,
        }),
      );
    }

    // Record signals for 'cheapest' with lower scores
    for (let i = 0; i < 20; i++) {
      trainer.recordOutcome(
        makeSignal({
          taskId: `c-${i}`,
          strategy: 'cheapest',
          judgeScore: 0.4,
          approved: false,
        }),
      );
    }

    const rec = trainer.getRecommendation('code');
    expect(rec.strategy).toBe('quality');
    expect(rec.alternatives.length).toBeGreaterThan(0);
  });

  it('CONVERGENCE: learns best strategy over 15+ rounds', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    // Strategy A: consistently good
    for (let i = 0; i < 15; i++) {
      trainer.recordOutcome(
        makeSignal({
          taskId: `a-${i}`,
          strategy: 'strategyA',
          judgeScore: 0.9,
          costUsd: 1.0,
          durationMs: 5000,
          approved: true,
        }),
      );
    }

    // Strategy B: consistently bad
    for (let i = 0; i < 15; i++) {
      trainer.recordOutcome(
        makeSignal({
          taskId: `b-${i}`,
          strategy: 'strategyB',
          judgeScore: 0.2,
          costUsd: 8.0,
          durationMs: 200_000,
          approved: false,
        }),
      );
    }

    const rec = trainer.getRecommendation('code');
    expect(rec.strategy).toBe('strategyA');
    expect(rec.confidence).toBeGreaterThan(0.3);
  });

  // -------------------------------------------------------------------------
  // getTrainingStats
  // -------------------------------------------------------------------------

  it('returns correct training stats', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);

    trainer.recordOutcome(
      makeSignal({ strategy: 'cascade', approved: true }),
    );
    trainer.recordOutcome(
      makeSignal({
        taskId: 'task-2',
        strategy: 'quality',
        approved: false,
      }),
    );

    const stats = trainer.getTrainingStats();
    expect(stats.totalOutcomes).toBe(2);
    expect(stats.strategyCounts['cascade']).toBe(1);
    expect(stats.strategyCounts['quality']).toBe(1);
    expect(stats.topStrategies['code']).toBeDefined();
  });

  it('returns empty stats with no data', () => {
    const trainer = createStrategyScorer(sm, db, eventBus);
    const stats = trainer.getTrainingStats();
    expect(stats.totalOutcomes).toBe(0);
  });
});
