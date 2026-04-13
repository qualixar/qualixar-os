// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Promoter
 * LLD Section 2.4
 *
 * Configurable tier migration rules across 4 memory layers + archive.
 * Demotion is NOT supported. Entries only move up or to archive.
 *
 * Rules execute on schedule (called by Orchestrator), not on write.
 *
 * L-03: LLD DEVIATION (intentional): Constructor accepts an extra EventBus
 * parameter not specified in the LLD. This enables the Promoter to emit
 * 'memory:promoted' events when entries are promoted, which the dashboard
 * and audit log consume for real-time visibility into memory lifecycle.
 */

import type { MemoryLayer } from '../types/common.js';
import type { EventBus } from '../events/event-bus.js';
import type { MemoryStore, MemoryEntry } from './store.js';
import type { TrustScorer } from './trust-scorer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromotionRule {
  readonly from: MemoryLayer;
  readonly to: MemoryLayer | 'archived';
  readonly condition: (entry: MemoryEntry) => boolean;
  readonly description: string;
}

export interface PromotionResult {
  readonly promotedCount: number;
  readonly promotions: readonly {
    entryId: string;
    from: MemoryLayer;
    to: MemoryLayer | 'archived';
  }[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Promoter {
  runPromotion(): Promise<PromotionResult>;
  getRules(): readonly PromotionRule[];
  checkEntry(entry: MemoryEntry): PromotionRule | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PromoterImpl implements Promoter {
  private readonly store: MemoryStore;
  private readonly trustScorer: TrustScorer;
  private readonly eventBus: EventBus;
  private readonly rules: readonly PromotionRule[];

  constructor(store: MemoryStore, trustScorer: TrustScorer, eventBus: EventBus) {
    this.store = store;
    this.trustScorer = trustScorer;
    this.eventBus = eventBus;

    this.rules = [
      {
        from: 'working',
        to: 'episodic',
        condition: (entry) => entry.accessCount >= 3,
        description: 'Working -> Episodic when accessed 3+ times',
      },
      {
        from: 'episodic',
        to: 'semantic',
        condition: (entry) => {
          const sessions = (entry.metadata.confirmed_sessions as number) ?? 0;
          return sessions >= 2 && entry.trustScore >= 0.6;
        },
        description: 'Episodic -> Semantic when confirmed in 2+ sessions and trust >= 0.6',
      },
      {
        from: 'episodic',
        to: 'procedural',
        condition: (entry) =>
          entry.source === 'behavioral' && entry.accessCount >= 5,
        description: 'Behavioral episodic -> Procedural when accessed 5+ times',
      },
      {
        from: 'working',
        to: 'archived',
        condition: (entry) => this.trustScorer.shouldArchive(entry.trustScore),
        description: 'Working -> Archived when trust < 0.15',
      },
      {
        from: 'episodic',
        to: 'archived',
        condition: (entry) => this.trustScorer.shouldArchive(entry.trustScore),
        description: 'Episodic -> Archived when trust < 0.15',
      },
      {
        from: 'procedural',
        to: 'archived',
        condition: (entry) => this.trustScorer.shouldArchive(entry.trustScore),
        description: 'Procedural -> Archived when trust < 0.15',
      },
    ];
  }

  async runPromotion(): Promise<PromotionResult> {
    const promoted: {
      entryId: string;
      from: MemoryLayer;
      to: MemoryLayer | 'archived';
    }[] = [];

    for (const rule of this.rules) {
      const entries = this.store.getByLayer(rule.from);
      for (const entry of entries) {
        if (rule.condition(entry)) {
          if (rule.to === 'archived') {
            this.store.archive(entry.id);
          } else {
            await this.store.store({
              content: entry.content,
              layer: rule.to,
              metadata: {
                ...entry.metadata,
                promoted_from: rule.from,
                version_of: entry.id,
              },
              source: entry.source,
              teamId: entry.teamId ?? undefined,
            });
            this.store.archive(entry.id);
          }

          promoted.push({
            entryId: entry.id,
            from: rule.from,
            to: rule.to,
          });

          this.eventBus.emit({
            type: 'memory:promoted',
            payload: { entryId: entry.id, from: rule.from, to: rule.to },
            source: 'Promoter',
          });
        }
      }
    }

    return { promotedCount: promoted.length, promotions: promoted };
  }

  getRules(): readonly PromotionRule[] {
    return this.rules;
  }

  checkEntry(entry: MemoryEntry): PromotionRule | null {
    for (const rule of this.rules) {
      if (rule.from === entry.layer && rule.condition(entry)) {
        return rule;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPromoter(
  store: MemoryStore,
  trustScorer: TrustScorer,
  eventBus: EventBus,
): Promoter {
  return new PromoterImpl(store, trustScorer, eventBus);
}
