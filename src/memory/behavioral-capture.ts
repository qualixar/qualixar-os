// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Behavioral Capture
 * LLD Section 2.5
 *
 * Records agent behavior profiles into the procedural memory layer.
 * Non-blocking: captureBehavior() returns immediately.
 * The async write is deferred via Promise.resolve().then().
 */

import type { EventBus } from '../events/event-bus.js';
import type { MemoryStore, MemoryEntry } from './store.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface BehaviorRecord {
  readonly agentId: string;
  readonly taskId: string;
  readonly toolSelections: readonly string[];
  readonly errorRecoveryStrategy?: string;
  readonly communicationStyle?: string;
  readonly successPatterns: readonly string[];
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BehavioralCapture {
  captureBehavior(agentId: string, behavior: BehaviorRecord): void;
  getAgentBehaviors(agentId: string, limit?: number): Promise<readonly MemoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class BehavioralCaptureImpl implements BehavioralCapture {
  private readonly store: MemoryStore;
  private readonly eventBus: EventBus;

  constructor(store: MemoryStore, eventBus: EventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  captureBehavior(agentId: string, behavior: BehaviorRecord): void {
    // Returns immediately -- async write is deferred
    Promise.resolve().then(async () => {
      try {
        const content = [
          `Agent: ${agentId}`,
          `Task: ${behavior.taskId}`,
          `Tools: ${behavior.toolSelections.join(', ')}`,
          `Error Recovery: ${behavior.errorRecoveryStrategy ?? 'none'}`,
          `Success: ${behavior.successPatterns.join(', ')}`,
        ].join('\n');

        await this.store.store({
          content,
          layer: 'procedural',
          source: 'behavioral',
          metadata: {
            agentId,
            taskId: behavior.taskId,
            toolSelections: [...behavior.toolSelections],
            errorRecoveryStrategy: behavior.errorRecoveryStrategy ?? null,
            communicationStyle: behavior.communicationStyle ?? null,
            capturedAt: behavior.timestamp,
          },
        });

        this.eventBus.emit({
          type: 'memory:behavior_captured',
          payload: { agentId, taskId: behavior.taskId },
          source: 'BehavioralCapture',
        });
      } catch (err) {
        /* v8 ignore next 2 -- Non-blocking guarantee: catch for deferred async, cannot be triggered without breaking store internals */
        console.error('Behavioral capture failed:', err);
      }
    });
  }

  async getAgentBehaviors(
    agentId: string,
    limit?: number,
  ): Promise<readonly MemoryEntry[]> {
    const results = await this.store.recall(agentId, {
      layers: ['procedural'],
      maxResults: limit ?? 10,
    });
    return results.filter(
      (entry) => entry.metadata.agentId === agentId,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBehavioralCapture(
  store: MemoryStore,
  eventBus: EventBus,
): BehavioralCapture {
  return new BehavioralCaptureImpl(store, eventBus);
}
