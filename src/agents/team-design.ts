// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- TeamDesign Store
 * CRUD operations for team_designs table.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.7
 */

import type { QosDatabase } from '../db/database.js';
import type { TeamDesign } from '../types/common.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// DB Row type
// ---------------------------------------------------------------------------

interface TeamDesignRow {
  readonly id: string;
  readonly task_type: string;
  readonly topology: string;
  readonly agents: string;
  readonly performance_score: number | null;
  readonly avg_cost: number | null;
  readonly use_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface TeamDesignStore {
  save(design: TeamDesign): void;
  getById(id: string): TeamDesign | undefined;
  getByTaskType(taskType: string): readonly TeamDesign[];
  getBestForTaskType(taskType: string, minScore: number): TeamDesign | undefined;
  updatePerformance(id: string, score: number, cost: number): void;
  listAll(): readonly TeamDesign[];
  deleteDesign(id: string): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class TeamDesignStoreImpl implements TeamDesignStore {
  private readonly _db: QosDatabase;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  save(design: TeamDesign): void {
    const timestamp = now();
    this._db.db
      .prepare(
        `INSERT OR REPLACE INTO team_designs
           (id, task_type, topology, agents, performance_score, avg_cost, use_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        design.id,
        design.taskType,
        design.topology,
        JSON.stringify(design.agents),
        null,
        design.estimatedCostUsd,
        0,
        timestamp,
        timestamp,
      );
  }

  getById(id: string): TeamDesign | undefined {
    const row = this._db.get<TeamDesignRow>(
      'SELECT * FROM team_designs WHERE id = ?',
      [id],
    );
    return row ? parseRow(row) : undefined;
  }

  getByTaskType(taskType: string): readonly TeamDesign[] {
    const rows = this._db.query<TeamDesignRow>(
      'SELECT * FROM team_designs WHERE task_type = ? ORDER BY CASE WHEN performance_score IS NULL THEN 1 ELSE 0 END, performance_score DESC',
      [taskType],
    );
    return rows.map(parseRow);
  }

  getBestForTaskType(taskType: string, minScore: number): TeamDesign | undefined {
    const row = this._db.get<TeamDesignRow>(
      'SELECT * FROM team_designs WHERE task_type = ? AND performance_score >= ? ORDER BY performance_score DESC LIMIT 1',
      [taskType, minScore],
    );
    return row ? parseRow(row) : undefined;
  }

  updatePerformance(id: string, score: number, cost: number): void {
    const timestamp = now();
    this._db.db
      .prepare(
        `UPDATE team_designs
         SET performance_score = CASE
               WHEN performance_score IS NULL THEN ?
               ELSE (performance_score * use_count + ?) / (use_count + 1)
             END,
             avg_cost = CASE
               WHEN avg_cost IS NULL THEN ?
               ELSE (avg_cost * use_count + ?) / (use_count + 1)
             END,
             use_count = use_count + 1,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(score, score, cost, cost, timestamp, id);
  }

  listAll(): readonly TeamDesign[] {
    const rows = this._db.query<TeamDesignRow>(
      'SELECT * FROM team_designs ORDER BY updated_at DESC',
    );
    return rows.map(parseRow);
  }

  deleteDesign(id: string): void {
    this._db.db.prepare('DELETE FROM team_designs WHERE id = ?').run(id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRow(row: TeamDesignRow): TeamDesign {
  return {
    id: row.id,
    taskType: row.task_type,
    topology: row.topology,
    agents: JSON.parse(row.agents),
    reasoning: '',
    estimatedCostUsd: row.avg_cost ?? 0,
    version: row.use_count,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTeamDesignStore(db: QosDatabase): TeamDesignStore {
  return new TeamDesignStoreImpl(db);
}
