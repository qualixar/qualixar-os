// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 13 -- Checkpoint Browser
 *
 * Time-travel inspection of checkpoints saved by durability.ts.
 * Read-only: lists, inspects, and validates replayability of checkpoints.
 *
 * Reads from existing checkpoint:saved events in the events table.
 * Does NOT duplicate data — delegates to Durability for underlying queries.
 */

import type { QosDatabase } from '../db/database.js';
import type { DurableState } from './durability.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointInfo {
  readonly id: number;
  readonly taskId: string;
  readonly phase: string;
  readonly timestamp: string;
  readonly agentCount: number;
  readonly costSoFar: number;
}

export interface CheckpointDetail extends CheckpointInfo {
  readonly teamDesign: unknown | null;
  readonly swarmOutputPreview: string | null;
  readonly judgeCount: number;
  readonly redesignCount: number;
  readonly workingMemoryKeys: readonly string[];
}

export interface CheckpointBrowser {
  list(taskId: string): readonly CheckpointInfo[];
  inspect(checkpointId: number): CheckpointDetail | null;
  canReplay(checkpointId: number): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CheckpointBrowserImpl implements CheckpointBrowser {
  private readonly db: QosDatabase;

  constructor(db: QosDatabase) {
    this.db = db;
  }

  list(taskId: string): readonly CheckpointInfo[] {
    const rows = this.db.query<{ id: number; payload: string }>(
      `SELECT id, payload FROM events
       WHERE type = 'checkpoint:saved' AND task_id = ?
       ORDER BY id ASC`,
      [taskId],
    );

    return rows.map((row) => {
      const state = JSON.parse(row.payload) as DurableState;
      const agentCount = state.swarmResult?.agentResults?.length ?? 0;
      return {
        id: row.id,
        taskId: state.taskId,
        phase: state.step,
        timestamp: state.timestamp,
        agentCount,
        costSoFar: state.costSoFar,
      };
    });
  }

  inspect(checkpointId: number): CheckpointDetail | null {
    const row = this.db.get<{ id: number; payload: string }>(
      `SELECT id, payload FROM events
       WHERE type = 'checkpoint:saved' AND id = ?`,
      [checkpointId],
    );

    if (!row) {
      return null;
    }

    const state = JSON.parse(row.payload) as DurableState;
    const agentCount = state.swarmResult?.agentResults?.length ?? 0;
    const swarmOutputPreview = state.swarmResult?.aggregatedOutput
      ? state.swarmResult.aggregatedOutput.slice(0, 200)
      : null;

    return {
      id: row.id,
      taskId: state.taskId,
      phase: state.step,
      timestamp: state.timestamp,
      agentCount,
      costSoFar: state.costSoFar,
      teamDesign: state.teamDesign,
      swarmOutputPreview,
      judgeCount: state.judgeResults.length,
      redesignCount: state.redesignCount,
      workingMemoryKeys: Object.keys(state.workingMemory),
    };
  }

  canReplay(checkpointId: number): boolean {
    const row = this.db.get<{ payload: string }>(
      `SELECT payload FROM events
       WHERE type = 'checkpoint:saved' AND id = ?`,
      [checkpointId],
    );

    if (!row) {
      return false;
    }

    try {
      const state = JSON.parse(row.payload) as DurableState;
      // A checkpoint is replayable if it has taskId, step, and taskOptions
      return Boolean(state.taskId && state.step && state.taskOptions?.prompt);
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCheckpointBrowser(db: QosDatabase): CheckpointBrowser {
  return new CheckpointBrowserImpl(db);
}
