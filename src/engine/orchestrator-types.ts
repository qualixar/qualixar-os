// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Orchestrator Types
 *
 * Structural interfaces for orchestrator dependencies.
 * Uses structural typing for loose coupling -- the orchestrator
 * does not import concrete implementations.
 *
 * L-05: LLD DEVIATION (intentional): Types here are narrowed compared to
 * the LLD's full interfaces. This file uses structural (duck) typing with
 * only the fields the orchestrator actually consumes, avoiding import
 * cycles between the orchestrator and its dependencies. The concrete
 * implementations satisfy these narrower interfaces via TypeScript's
 * structural subtyping (wider type is assignable to narrower type).
 */

import type {
  TaskOptions,
  TaskResult,
  Artifact,
  SecurityAction,
  TeamDesign,
  JudgeVerdict,
  QosMode,
} from '../types/common.js';

// ---------------------------------------------------------------------------
// Forge
// ---------------------------------------------------------------------------

export interface OrchestratorForge {
  designTeam(request: {
    readonly taskId: string;
    readonly prompt: string;
    readonly taskType: string;
    readonly mode: QosMode;
    readonly budget_usd?: number;
  }): Promise<TeamDesign>;
  redesign(request: {
    readonly taskId: string;
    readonly prompt: string;
    readonly taskType: string;
    readonly mode: QosMode;
    readonly budget_usd?: number;
    readonly previousDesign: TeamDesign;
    readonly judgeResult: OrchestratorJudgeResult;
    readonly redesignCount: number;
  }): Promise<TeamDesign>;
  getDesigns(taskType?: string): readonly { readonly id: string; readonly taskType: string; readonly topology: string; readonly agents: readonly unknown[] }[];
}

// ---------------------------------------------------------------------------
// Swarm Engine
// ---------------------------------------------------------------------------

export interface OrchestratorSwarmEngine {
  run(
    design: TeamDesign,
    task: TaskOptions,
  ): Promise<OrchestratorSwarmResult>;
}

export interface OrchestratorSwarmResult {
  readonly outputs: Record<string, string>;
  readonly aggregatedOutput: string;
  readonly topology: string;
  readonly agentResults: readonly OrchestratorAgentResult[];
  readonly totalCostUsd: number;
  readonly durationMs: number;
}

export interface OrchestratorAgentResult {
  readonly agentId: string;
  readonly role: string;
  readonly output: string;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'completed' | 'failed';
}

// ---------------------------------------------------------------------------
// Simulation Engine
// ---------------------------------------------------------------------------

export interface OrchestratorSimulationEngine {
  simulate(
    design: TeamDesign,
    task: TaskOptions,
  ): Promise<{
    readonly verdict: 'pass' | 'fail' | 'partial';
    readonly issues: readonly string[];
    readonly estimatedCostUsd: number;
    readonly durationMs: number;
    readonly recommendation: 'proceed' | 'redesign' | 'abort';
  }>;
}

// ---------------------------------------------------------------------------
// Security Engine
// ---------------------------------------------------------------------------

export interface OrchestratorSecurityEngine {
  evaluate(action: SecurityAction): Promise<{
    readonly allowed: boolean;
    readonly reason: string;
    readonly layer: string;
    readonly severity?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Judge Pipeline
// ---------------------------------------------------------------------------

export interface OrchestratorJudgePipeline {
  evaluate(request: {
    readonly taskId: string;
    readonly prompt: string;
    readonly output: string;
    readonly artifacts: readonly Artifact[];
    readonly round: number;
    readonly profile?: string;
  }): Promise<OrchestratorJudgeResult>;
  getResults(taskId?: string): readonly { readonly judgeModel: string; readonly verdict: string; readonly score: number }[] | null;
  getProfiles(): readonly { readonly name: string; readonly criteria: readonly unknown[] }[] | null;
}

export interface OrchestratorJudgeResult {
  readonly taskId: string;
  readonly round: number;
  readonly verdicts: readonly JudgeVerdict[];
  readonly consensus: {
    readonly algorithm: string;
    readonly decision: 'approve' | 'reject' | 'revise';
    readonly confidence: number;
    readonly entropy: number;
    readonly agreementRatio: number;
  };
  readonly issues: readonly { readonly severity: string; readonly description: string }[];
}

// ---------------------------------------------------------------------------
// Strategy Scorer (weighted scoring function, not reinforcement learning)
// ---------------------------------------------------------------------------

export interface OrchestratorStrategyScorer {
  recordOutcome(signal: {
    readonly taskId: string;
    readonly taskType: string;
    readonly strategy: string;
    readonly teamDesignId?: string;
    readonly judgeScore: number;
    readonly costUsd: number;
    readonly durationMs: number;
    readonly approved: boolean;
    readonly redesignCount: number;
  }): void;
  getStats(): Record<string, unknown>;
  getStrategies(): readonly { readonly name: string; readonly score: number }[] | null;
}

// ---------------------------------------------------------------------------
// Memory — Powered by SuperLocalMemory
// ---------------------------------------------------------------------------

export interface OrchestratorSLMLite {
  autoInvoke(task: TaskOptions): Promise<{
    readonly entries: readonly unknown[];
    readonly summary: string;
    readonly totalFound: number;
    readonly layerCounts: Record<string, number>;
  }>;
  captureBehavior(agentId: string, behavior: {
    readonly agentId: string;
    readonly taskId: string;
    readonly toolSelections: readonly string[];
    readonly successPatterns: readonly string[];
    readonly timestamp: string;
  }): void;
  search(query: string, options?: { layer?: string; limit?: number }): Promise<readonly { readonly layer: string; readonly content: string }[]>;
  getStats(): { readonly totalEntries: number; readonly byLayer: Record<string, number>; readonly avgTrustScore: number; readonly beliefNodes: number; readonly beliefEdges: number; readonly ramUsageMb: number };
  getBeliefs(): readonly { readonly id: string; readonly content: string; readonly confidence: number }[] | null;
}

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

export interface OrchestratorAgentRegistry {
  register(agent: unknown): void;
  deregister(agentId: string): void;
  get(agentId: string): unknown | undefined;
  listActive(): readonly unknown[];
  listAgents(): readonly { readonly id: string; readonly status: string; readonly role: string }[];
  getAgent(agentId: string): { readonly id: string; readonly status: string; readonly role: string };
}
