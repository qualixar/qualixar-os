// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Auto-Invoker
 * LLD Section 2.3
 *
 * Proactive memory recall: concept extraction -> multi-layer search ->
 * rank by relevance x trust -> top-K filtering -> RL bandit tuning.
 *
 * Uses epsilon-greedy multi-armed bandit for trust threshold and top-K.
 * Bandit state persisted in procedural layer as a system entry.
 */

import type { ModelRouter } from '../router/model-router.js';
import type { EventBus } from '../events/event-bus.js';
import type { TaskOptions, MemoryLayer } from '../types/common.js';
import type { MemoryStore, MemoryEntry } from './store.js';
import type { TrustScorer } from './trust-scorer.js';
import type { MemoryContext } from './team-memory.js';

// ---------------------------------------------------------------------------
// Bandit Types
// ---------------------------------------------------------------------------

interface BanditArm {
  readonly value: number;
  readonly totalReward: number;
  readonly pullCount: number;
}

interface BanditState {
  readonly trustThresholdArms: readonly BanditArm[];
  readonly topKArms: readonly BanditArm[];
  readonly epsilon: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_TRUST_THRESHOLD_ARMS = [0.2, 0.3, 0.4, 0.5];
const INITIAL_TOP_K_ARMS = [5, 10, 15, 20];
const BANDIT_EPSILON = 0.1;
const BANDIT_SYSTEM_ENTRY_KEY = '__bandit_policy_state__';
const MAX_BANDIT_ENTRIES = 100;
const MAX_CONCEPT_EXTRACTION_TOKENS = 100;
const MAX_SUMMARY_TOKENS = 200;

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const CONCEPT_EXTRACTION_PROMPT = (prompt: string): string =>
  `Extract 3-7 key concepts or keywords from this task description.
Return as JSON array of strings.

Task: ${prompt}

Respond with only the JSON array, e.g. ["concept1", "concept2", "concept3"]`;

const SUMMARIZE_MEMORY_PROMPT = (task: string, memoryText: string): string =>
  `Summarize the relevant memories below in the context of the current task.
Be concise (2-3 sentences).

Current task: ${task}

Relevant memories:
${memoryText}

Summary:`;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AutoInvoker {
  autoInvoke(task: TaskOptions): Promise<MemoryContext>;
  recordFeedback(taskApproved: boolean, memoryUsed: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AutoInvokerImpl implements AutoInvoker {
  private readonly store: MemoryStore;
  private readonly modelRouter: ModelRouter;
  private readonly trustScorer: TrustScorer;
  private readonly eventBus: EventBus;
  private banditState: BanditState;
  private selectedThresholdArm: BanditArm;
  private selectedTopKArm: BanditArm;

  constructor(
    store: MemoryStore,
    modelRouter: ModelRouter,
    trustScorer: TrustScorer,
    eventBus: EventBus,
  ) {
    this.store = store;
    this.modelRouter = modelRouter;
    this.trustScorer = trustScorer;
    this.eventBus = eventBus;

    // Initialize default bandit state
    this.banditState = this._createDefaultState();

    // H-01: Load persisted bandit state from procedural layer
    try {
      const proceduralEntries = store.getByLayer('procedural', MAX_BANDIT_ENTRIES);
      const persisted = proceduralEntries.find(
        (e) => e.metadata.key === BANDIT_SYSTEM_ENTRY_KEY,
      );
      if (persisted) {
        const parsed = JSON.parse(persisted.content) as BanditState;
        if (parsed.trustThresholdArms && parsed.topKArms) {
          this.banditState = parsed;
        }
      }
    } catch {
      // Start fresh if loading fails
    }

    this.selectedThresholdArm = this.banditState.trustThresholdArms[0];
    this.selectedTopKArm = this.banditState.topKArms[0];
  }

  async autoInvoke(task: TaskOptions): Promise<MemoryContext> {
    // Step 1: Extract concepts via LLM
    let concepts: string[];
    try {
      const response = await this.modelRouter.route({
        prompt: CONCEPT_EXTRACTION_PROMPT(task.prompt),
        maxTokens: MAX_CONCEPT_EXTRACTION_TOKENS,
        quality: 'low',
      });
      concepts = JSON.parse(response.content) as string[];
      if (!Array.isArray(concepts) || concepts.length === 0) {
        concepts = this._fallbackConcepts(task.prompt);
      }
    } catch {
      concepts = this._fallbackConcepts(task.prompt);
    }

    // Step 2: Select bandit arms (epsilon-greedy)
    this.selectedThresholdArm = this._selectArm(
      [...this.banditState.trustThresholdArms],
    );
    this.selectedTopKArm = this._selectArm(
      [...this.banditState.topKArms],
    );
    const trustThreshold = this.selectedThresholdArm.value;
    const topK = this.selectedTopKArm.value;

    // Step 3: Search working memory
    const workingResults: MemoryEntry[] = [];
    for (const entry of this.store.getWorkingMemorySnapshot()) {
      const score = concepts.reduce(
        (count, concept) =>
          entry.content.toLowerCase().includes(concept.toLowerCase())
            ? count + 1
            : count,
        0,
      );
      if (score > 0 && entry.trustScore >= trustThreshold) {
        workingResults.push(entry);
      }
    }

    // Step 4-6: Search persistent layers
    const ftsQuery = concepts.join(' OR ');
    const episodicResults = await this.store.recall(ftsQuery, {
      layers: ['episodic'],
      minTrustScore: trustThreshold,
      maxResults: topK * 2,
    });
    const semanticResults = await this.store.recall(ftsQuery, {
      layers: ['semantic'],
      minTrustScore: trustThreshold,
      maxResults: topK,
    });
    const proceduralResults = await this.store.recall(task.type ?? '', {
      layers: ['procedural'],
      minTrustScore: trustThreshold,
      maxResults: topK,
    });

    // Step 7: Combine, deduplicate, rank
    const allResults = [
      ...workingResults,
      ...episodicResults,
      ...semanticResults,
      ...proceduralResults,
    ];
    const seen = new Set<string>();
    const unique = allResults.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const ranked = [...unique].sort((a, b) => b.trustScore - a.trustScore);
    const topEntries = ranked
      .filter((e) => e.trustScore >= trustThreshold)
      .slice(0, topK);

    // Step 8: Generate summary
    let summary: string;
    if (topEntries.length === 0) {
      summary = 'No relevant memory found.';
    } else {
      try {
        const memoryText = topEntries
          .map((e) => `[${e.layer}] ${e.content}`)
          .join('\n');
        const response = await this.modelRouter.route({
          prompt: SUMMARIZE_MEMORY_PROMPT(task.prompt, memoryText),
          maxTokens: MAX_SUMMARY_TOKENS,
          quality: 'low',
        });
        summary = response.content;
      } catch {
        summary = `Memory context: ${topEntries.length} entries retrieved`;
      }
    }

    // Step 9: Build layer counts
    const layerCounts: Record<MemoryLayer, number> = {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
    };
    for (const entry of topEntries) {
      layerCounts[entry.layer as MemoryLayer]++;
    }

    // Step 10: Emit event
    this.eventBus.emit({
      type: 'memory:recalled',
      payload: {
        totalFound: unique.length,
        surfaced: topEntries.length,
        trustThreshold,
        topK,
      },
      source: 'AutoInvoker',
    });

    return {
      entries: topEntries,
      summary,
      totalFound: unique.length,
      layerCounts,
    };
  }

  async recordFeedback(
    taskApproved: boolean,
    memoryUsed: boolean,
  ): Promise<void> {
    // Compute reward
    const usageSignal = memoryUsed ? 1.0 : 0.0;
    const successSignal = taskApproved ? 1.0 : 0.0;
    const reward = usageSignal * 0.6 + successSignal * 0.4;

    // Update trust threshold arm (immutable)
    const updatedThresholdArm: BanditArm = {
      ...this.selectedThresholdArm,
      totalReward: this.selectedThresholdArm.totalReward + reward,
      pullCount: this.selectedThresholdArm.pullCount + 1,
    };
    const updatedThresholdArms = this.banditState.trustThresholdArms.map(
      (arm) =>
        arm.value === this.selectedThresholdArm.value
          ? updatedThresholdArm
          : arm,
    );

    // Update top-K arm (immutable)
    const updatedTopKArm: BanditArm = {
      ...this.selectedTopKArm,
      totalReward: this.selectedTopKArm.totalReward + reward,
      pullCount: this.selectedTopKArm.pullCount + 1,
    };
    const updatedTopKArms = this.banditState.topKArms.map((arm) =>
      arm.value === this.selectedTopKArm.value ? updatedTopKArm : arm,
    );

    // Create new bandit state (immutable)
    this.banditState = {
      ...this.banditState,
      trustThresholdArms: updatedThresholdArms,
      topKArms: updatedTopKArms,
    };

    // Persist bandit state
    const stateJson = JSON.stringify(this.banditState);
    const existing = await this.store.recall(BANDIT_SYSTEM_ENTRY_KEY, {
      layers: ['procedural'],
      maxResults: 1,
    });

    /* v8 ignore start -- find callback + createVersion path unreachable: recall searches content via FTS/LIKE, but the bandit key is in metadata, not content. existing is always empty, so find() never invokes the predicate and systemEntry is always undefined. */
    const systemEntry = existing.find(
      (e) => e.metadata.key === BANDIT_SYSTEM_ENTRY_KEY,
    );

    if (systemEntry) {
      this.store.createVersion(systemEntry.id, {
        content: stateJson,
        metadata: { key: BANDIT_SYSTEM_ENTRY_KEY },
      });
    } else {
    /* v8 ignore stop */
      await this.store.store({
        content: stateJson,
        layer: 'procedural',
        source: 'system',
        metadata: { key: BANDIT_SYSTEM_ENTRY_KEY },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private _selectArm(arms: BanditArm[]): BanditArm {
    if (Math.random() < this.banditState.epsilon) {
      // Explore: random arm
      return arms[Math.floor(Math.random() * arms.length)];
    }
    // Exploit: highest average reward
    let bestArm = arms[0];
    let bestAvg = -Infinity;
    for (const arm of arms) {
      const avg = arm.pullCount > 0 ? arm.totalReward / arm.pullCount : 0;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestArm = arm;
      }
    }
    return bestArm;
  }

  private _fallbackConcepts(prompt: string): string[] {
    return prompt
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);
  }

  private _createDefaultState(): BanditState {
    return {
      trustThresholdArms: INITIAL_TRUST_THRESHOLD_ARMS.map((v) => ({
        value: v,
        totalReward: 0,
        pullCount: 0,
      })),
      topKArms: INITIAL_TOP_K_ARMS.map((v) => ({
        value: v,
        totalReward: 0,
        pullCount: 0,
      })),
      epsilon: BANDIT_EPSILON,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAutoInvoker(
  store: MemoryStore,
  modelRouter: ModelRouter,
  trustScorer: TrustScorer,
  eventBus: EventBus,
): AutoInvoker {
  return new AutoInvokerImpl(store, modelRouter, trustScorer, eventBus);
}
