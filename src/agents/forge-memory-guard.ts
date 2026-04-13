// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase C1 -- Forge Memory Guard
 *
 * Prevents catastrophic forgetting during Forge team redesign.
 * Before a radical redesign, extracts and archives successful patterns
 * (high-scoring partial designs) so they aren't lost when the topology changes.
 *
 * Integration: Forge.redesign() calls guard.preserveBeforeRedesign() before
 * radical redesign. Guard reads forge_designs table for high-scoring patterns,
 * archives them to forge_preserved_patterns table.
 *
 * Source: Phase C1 LLD, MASTER-IMPLEMENTATION-PLAN.md
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreservedPattern {
  readonly id: string;
  readonly sourceDesignId: string;
  readonly taskType: string;
  readonly topology: string;
  readonly agentRoles: readonly string[];
  readonly score: number;
  readonly reason: string;
  readonly preservedAt: string;
}

export interface ForgeMemoryGuard {
  /**
   * Before radical redesign: scan existing designs for high-scoring patterns
   * and archive them so they survive the redesign.
   */
  preserveBeforeRedesign(taskType: string, currentDesignId: string): readonly PreservedPattern[];

  /**
   * After radical redesign: retrieve preserved patterns that could inform
   * the new design (e.g., specific agent roles that consistently scored well).
   */
  getPreservedPatterns(taskType: string): readonly PreservedPattern[];

  /**
   * Get suggested roles from preserved patterns for a task type.
   * Returns roles that appeared in high-scoring designs.
   */
  getSuggestedRoles(taskType: string): readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ForgeMemoryGuardImpl implements ForgeMemoryGuard {
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;
  private readonly _minScore: number;

  constructor(db: QosDatabase, eventBus: EventBus, minScore = 0.7) {
    this._db = db;
    this._eventBus = eventBus;
    this._minScore = minScore;

    // H-13: Create table if needed (graceful — won't fail if already exists via migration)
    try {
      this._db.db.prepare(`
        CREATE TABLE IF NOT EXISTS forge_preserved_patterns (
          id TEXT PRIMARY KEY,
          source_design_id TEXT NOT NULL,
          task_type TEXT NOT NULL,
          topology TEXT NOT NULL,
          agent_roles TEXT NOT NULL,
          score REAL NOT NULL,
          reason TEXT NOT NULL,
          preserved_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `).run();
    } catch {
      // Table may already exist or DB may be read-only — degrade gracefully
    }
  }

  preserveBeforeRedesign(
    taskType: string,
    currentDesignId: string,
  ): readonly PreservedPattern[] {
    // Query forge_designs for high-scoring designs of this task type
    const highScoringDesigns = this._db.db.prepare(`
      SELECT fd.id, fd.task_type, fd.topology, fd.agents, jr.score
      FROM forge_designs fd
      LEFT JOIN (
        SELECT task_id, AVG(score) as score
        FROM judge_results
        GROUP BY task_id
      ) jr ON fd.task_id = jr.task_id
      WHERE fd.task_type = ?
        AND jr.score >= ?
      ORDER BY jr.score DESC
      LIMIT 10
    `).all(taskType, this._minScore) as readonly {
      id: string;
      task_type: string;
      topology: string;
      agents: string;
      score: number | null;
    }[];

    const preserved: PreservedPattern[] = [];

    for (const design of highScoringDesigns) {
      if (design.id === currentDesignId) continue; // Don't preserve the failing design

      let agentRoles: string[];
      try {
        const agents = JSON.parse(design.agents) as readonly { role: string }[];
        agentRoles = agents.map((a) => a.role);
      } catch {
        agentRoles = [];
      }

      if (agentRoles.length === 0) continue;

      const pattern: PreservedPattern = {
        id: generateId(),
        sourceDesignId: design.id,
        taskType: design.task_type,
        topology: design.topology,
        agentRoles,
        score: design.score ?? 0,
        reason: `Preserved before radical redesign (score: ${(design.score ?? 0).toFixed(2)})`,
        preservedAt: now(),
      };

      // Store in DB
      this._db.db.prepare(`
        INSERT OR IGNORE INTO forge_preserved_patterns
          (id, source_design_id, task_type, topology, agent_roles, score, reason, preserved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        pattern.id,
        pattern.sourceDesignId,
        pattern.taskType,
        pattern.topology,
        JSON.stringify(pattern.agentRoles),
        pattern.score,
        pattern.reason,
        pattern.preservedAt,
      );

      preserved.push(pattern);
    }

    this._eventBus.emit({
      type: 'forge:patterns_preserved',
      payload: {
        taskType,
        currentDesignId,
        patternsPreserved: preserved.length,
      },
      source: 'forge-memory-guard',
    });

    return preserved;
  }

  getPreservedPatterns(taskType: string): readonly PreservedPattern[] {
    const rows = this._db.db.prepare(`
      SELECT * FROM forge_preserved_patterns
      WHERE task_type = ?
      ORDER BY score DESC
    `).all(taskType) as readonly {
      id: string;
      source_design_id: string;
      task_type: string;
      topology: string;
      agent_roles: string;
      score: number;
      reason: string;
      preserved_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      sourceDesignId: r.source_design_id,
      taskType: r.task_type,
      topology: r.topology,
      agentRoles: JSON.parse(r.agent_roles) as string[],
      score: r.score,
      reason: r.reason,
      preservedAt: r.preserved_at,
    }));
  }

  getSuggestedRoles(taskType: string): readonly string[] {
    const patterns = this.getPreservedPatterns(taskType);
    const roleCounts = new Map<string, number>();

    for (const pattern of patterns) {
      for (const role of pattern.agentRoles) {
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }
    }

    // Sort by frequency, return unique roles
    return [...roleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([role]) => role);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createForgeMemoryGuard(
  db: QosDatabase,
  eventBus: EventBus,
  minScore?: number,
): ForgeMemoryGuard {
  return new ForgeMemoryGuardImpl(db, eventBus, minScore);
}
