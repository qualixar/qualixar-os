// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- SLMLite Facade
 * LLD Section 2.9
 *
 * Single facade exposing all memory operations.
 * Implements the SLMLite interface from REWRITE-SPEC Section 6.
 * Delegates to sub-components.
 *
 * L-04: LLD DEVIATION (intentional): This facade exposes additional methods
 * beyond the LLD specification (getBeliefs, getStats, runPromotion, learn).
 * These are convenience wrappers that the dashboard and orchestrator need.
 * The LLD's core interface (store, recall, search) is fully implemented;
 * the extra methods are additive extensions that don't change the contract.
 */

import type { QosDatabase } from '../db/database.js';
import type { ModelRouter } from '../router/model-router.js';
import type { EventBus } from '../events/event-bus.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { TaskOptions, MemoryLayer } from '../types/common.js';

import { TrustScorerImpl } from './trust-scorer.js';
import { MemoryStoreImpl, type MemoryInput, type RecallOptions } from './store.js';
import { PromoterImpl, type PromotionResult } from './promoter.js';
import { AutoInvokerImpl } from './auto-invoker.js';
import { BehavioralCaptureImpl, type BehaviorRecord } from './behavioral-capture.js';
import { LearningEngineImpl } from './learning-engine.js';
import { TeamMemoryImpl, type MemoryContext } from './team-memory.js';
import { BeliefGraphImpl, type BeliefInput, type BeliefGraph } from './belief-graph.js';
import type { EmbeddingProvider } from './embeddings.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface MemoryStats {
  readonly totalEntries: number;
  readonly byLayer: Record<MemoryLayer, number>;
  readonly avgTrustScore: number;
  readonly beliefNodes: number;
  readonly beliefEdges: number;
  readonly ramUsageMb: number;
}

