// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Drift Detector (Configuration Pinning)
 * LLD Section 2.5
 *
 * Configuration pinning — detects changes in judge configuration
 * (model/prompt/temperature) between rounds. Not statistical drift
 * detection. Pins model+prompt+temperature hash via SHA-256.
 * Stores hashes in both in-memory cache and drift_hashes DB table.
 */

import { createHash } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftContext {
  readonly taskId: string;
  readonly round: number;
  readonly modelId?: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
}

export interface DriftResult {
  readonly drifted: boolean;
  readonly details?: {
    readonly oldHash: string;
    readonly newHash: string;
    readonly changedFields: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface DriftDetector {
  check(context: DriftContext): DriftResult;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class DriftDetectorImpl implements DriftDetector {
  private readonly db: QosDatabase;
  private readonly eventBus: EventBus;
  private readonly hashStore: Map<string, string>;

  constructor(db: QosDatabase, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
    this.hashStore = new Map();
  }

  check(context: DriftContext): DriftResult {
    // 1. Compute hash
    const hashInput = `${context.modelId ?? 'default'}|${context.systemPrompt ?? ''}|${context.temperature ?? 0.1}`;
    const newHash = createHash('sha256').update(hashInput).digest('hex');

    // 2. Check stored hash (in-memory first, then DB)
    const cacheKey = `${context.taskId}:judge`;
    let oldHash = this.hashStore.get(cacheKey);

    // 3. If not in memory, check DB
    if (oldHash === undefined) {
      const row = this.db.get<{ hash: string }>(
        'SELECT hash FROM drift_hashes WHERE context_key = ? ORDER BY created_at DESC LIMIT 1',
        [cacheKey],
      );
      if (row !== undefined) {
        oldHash = row.hash;
      }
    }

    // 4. First time: store and return no drift
    if (oldHash === undefined) {
      this.hashStore.set(cacheKey, newHash);
      this.persistHash(cacheKey, newHash);
      return { drifted: false };
    }

    // 5. No change
    if (oldHash === newHash) {
      return { drifted: false };
    }

    // 6. DRIFT DETECTED
    const changedFields: string[] = ['model_or_prompt_or_temperature'];
    this.hashStore.set(cacheKey, newHash);
    this.persistHash(cacheKey, newHash);

    this.eventBus.emit({
      type: 'drift:detected',
      payload: {
        taskId: context.taskId,
        oldHash,
        newHash,
        changedFields,
      },
      source: 'drift-detector',
      taskId: context.taskId,
    });

    return {
      drifted: true,
      details: { oldHash, newHash, changedFields },
    };
  }

  private persistHash(contextKey: string, hash: string): void {
    try {
      this.db.insert('drift_hashes', {
        id: generateId(),
        context_key: contextKey,
        hash,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Drift hash storage failed -- degrade to in-memory only
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDriftDetector(
  db: QosDatabase,
  eventBus: EventBus,
): DriftDetector {
  return new DriftDetectorImpl(db, eventBus);
}
