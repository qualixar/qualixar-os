// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Orchestrator Helpers
 *
 * Pure helper functions extracted from OrchestratorImpl to keep
 * the main orchestrator file under 800 lines.
 */

import type {
  TaskResult,
  Artifact,
  TeamDesign,
  JudgeVerdict,
  JudgeResult,
  QosMode,
  TaskOptions,
  CostSummary,
} from '../types/common.js';
import type { DurableState } from './durability.js';
import type { OrchestratorSwarmResult } from './orchestrator-types.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// TaskStatus
// ---------------------------------------------------------------------------

export interface TaskStatus {
  readonly taskId: string;
  readonly phase:
    | 'init'
    | 'memory'
    | 'forge'
    | 'simulate'
    | 'run'
    | 'judge'
    | 'output';
  readonly progress: number;
  readonly currentAgents: readonly string[];
  readonly redesignCount: number;
  readonly costSoFar: number;
  readonly startedAt: string;
  readonly lastCheckpoint?: string;
}

// ---------------------------------------------------------------------------
// extractArtifacts
// ---------------------------------------------------------------------------

export function extractArtifacts(swarmResult: OrchestratorSwarmResult): Artifact[] {
  const artifacts: Artifact[] = [];
  for (const agentResult of swarmResult.agentResults) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(agentResult.output)) !== null) {
      artifacts.push({
        path: `agent-${agentResult.agentId}-block-${artifacts.length}`,
        content: match[2],
        type: 'code',
      });
    }
  }
  return artifacts;
}

// ---------------------------------------------------------------------------
// buildTaskResult
// ---------------------------------------------------------------------------

export function buildTaskResult(
  taskId: string,
  status: 'completed' | 'failed' | 'cancelled',
  output: string,
  artifacts: readonly Artifact[],
  teamDesign: TeamDesign | null,
  judges: readonly JudgeVerdict[],
  durationMs: number,
  mode: QosMode,
  redesignCount: number,
  memoryEntriesUsed: number,
  costSummary: CostSummary,
): TaskResult {
  return {
    taskId,
    status,
    output,
    artifacts,
    cost: costSummary,
    judges,
    teamDesign,
    duration_ms: durationMs,
    metadata: {
      mode,
      redesignCount,
      topology: teamDesign?.topology ?? 'none',
      memoryEntriesUsed,
    },
  };
}

// ---------------------------------------------------------------------------
// buildDurableState
// ---------------------------------------------------------------------------

export function buildDurableState(
  taskId: string,
  step: string,
  options: TaskOptions,
  teamDesign: TeamDesign | null,
  swarmResult: OrchestratorSwarmResult | null,
  judgeResults: readonly JudgeVerdict[],
  redesignCount: number,
  costSoFar: number,
  workingMemory: Record<string, unknown>,
): DurableState {
  return {
    taskId,
    step,
    taskOptions: options,
    teamDesign,
    swarmResult: swarmResult
      ? {
          outputs: swarmResult.outputs,
          aggregatedOutput: swarmResult.aggregatedOutput,
          topology: swarmResult.topology,
          agentResults: swarmResult.agentResults.map((a) => ({
            agentId: a.agentId,
            role: a.role,
            output: a.output,
            costUsd: a.costUsd,
            durationMs: a.durationMs,
            status: a.status,
          })),
          totalCostUsd: swarmResult.totalCostUsd,
          durationMs: swarmResult.durationMs,
        }
      : null,
    judgeResults: judgeResults as unknown as import('../types/common.js').JudgeResult[],
    redesignCount,
    costSoFar,
    workingMemory: { ...workingMemory },
    timestamp: now(),
  };
}
