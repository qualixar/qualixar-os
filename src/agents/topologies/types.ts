// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Topology Shared Types
 * Internal types used by all topology executors.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.12
 */

import type { TaskOptions } from '../../types/common.js';
import type { AgentInstance } from '../agent-registry.js';
import type { MsgHub } from '../msghub.js';

// ---------------------------------------------------------------------------
// Topology Context (passed by SwarmEngine to topology executors)
// ---------------------------------------------------------------------------

export interface TopologyContext {
  readonly task: TaskOptions;
  readonly config: Record<string, unknown>;
  readonly executeAgent: (agent: AgentInstance, prompt: string) => Promise<string>;
  /** Optional event emitter callback, bound by SwarmEngine when available. */
  readonly emit?: (event: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// Swarm Result (topology run output)
// ---------------------------------------------------------------------------

export interface AgentResult {
  readonly agentId: string;
  readonly role: string;
  readonly output: string;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'completed' | 'failed';
}

export interface SwarmResult {
  readonly outputs: Record<string, string>;
  readonly aggregatedOutput: string;
  readonly topology: string;
  readonly agentResults: readonly AgentResult[];
  readonly totalCostUsd: number;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Topology Executor Interface
// ---------------------------------------------------------------------------

export interface TopologyExecutor {
  readonly name: string;
  run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
    transport?: import('../transport/types.js').AgentTransport,
  ): Promise<SwarmResult>;
  getTerminationCondition(): string;
  getAggregationStrategy(): string;
}

// ---------------------------------------------------------------------------
// Helpers (shared by topologies)
// ---------------------------------------------------------------------------

export function buildAgentResults(
  agents: readonly AgentInstance[],
  outputs: Record<string, string>,
): AgentResult[] {
  return agents.map((a) => ({
    agentId: a.id,
    role: a.role,
    output: outputs[a.id] ?? '',
    costUsd: a.stats.totalCostUsd,
    durationMs: a.stats.totalLatencyMs,
    status: outputs[a.id] !== undefined ? ('completed' as const) : ('failed' as const),
  }));
}

export function buildSwarmResult(
  topology: string,
  outputs: Record<string, string>,
  aggregatedOutput: string,
  agents: readonly AgentInstance[],
  startMs: number,
): SwarmResult {
  return {
    outputs,
    aggregatedOutput,
    topology,
    agentResults: buildAgentResults(agents, outputs),
    totalCostUsd: agents.reduce((s, a) => s + a.stats.totalCostUsd, 0),
    durationMs: performance.now() - startMs,
  };
}
