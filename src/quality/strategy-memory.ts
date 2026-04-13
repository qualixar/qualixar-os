// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Strategy Memory
 * LLD Section 2.9
 *
 * SQLite-backed store for task_type -> strategy effectiveness.
 * Temporal decay on confidence (exponential, 0.01/day).
 * SERIALIZABLE transactions for concurrent safety.
 */

import type { QosDatabase } from '../db/database.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyRecord {
  readonly id: string;
  readonly task_type: string;
  readonly strategy: string;
  readonly success_count: number;
  readonly failure_count: number;
  readonly avg_reward: number;
  readonly confidence: number;
  readonly last_used: string;
  readonly updated_at: string;
}

export interface StrategyUpsertInput {
  readonly taskType: string;
  readonly strategy: string;
  readonly successCount: number;
  readonly failureCount: number;
  readonly avgReward: number;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface StrategyMemory {
  get(taskType: string, strategy: string): StrategyRecord | undefined;
  upsert(entry: StrategyUpsertInput): void;
  getByTaskType(taskType: string): StrategyRecord[];
  getAll(): StrategyRecord[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class StrategyMemoryImpl implements StrategyMemory {
  private readonly db: QosDatabase;
  private readonly decayRate: number;

  constructor(db: QosDatabase, decayRate: number = 0.01) {
    this.db = db;
    this.decayRate = decayRate;
  }

  get(taskType: string, strategy: string): StrategyRecord | undefined {
    const row = this.db.get<StrategyRecord>(
      'SELECT * FROM strategy_memory WHERE task_type = ? AND strategy = ?',
      [taskType, strategy],
    );

    if (row === undefined) {
      return undefined;
    }

    return this.applyDecay(row);
  }

  upsert(entry: StrategyUpsertInput): void {
    const now = new Date().toISOString();

    // Use transaction for concurrent safety
    const transaction = this.db.db.transaction(() => {
      const existing = this.db.get<{ id: string }>(
        'SELECT id FROM strategy_memory WHERE task_type = ? AND strategy = ?',
        [entry.taskType, entry.strategy],
      );

      if (existing !== undefined) {
        this.db.db
          .prepare(
            'UPDATE strategy_memory SET success_count = ?, failure_count = ?, avg_reward = ?, confidence = ?, last_used = ?, updated_at = ? WHERE task_type = ? AND strategy = ?',
          )
          .run(
            entry.successCount,
            entry.failureCount,
            entry.avgReward,
            entry.confidence,
            now,
            now,
            entry.taskType,
            entry.strategy,
          );
      } else {
        this.db.insert('strategy_memory', {
          id: generateId(),
          task_type: entry.taskType,
          strategy: entry.strategy,
          success_count: entry.successCount,
          failure_count: entry.failureCount,
          avg_reward: entry.avgReward,
          confidence: entry.confidence,
          last_used: now,
          updated_at: now,
        });
      }
    });

    transaction();
  }

  getByTaskType(taskType: string): StrategyRecord[] {
    const rows = this.db.query<StrategyRecord>(
      'SELECT * FROM strategy_memory WHERE task_type = ? ORDER BY avg_reward DESC',
      [taskType],
    );

    return rows.map((row) => this.applyDecay(row));
  }

  getAll(): StrategyRecord[] {
    const rows = this.db.query<StrategyRecord>(
      'SELECT * FROM strategy_memory ORDER BY task_type, avg_reward DESC',
    );

    return rows.map((row) => this.applyDecay(row));
  }

  private applyDecay(row: StrategyRecord): StrategyRecord {
    const daysSinceUpdate =
      (Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    const decayedConfidence =
      row.confidence * Math.exp(-this.decayRate * daysSinceUpdate);

    return { ...row, confidence: decayedConfidence };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStrategyMemory(
  db: QosDatabase,
  decayRate?: number,
): StrategyMemory {
  return new StrategyMemoryImpl(db, decayRate);
}