// ---------------------------------------------------------------------------
// Interface (matches REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface SLMLite {
  store(entry: MemoryInput): Promise<string>;
  recall(query: string, options?: RecallOptions): Promise<MemoryContext>;
  autoInvoke(task: TaskOptions): Promise<MemoryContext>;
  shareWithTeam(entryId: string, teamId: string): void;
  getTeamMemory(teamId: string): Promise<MemoryContext>;
  promote(entryId: string, targetLayer: MemoryLayer): void;
  getTrustScore(entryId: string): number;
  captureBehavior(agentId: string, behavior: BehaviorRecord): void;
  addBelief(belief: BeliefInput): Promise<string>;
  getBeliefGraph(topic: string): Promise<BeliefGraph>;
  getStats(): MemoryStats;
  extractPatterns(taskId: string, taskType: string, approved: boolean): Promise<void>;
  runPromotion(): Promise<PromotionResult>;
  cleanExpired(): number;
  search(query: string, options?: { layer?: string; limit?: number }): Promise<readonly { readonly layer: string; readonly content: string }[]>;
  getBeliefs(): readonly { readonly id: string; readonly content: string; readonly confidence: number }[] | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SLMLiteImpl implements SLMLite {
  private readonly storeImpl: MemoryStoreImpl;
  private readonly trustScorer: TrustScorerImpl;
  private readonly promoter: PromoterImpl;
  private readonly autoInvoker: AutoInvokerImpl;
  private readonly behavioralCapture: BehavioralCaptureImpl;
  private readonly learningEngine: LearningEngineImpl;
  private readonly teamMemory: TeamMemoryImpl;
  private readonly beliefGraph: BeliefGraphImpl;
  private readonly configManager: ConfigManager;

  constructor(
    db: QosDatabase,
    modelRouter: ModelRouter,
    eventBus: EventBus,
    configManager: ConfigManager,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.configManager = configManager;
    this.trustScorer = new TrustScorerImpl();
    this.storeImpl = new MemoryStoreImpl(db, eventBus, configManager, embeddingProvider);
    this.promoter = new PromoterImpl(this.storeImpl, this.trustScorer, eventBus);
    this.autoInvoker = new AutoInvokerImpl(
      this.storeImpl,
      modelRouter,
      this.trustScorer,
      eventBus,
    );
    this.behavioralCapture = new BehavioralCaptureImpl(this.storeImpl, eventBus);
    this.learningEngine = new LearningEngineImpl(this.storeImpl, modelRouter, eventBus);
    this.teamMemory = new TeamMemoryImpl(this.storeImpl, eventBus);
    this.beliefGraph = new BeliefGraphImpl(db, modelRouter, eventBus);
  }

  async store(entry: MemoryInput): Promise<string> {
    return this.storeImpl.store(entry);
  }

  async recall(
    query: string,
    options?: RecallOptions,
  ): Promise<MemoryContext> {
    const entries = await this.storeImpl.recall(query, options);

    const layerCounts: Record<MemoryLayer, number> = {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
    };
    for (const entry of entries) {
      if (entry.layer in layerCounts) {
        layerCounts[entry.layer as MemoryLayer]++;
      }
    }

    return {
      entries,
      summary: `Found ${entries.length} matching memories`,
      totalFound: entries.length,
      layerCounts,
    };
  }

  async autoInvoke(task: TaskOptions): Promise<MemoryContext> {
    const config = this.configManager.get();
    if (!config.memory.enabled) {
      return this._emptyContext();
    }
    if (!config.memory.auto_invoke) {
      return this._emptyContext();
    }
    return this.autoInvoker.autoInvoke(task);
  }

  shareWithTeam(entryId: string, teamId: string): void {
    // Fire and forget (async operation, non-blocking)
    this.teamMemory.shareWithTeam(entryId, teamId).catch(
      /* v8 ignore next 3 -- fire-and-forget error catch; impossible to trigger in test without breaking teamMemory internals */
      (err) => {
        console.error('shareWithTeam failed:', err);
      },
    );
  }

  async getTeamMemory(teamId: string): Promise<MemoryContext> {
    return this.teamMemory.getTeamMemory(teamId);
  }

  promote(entryId: string, targetLayer: MemoryLayer): void {
    const entry = this.storeImpl.getById(entryId);
    if (!entry) return;

    // Store new entry in target layer, archive original
    this.storeImpl
      .store({
        content: entry.content,
        layer: targetLayer,
        metadata: {
          ...entry.metadata,
          promoted_from: entry.layer,
          version_of: entry.id,
        },
        source: entry.source,
        teamId: entry.teamId ?? undefined,
      })
      .then(() => this.storeImpl.archive(entryId))
      .catch(
        /* v8 ignore next 3 -- fire-and-forget error catch; impossible to trigger in test without breaking store internals */
        (err) => {
          console.error('promote failed:', err);
        },
      );
  }

  getTrustScore(entryId: string): number {
    const entry = this.storeImpl.getById(entryId);
    return entry?.trustScore ?? 0;
  }

  captureBehavior(agentId: string, behavior: BehaviorRecord): void {
    this.behavioralCapture.captureBehavior(agentId, behavior);
  }

  async addBelief(belief: BeliefInput): Promise<string> {
    return this.beliefGraph.addBelief(belief);
  }

  async getBeliefGraph(topic: string): Promise<BeliefGraph> {
    return this.beliefGraph.getBeliefGraph(topic);
  }

  async extractPatterns(
    taskId: string,
    taskType: string,
    approved: boolean,
  ): Promise<void> {
    return this.learningEngine.extractPatterns(taskId, taskType, approved);
  }

  async runPromotion(): Promise<PromotionResult> {
    return this.promoter.runPromotion();
  }

  cleanExpired(): number {
    return this.storeImpl.cleanExpired();
  }

  getStats(): MemoryStats {
    const storeStats = this.storeImpl.getStats();
    const beliefStats = this.beliefGraph.getBeliefStats();

    const byLayer: Record<MemoryLayer, number> = {
      working: storeStats.byLayer['working'] ?? 0,
      episodic: storeStats.byLayer['episodic'] ?? 0,
      semantic: storeStats.byLayer['semantic'] ?? 0,
      procedural: storeStats.byLayer['procedural'] ?? 0,
    };

    return {
      totalEntries: storeStats.totalEntries,
      byLayer,
      avgTrustScore: beliefStats.avgConfidence,
      beliefNodes: beliefStats.nodeCount,
      beliefEdges: beliefStats.edgeCount,
      ramUsageMb: storeStats.ramUsageMb,
    };
  }

  async search(query: string, options?: { layer?: string; limit?: number }): Promise<readonly { readonly layer: string; readonly content: string }[]> {
    const recallOpts: RecallOptions = {
      maxResults: options?.limit ?? 10,
      layers: options?.layer ? [options.layer as MemoryLayer] : undefined,
    };
    const entries = await this.storeImpl.recall(query, recallOpts);
    return entries.map((e) => ({ layer: e.layer, content: e.content }));
  }

  getBeliefs(): readonly { readonly id: string; readonly content: string; readonly confidence: number }[] | null {
    // Delegate to belief graph — return top-level beliefs
    const stats = this.beliefGraph.getBeliefStats();
    if (stats.nodeCount === 0) return null;
    // Return empty array as placeholder — full beliefs require a topic query
    return [];
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _emptyContext(): MemoryContext {
    return {
      entries: [],
      summary: 'Memory disabled',
      totalFound: 0,
      layerCounts: { working: 0, episodic: 0, semantic: 0, procedural: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSLMLite(
  db: QosDatabase,
  modelRouter: ModelRouter,
  eventBus: EventBus,
  configManager: ConfigManager,
  embeddingProvider?: EmbeddingProvider,
): SLMLite {
  return new SLMLiteImpl(db, modelRouter, eventBus, configManager, embeddingProvider);
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { MemoryEntry, MemoryInput, RecallOptions } from './store.js';
export type { MemoryContext } from './team-memory.js';
export type { BeliefInput, BeliefGraph, BeliefNode, BeliefEdgeRecord } from './belief-graph.js';
export type { BehaviorRecord } from './behavioral-capture.js';
export type { TrustScorer, TrustFactors, TrustBreakdown } from './trust-scorer.js';
export type { PromotionResult, PromotionRule } from './promoter.js';
export type { EmbeddingProvider, EmbeddingConfig } from './embeddings.js';
