// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Workflow Executor
 *
 * Runs a WorkflowDocument via the existing SwarmEngine pipeline.
 * Tracks per-node execution state via EventBus events and persists
 * the run record in the workflow_runs table.
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-3: All DB writes use parameterized queries via QosDatabase helpers.
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { SwarmEngine } from '../agents/swarm-engine.js';
import type {
  WorkflowExecutionState,
  NodeExecutionState,
  NodeExecutionStatus,
} from '../types/phase21.js';
import type { WorkflowStore } from './workflow-store.js';
import type { WorkflowValidator } from './workflow-validator.js';
import type { WorkflowConverter } from './workflow-converter.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface WorkflowExecutor {
  execute(
    workflowId: string,
    prompt: string,
    dryRun?: boolean,
  ): Promise<WorkflowExecutionState>;

  getRunHistory(workflowId: string, limit?: number): WorkflowRunSummary[];
}

export interface WorkflowRunSummary {
  readonly id: string;
  readonly workflowId: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
  readonly prompt: string;
  readonly totalCostUsd: number;
  readonly finalOutput: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

// ---------------------------------------------------------------------------
// DB Row Types
// ---------------------------------------------------------------------------

interface WorkflowRunRow {
  readonly id: string;
  readonly workflow_id: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
  readonly prompt: string;
  readonly node_states_json: string;
  readonly total_cost_usd: number;
  readonly final_output: string | null;
  readonly started_at: string;
  readonly completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Node State Builder
// ---------------------------------------------------------------------------

function makeNodeState(
  nodeId: string,
  status: NodeExecutionStatus,
  output: string | null = null,
  error: string | null = null,
  startedAt: string | null = null,
  completedAt: string | null = null,
  costUsd = 0,
  latencyMs = 0,
): NodeExecutionState {
  return { nodeId, status, output, error, startedAt, completedAt, costUsd, latencyMs };
}

function buildInitialNodeStates(
  nodes: readonly { readonly id: string }[],
): Record<string, NodeExecutionState> {
  const result: Record<string, NodeExecutionState> = {};
  for (const n of nodes) {
    result[n.id] = makeNodeState(n.id, 'idle');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class WorkflowExecutorImpl implements WorkflowExecutor {
  private readonly _db: QosDatabase;
  private readonly _store: WorkflowStore;
  private readonly _validator: WorkflowValidator;
  private readonly _converter: WorkflowConverter;
  private readonly _swarm: SwarmEngine;
  private readonly _eventBus: EventBus;

  constructor(
    db: QosDatabase,
    store: WorkflowStore,
    validator: WorkflowValidator,
    converter: WorkflowConverter,
    swarm: SwarmEngine,
    eventBus: EventBus,
  ) {
    this._db = db;
    this._store = store;
    this._validator = validator;
    this._converter = converter;
    this._swarm = swarm;
    this._eventBus = eventBus;
  }

  async execute(
    workflowId: string,
    prompt: string,
    dryRun = false,
  ): Promise<WorkflowExecutionState> {
    const runId = generateId();
    const startedAt = now();

    // 1. Load workflow
    const doc = this._store.get(workflowId);
    if (!doc) {
      return this._failedState(runId, workflowId, startedAt, 'Workflow not found', {});
    }

    const initialNodeStates = buildInitialNodeStates(doc.nodes);

    // 2. Validate
    const validation = this._validator.validate(doc);
    if (!validation.valid) {
      const errorMsg = validation.errors.map((e) => e.message).join('; ');
      this._eventBus.emit({
        type: 'workflow:validation_failed',
        payload: { workflowId, runId, errors: validation.errors },
        source: 'workflow-executor',
        taskId: runId,
      });
      return this._failedState(runId, workflowId, startedAt, `Validation failed: ${errorMsg}`, initialNodeStates);
    }

    // 3. Convert to TeamDesign
    let teamDesign;
    try {
      teamDesign = this._converter.convert(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._eventBus.emit({
        type: 'workflow:conversion_failed',
        payload: { workflowId, runId, error: msg },
        source: 'workflow-executor',
        taskId: runId,
      });
      return this._failedState(runId, workflowId, startedAt, `Conversion failed: ${msg}`, initialNodeStates);
    }

    // 4. Persist run record
    this._db.insert('workflow_runs', {
      id: runId,
      workflow_id: workflowId,
      status: 'running',
      prompt,
      node_states_json: JSON.stringify(initialNodeStates),
      total_cost_usd: 0,
      final_output: null,
      started_at: startedAt,
      completed_at: null,
    });

    // 5. Emit execution started event
    this._eventBus.emit({
      type: 'workflow:execution_started',
      payload: { workflowId, runId, topology: teamDesign.topology, dryRun },
      source: 'workflow-executor',
      taskId: runId,
    });

    // 6. Mark all non-start nodes as pending
    const pendingNodeStates = { ...initialNodeStates };
    for (const node of doc.nodes) {
      if (node.type !== 'start' && node.type !== 'output') {
        pendingNodeStates[node.id] = makeNodeState(node.id, 'pending');
      }
    }

    // 7. Subscribe to node-level events from EventBus to track per-node state
    const trackingStates = { ...pendingNodeStates };

    const nodeStartedHandler = async (event: import('../types/common.js').QosEvent): Promise<void> => {
      const nodeId = event.payload['nodeId'] as string | undefined;
      if (nodeId && nodeId in trackingStates) {
        trackingStates[nodeId] = makeNodeState(nodeId, 'running', null, null, now());
      }
    };

    const nodeCompletedHandler = async (event: import('../types/common.js').QosEvent): Promise<void> => {
      const nodeId = event.payload['nodeId'] as string | undefined;
      const output = event.payload['output'] as string | undefined;
      const costUsd = event.payload['costUsd'] as number | undefined;
      const latencyMs = event.payload['latencyMs'] as number | undefined;
      if (nodeId && nodeId in trackingStates) {
        const existing = trackingStates[nodeId]!;
        trackingStates[nodeId] = makeNodeState(
          nodeId, 'complete',
          output ?? null, null,
          existing.startedAt, now(),
          costUsd ?? 0, latencyMs ?? 0,
        );
      }
    };

    const nodeFailedHandler = async (event: import('../types/common.js').QosEvent): Promise<void> => {
      const nodeId = event.payload['nodeId'] as string | undefined;
      const error = event.payload['error'] as string | undefined;
      if (nodeId && nodeId in trackingStates) {
        const existing = trackingStates[nodeId]!;
        trackingStates[nodeId] = makeNodeState(
          nodeId, 'error',
          null, error ?? 'Unknown error',
          existing.startedAt, now(),
        );
      }
    };

    this._eventBus.on('workflow:node_started', nodeStartedHandler);
    this._eventBus.on('workflow:node_completed', nodeCompletedHandler);
    this._eventBus.on('workflow:node_failed', nodeFailedHandler);

    let finalOutput = '';
    let totalCostUsd = 0;
    let finalStatus: WorkflowExecutionState['status'] = 'completed';
    let executionError: string | null = null;

    // 8. Execute via SwarmEngine (skip for dry runs)
    if (!dryRun) {
      try {
        if (!this._swarm || typeof this._swarm.run !== 'function') {
          throw new Error('SwarmEngine not available — configure providers in Settings first');
        }
        const swarmResult = await this._swarm.run(teamDesign, {
          prompt,
          mode: 'power',
          taskId: runId,
        });

        finalOutput = swarmResult.aggregatedOutput;
        totalCostUsd = swarmResult.totalCostUsd;

        // Mark any still-pending nodes as skipped
        for (const nodeId of Object.keys(trackingStates)) {
          if (trackingStates[nodeId]!.status === 'pending') {
            trackingStates[nodeId] = makeNodeState(nodeId, 'skipped');
          }
        }

        // Mark output nodes as complete
        for (const node of doc.nodes) {
          if (node.type === 'output') {
            trackingStates[node.id] = makeNodeState(
              node.id, 'complete', finalOutput, null, now(), now(),
            );
          }
        }

      } catch (err) {
        finalStatus = 'failed';
        executionError = err instanceof Error ? err.message : String(err);

        // Mark all running nodes as errored
        for (const [nodeId, state] of Object.entries(trackingStates)) {
          if (state.status === 'running' || state.status === 'pending') {
            trackingStates[nodeId] = makeNodeState(
              nodeId, 'error', null, executionError, state.startedAt, now(),
            );
          }
        }
      }
    } else {
      // Dry run: simulate completion without actual execution
      finalOutput = '[DRY RUN] Workflow validated and converted successfully. No agents were executed.';
      for (const node of doc.nodes) {
        if (node.type !== 'start') {
          trackingStates[node.id] = makeNodeState(
            node.id, 'skipped', null, null, null, null,
          );
        }
      }
    }

    // 9. Unsubscribe tracking handlers
    this._eventBus.off('workflow:node_started', nodeStartedHandler);
    this._eventBus.off('workflow:node_completed', nodeCompletedHandler);
    this._eventBus.off('workflow:node_failed', nodeFailedHandler);

    const completedAt = now();

    // 10. Update run record in DB
    this._db.update(
      'workflow_runs',
      {
        status: finalStatus,
        node_states_json: JSON.stringify(trackingStates),
        total_cost_usd: totalCostUsd,
        final_output: executionError ?? finalOutput,
        completed_at: completedAt,
      },
      { id: runId },
    );

    // 11. Update workflow last_run_at / last_run_status
    this._store.update(workflowId, {
      lastRunAt: completedAt,
      lastRunStatus: finalStatus === 'completed' ? 'completed' : 'failed',
    });

    // 12. Emit completion / failure event
    if (finalStatus === 'completed') {
      this._eventBus.emit({
        type: 'workflow:execution_completed',
        payload: { workflowId, runId, totalCostUsd, dryRun },
        source: 'workflow-executor',
        taskId: runId,
      });
    } else {
      this._eventBus.emit({
        type: 'workflow:execution_failed',
        payload: { workflowId, runId, error: executionError },
        source: 'workflow-executor',
        taskId: runId,
      });
    }

    return {
      workflowId,
      runId,
      status: finalStatus,
      nodeStates: trackingStates,
      startedAt,
      completedAt,
      totalCostUsd,
      finalOutput: executionError ?? finalOutput,
    };
  }

  getRunHistory(workflowId: string, limit = 20): WorkflowRunSummary[] {
    const rows = this._db.query<WorkflowRunRow>(
      'SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?',
      [workflowId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      prompt: row.prompt,
      totalCostUsd: row.total_cost_usd,
      finalOutput: row.final_output,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  }

  private _failedState(
    runId: string,
    workflowId: string,
    startedAt: string,
    error: string,
    nodeStates: Record<string, NodeExecutionState>,
  ): WorkflowExecutionState {
    return {
      workflowId,
      runId,
      status: 'failed',
      nodeStates,
      startedAt,
      completedAt: now(),
      totalCostUsd: 0,
      finalOutput: error,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowExecutor(
  db: QosDatabase,
  store: WorkflowStore,
  validator: WorkflowValidator,
  converter: WorkflowConverter,
  swarm: SwarmEngine,
  eventBus: EventBus,
): WorkflowExecutor {
  return new WorkflowExecutorImpl(db, store, validator, converter, swarm, eventBus);
}
