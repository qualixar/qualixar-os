// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Learning Engine
 * LLD Section 2.6
 *
 * Extracts reusable patterns from task successes and failures.
 * Stores extracted patterns in the procedural memory layer.
 * Uses ModelRouter for LLM-based pattern extraction.
 *
 * L-03: LLD DEVIATION (intentional): Constructor accepts an extra EventBus
 * parameter not specified in the LLD. This enables the Learning Engine to
 * emit 'memory:pattern_extracted' events, consumed by the dashboard for
 * real-time learning activity monitoring.
 */

import type { ModelRouter } from '../router/model-router.js';
import type { EventBus } from '../events/event-bus.js';
import type { MemoryStore } from './store.js';

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const PATTERN_EXTRACTION_PROMPT = (
  taskType: string,
  approved: boolean,
  entries: string,
): string =>
  `Analyze these memory entries from a ${
    approved ? 'successful' : 'failed'
  } ${taskType} task. Extract 1-5 reusable patterns.

${approved ? 'What worked well?' : 'What went wrong? What should be avoided?'}

Entries:
${entries}

Respond with JSON array of pattern strings:
["pattern 1", "pattern 2"]`;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LearningEngine {
  extractPatterns(
    taskId: string,
    taskType: string,
    approved: boolean,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class LearningEngineImpl implements LearningEngine {
  private readonly store: MemoryStore;
  private readonly modelRouter: ModelRouter;
  private readonly eventBus: EventBus;

  constructor(store: MemoryStore, modelRouter: ModelRouter, eventBus: EventBus) {
    this.store = store;
    this.modelRouter = modelRouter;
    this.eventBus = eventBus;
  }

  async extractPatterns(
    taskId: string,
    taskType: string,
    approved: boolean,
  ): Promise<void> {
    // Step 1: Gather recent entries related to this task
    const recentEntries = await this.store.recall(taskId, {
      layers: ['episodic', 'procedural'],
      maxResults: 20,
    });

    // Step 2: Ask LLM to identify patterns
    const entrySummary = recentEntries.map((e) => e.content).join('\n---\n');
    const response = await this.modelRouter.route({
      prompt: PATTERN_EXTRACTION_PROMPT(taskType, approved, entrySummary),
      maxTokens: 300,
      quality: 'low',
    });

    // Step 3: Parse extracted patterns
    let patterns: string[];
    try {
      patterns = JSON.parse(response.content) as string[];
      if (!Array.isArray(patterns)) {
        patterns = [response.content];
      }
    } catch {
      // Parse failure: split by newline and filter non-empty
      patterns = response.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    }

    // Step 4: Store each pattern in procedural layer
    for (const pattern of patterns) {
      await this.store.store({
        content: pattern,
        layer: 'procedural',
        source: 'system',
        metadata: {
          taskType,
          approved,
          extractedFrom: taskId,
          patternType: approved ? 'success' : 'failure',
        },
      });
    }

    // Step 5: Emit event
    this.eventBus.emit({
      type: 'memory:pattern_learned',
      payload: {
        taskId,
        taskType,
        patternCount: patterns.length,
        approved,
      },
      source: 'LearningEngine',
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLearningEngine(
  store: MemoryStore,
  modelRouter: ModelRouter,
  eventBus: EventBus,
): LearningEngine {
  return new LearningEngineImpl(store, modelRouter, eventBus);
}
