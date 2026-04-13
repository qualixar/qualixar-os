// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Hybrid Topology Types
 * Types for the 13th topology: local + cloud split execution.
 *
 * LLD: LLD-ANGLE-3-HYBRID-TOPOLOGY.md Section 4
 * Depends on: types.ts (type-only import for SwarmResult)
 */

import type { SwarmResult } from './types.js';

// ---------------------------------------------------------------------------
// Execution Environment
// ---------------------------------------------------------------------------

/**
 * Where an agent runs. 'local' = same machine via executeAgent().
 * 'cloud' = Claude Managed Agents via Angle 2 adapter.
 */
export type ExecutionEnvironment = 'local' | 'cloud';

// ---------------------------------------------------------------------------
// Routing Rule Types
// ---------------------------------------------------------------------------

/**
 * A single routing condition that evaluates to true/false for a given agent.
 */
export interface RoutingCondition {
  /**
   * What dimension to evaluate:
   * - security: Agent handles PII/secrets (check systemPrompt markers)
   * - cost: Budget threshold per-agent
   * - capability: Model capability level needed
   * - latency: Maximum acceptable response time
   * - sandbox: Agent runs untrusted code
   */
  readonly type: 'security' | 'cost' | 'capability' | 'latency' | 'sandbox';
  /** Numeric threshold (e.g., max cost in USD, max latency in ms) */
  readonly threshold?: number;
  /** String value for matching (e.g., 'pii', 'opus-level', 'untrusted') */
  readonly value?: string;
}

/**
 * A rule that maps a condition to an execution environment.
 * Rules are evaluated in priority order (lowest number = highest priority).
 */
export interface RoutingRule {
  readonly condition: RoutingCondition;
  readonly environment: ExecutionEnvironment;
  /** Lower number = evaluated first. Ties broken by array order. */
  readonly priority: number;
}

/**
 * The complete routing policy for hybrid topology.
 */
export interface RoutingPolicy {
  /** Where agents go when no rule matches. Default: 'local'. */
  readonly defaultEnvironment: ExecutionEnvironment;
  /** Ordered list of rules. Evaluated by priority (ascending). */
  readonly rules: readonly RoutingRule[];
}

// ---------------------------------------------------------------------------
// Hybrid Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration object for the Hybrid topology.
 * Passed via TopologyContext.config['hybrid'].
 */
export interface HybridConfig {
  /** How agents get routed. If omitted, everything stays local. */
  readonly routingPolicy: RoutingPolicy;
  /** Which cloud provider to use. Only 'claude-managed' for v1. */
  readonly cloudProvider: 'claude-managed';
  /** If true, agents that fail on cloud retry on local. Default: true. */
  readonly fallbackToLocal: boolean;
  /** Maximum number of agents sent to cloud in a single run. Default: 5. */
  readonly maxCloudAgents: number;
  /**
   * Security strictness:
   * - 'strict': PII/secrets markers ALWAYS route local. No override.
   * - 'balanced': PII routes local by default, but can be overridden per-agent.
   * - 'permissive': No automatic PII routing. User is responsible.
   * Default: 'strict'.
   */
  readonly securityLevel: 'strict' | 'balanced' | 'permissive';
  /**
   * How to aggregate outputs from all agents.
   * - 'merge': Concatenate with separator (default)
   * - 'vote': Majority vote (for classification tasks)
   * - 'hierarchical': First agent's output as primary, others as supporting
   * - 'last-writer-wins': Last agent to complete wins
   */
  readonly aggregationStrategy: 'merge' | 'vote' | 'hierarchical' | 'last-writer-wins';
}

/**
 * Default configuration. Conservative: everything local, strict security.
 */
export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  routingPolicy: {
    defaultEnvironment: 'local',
    rules: [],
  },
  cloudProvider: 'claude-managed',
  fallbackToLocal: true,
  maxCloudAgents: 5,
  securityLevel: 'strict',
  aggregationStrategy: 'merge',
} as const;

// ---------------------------------------------------------------------------
// Routing Decision (per-agent output of the engine)
// ---------------------------------------------------------------------------

/**
 * The routing engine's decision for a single agent.
 * Stored in HybridResult.routingDecisions for auditability.
 *
 * All fields are readonly. When overriding a decision (e.g., cloud-agent-limit),
 * create a NEW object via spread: { ...decision, environment: 'local', reason: '...' }
 * Never mutate an existing RoutingDecision.
 */
export interface RoutingDecision {
  readonly environment: ExecutionEnvironment;
  /** Human-readable reason for this routing decision. */
  readonly reason: string;
  /** Which rule matched (index in RoutingPolicy.rules), -1 for default, -2 for agent-override. */
  readonly matchedRuleIndex: number;
  /** The condition type that triggered routing, or 'default'. */
  readonly trigger: RoutingCondition['type'] | 'default';
}

// ---------------------------------------------------------------------------
// Hybrid Result (extends SwarmResult)
// ---------------------------------------------------------------------------

/**
 * Extended result from hybrid topology execution.
 * Contains everything SwarmResult has, plus local/cloud split details.
 *
 * NOTE: This imports type-only from topology types.ts. This is a safe dependency
 * since type-only imports are erased at runtime (no circular dependency risk).
 *
 * IMPORTANT: HybridTopology.run() returns Promise<SwarmResult> to satisfy the
 * TopologyExecutor interface. Consumers must use the isHybridResult() type guard
 * to access the extended fields below.
 */
export interface HybridResult extends SwarmResult {
  /** IDs of agents that ran locally. */
  readonly localAgents: readonly string[];
  /** IDs of agents that ran in the cloud. */
  readonly cloudAgents: readonly string[];
  /** Total cost of local execution (USD). */
  readonly localCostUsd: number;
  /** Total cost of cloud execution (USD). */
  readonly cloudCostUsd: number;
  /** Per-agent routing decision with reasoning. */
  readonly routingDecisions: Readonly<Record<string, RoutingDecision>>;
}

/**
 * Type guard to narrow a SwarmResult to HybridResult.
 * Use this after calling topology.run() to access hybrid-specific fields.
 *
 * @example
 * const result = await swarmEngine.run(design, task);
 * if (isHybridResult(result)) {
 *   console.log(result.localAgents, result.cloudAgents, result.routingDecisions);
 * }
 */
export function isHybridResult(r: SwarmResult): r is HybridResult {
  return r.topology === 'hybrid';
}

// ---------------------------------------------------------------------------
// Cloud Agent Result (from Angle 2 adapter)
// ---------------------------------------------------------------------------

/**
 * What the Claude Managed Agents adapter returns.
 * The hybrid topology normalizes this into a plain string output.
 */
export interface CloudAgentResult {
  readonly sessionId: string;
  readonly output: string;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'completed' | 'failed';
  readonly artifacts?: readonly { readonly name: string; readonly content: string }[];
}

/**
 * Cloud adapter interface injected via TopologyContext.config['cloudAdapter'].
 * Defined here (not imported from Angle 2) to keep hybrid-types.ts self-contained.
 * The Angle 2 implementation must satisfy this interface.
 */
export interface CloudAgentAdapter {
  executeAgent(params: {
    readonly systemPrompt: string;
    readonly prompt: string;
    readonly model?: string;
    readonly tools?: readonly string[];
  }): Promise<CloudAgentResult>;
  isAvailable(): Promise<boolean>;
}
