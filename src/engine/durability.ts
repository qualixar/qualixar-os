// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Durability
 * LLD Section 2.2
 *
 * Checkpoint/resume per step with crash recovery.
 * DBOS-inspired: serializes DurableState to JSON in the events table.
 *
 * Hard Rule: All SQL parameterized with ? placeholders.
 */

import type { QosDatabase } from '../db/database.js';
import type { TaskOptions, TeamDesign, JudgeResult, JudgeVerdict } from '../types/common.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwarmResultSnapshot {
  readonly outputs: Record<string, string>;
  readonly aggregatedOutput: string;
  readonly topology: string;
  readonly agentResults: readonly AgentResultSnapshot[];
  readonly totalCostUsd: number;
  readonly durationMs: number;
}

export interface AgentResultSnapshot {
  readonly agentId: string;
  readonly role: string;
  readonly output: string;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'completed' | 'failed';
}

export interface DurableState {
  readonly taskId: string;
  readonly step: string;
  readonly taskOptions: TaskOptions;
  readonly teamDesign: TeamDesign | null;
  readonly swarmResult: SwarmResultSnapshot | null;
  readonly judgeResults: readonly JudgeResult[];
  readonly redesignCount: number;
  readonly costSoFar: number;
  readonly workingMemory: Record<string, unknown>;
  readonly timestamp: string;
}

export interface CheckpointRecord {
  readonly step: string;
  readonly timestamp: string;
  readonly costAtCheckpoint: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Durability {
  checkpoint(taskId: string, step: string, state: DurableState): void;
  getLastCheckpoint(taskId: string): DurableState | null;
  listCheckpoints(taskId: string): readonly CheckpointRecord[];
  clearCheckpoints(taskId: string): void;
  getIncompleteTaskIds(): readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DurabilityImpl implements Durability {
  private readonly db: QosDatabase;

  constructor(db: QosDatabase) {
    this.db = db;
  }

  checkpoint(taskId: string, step: string, state: DurableState): void {
    const stateWithTimestamp: DurableState = {
      ...state,
      timestamp: now(),
    };
    const payload = JSON.stringify(stateWithTimestamp);
    this.db.db
      .prepare(
        `INSERT INTO events (type, payload, source, task_id, created_at)
         VALUES ('checkpoint:saved', ?, 'durability', ?, ?)`,
      )
      .run(payload, taskId, now());
  }

  getLastCheckpoint(taskId: string): DurableState | null {
    const row = this.db.get<{ payload: string }>(
      `SELECT payload FROM events
       WHERE type = 'checkpoint:saved' AND task_id = ?
       ORDER BY id DESC LIMIT 1`,
      [taskId],
    );
    if (!row) {
      return null;
    }
    return JSON.parse(row.payload) as DurableState;
  }

  listCheckpoints(taskId: string): readonly CheckpointRecord[] {
    const rows = this.db.query<{ payload: string }>(
      `SELECT payload FROM events
       WHERE type = 'checkpoint:saved' AND task_id = ?
       ORDER BY id ASC`,
      [taskId],
    );
    return rows.map((row) => {
      const state = JSON.parse(row.payload) as DurableState;
      return {
        step: state.step,
        timestamp: state.timestamp,
        costAtCheckpoint: state.costSoFar,
      };
    });
  }

  clearCheckpoints(taskId: string): void {
    this.db.db
      .prepare(
        `DELETE FROM events WHERE type = 'checkpoint:saved' AND task_id = ?`,
      )
      .run(taskId);
  }

  getIncompleteTaskIds(): readonly string[] {
    const rows = this.db.query<{ id: string }>(
      `SELECT DISTINCT t.id FROM tasks t
       WHERE t.status NOT IN ('completed', 'failed', 'cancelled')
       AND EXISTS (
         SELECT 1 FROM events e
         WHERE e.type = 'checkpoint:saved' AND e.task_id = t.id
       )`,
      [],
    );
    return rows.map((r) => r.id);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDurability(db: QosDatabase): Durability {
  return new DurabilityImpl(db);
}
