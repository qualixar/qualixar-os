// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Team Memory
 * LLD Section 2.7
 *
 * Team-scoped shared memory with access control isolation.
 * Sharing creates a COPY of the entry with team_id set.
 * Original remains personal (team_id=null).
 */

import type { EventBus } from '../events/event-bus.js';
import type { MemoryLayer } from '../types/common.js';
import type { MemoryStore, MemoryEntry, RecallOptions } from './store.js';
import { MemoryEntryNotFoundError } from './store.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface MemoryContext {
  readonly entries: readonly MemoryEntry[];
  readonly summary: string;
  readonly totalFound: number;
  readonly layerCounts: Record<MemoryLayer, number>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TeamMemory {
  shareWithTeam(entryId: string, teamId: string): Promise<void>;
  getTeamMemory(teamId: string, options?: RecallOptions): Promise<MemoryContext>;
  validateTeamAccess(
    agentTeamId: string | null,
    entryTeamId: string | null,
  ): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TeamMemoryImpl implements TeamMemory {
  private readonly store: MemoryStore;
  private readonly eventBus: EventBus;

  constructor(store: MemoryStore, eventBus: EventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  async shareWithTeam(entryId: string, teamId: string): Promise<void> {
    const original = this.store.getById(entryId);
    if (!original) throw new MemoryEntryNotFoundError(entryId);

    // Create a COPY with team_id set (original remains personal)
    await this.store.store({
      content: original.content,
      layer: original.layer,
      source: original.source,
      metadata: {
        ...original.metadata,
        shared_from: entryId,
        shared_at: now(),
      },
      teamId,
    });

    this.eventBus.emit({
      type: 'memory:team_shared',
      payload: { entryId, teamId },
      source: 'TeamMemory',
    });
  }

  async getTeamMemory(
    teamId: string,
    options?: RecallOptions,
  ): Promise<MemoryContext> {
    const entries = this.store.getByTeamId(teamId);

    // Sort by trustScore descending
    const sorted = [...entries].sort((a, b) => b.trustScore - a.trustScore);
    const limit = options?.maxResults ?? 20;
    const filtered = sorted.slice(0, limit);

    // Build layer counts
    const layerCounts: Record<MemoryLayer, number> = {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
    };
    for (const entry of filtered) {
      if (entry.layer in layerCounts) {
        layerCounts[entry.layer as MemoryLayer]++;
      }
    }

    const summary =
      filtered.length > 0
        ? `Team ${teamId}: ${filtered.length} shared memories`
        : `Team ${teamId}: no shared memories`;

    return {
      entries: filtered,
      summary,
      totalFound: entries.length,
      layerCounts,
    };
  }

  validateTeamAccess(
    agentTeamId: string | null,
    entryTeamId: string | null,
  ): boolean {
    // Personal entries (team_id=null) visible to all
    if (entryTeamId === null) return true;
    // Agent without team cannot see team entries
    if (agentTeamId === null) return false;
    // Same team: allow
    if (agentTeamId === entryTeamId) return true;
    // Cross-team: denied
    return false;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTeamMemory(
  store: MemoryStore,
  eventBus: EventBus,
): TeamMemory {
  return new TeamMemoryImpl(store, eventBus);
}
