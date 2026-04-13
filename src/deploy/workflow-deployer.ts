// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Workflow Deployer
 * LLD Section 3.1 Component #7, Algorithm 8.5
 *
 * Deploys blueprints as running/scheduled tasks.
 * Trigger types: once (immediate), cron (scheduled), event (EventBus listener).
 * Deployment limit: 50 active (E-13).
 */

import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { EventBus } from '../events/event-bus.js';
import type { Orchestrator } from '../engine/orchestrator.js';
import type { QosEventType } from '../types/events.js';
import type {
  WorkflowDeployment,
  DeploymentInput,
} from '../types/phase18.js';
import { parseCron } from './cron-scheduler.js';
import type { CronScheduler } from './cron-scheduler.js';

// ---------------------------------------------------------------------------
// DB Row
// ---------------------------------------------------------------------------

interface DeploymentRow {
  readonly id: string;
  readonly blueprint_id: string;
  readonly blueprint_name: string;
  readonly status: string;
  readonly trigger_type: string;
  readonly cron_expression: string | null;
  readonly trigger_event: string | null;
  readonly last_task_id: string | null;
  readonly last_run_at: string | null;
  readonly last_run_status: string | null;
  readonly run_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface BlueprintRow {
  readonly id: string;
  readonly name: string;
  readonly config: string;
  readonly topology: string | null;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface WorkflowDeployer {
  deploy(input: DeploymentInput): Promise<WorkflowDeployment>;
  cancel(deploymentId: string): boolean;
  list(statusFilter?: string): readonly WorkflowDeployment[];
  getHistory(deploymentId: string): readonly { taskId: string; status: string; startedAt: string; completedAt: string | null; costUsd: number }[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowDeployer(
  db: BetterSqlite3.Database,
  orchestrator: Orchestrator,
  cronScheduler: CronScheduler,
  eventBus: EventBus,
): WorkflowDeployer {
  return new WorkflowDeployerImpl(db, orchestrator, cronScheduler, eventBus);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const MAX_ACTIVE_DEPLOYMENTS = 50;

function rowToDeployment(row: DeploymentRow): WorkflowDeployment {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    blueprintName: row.blueprint_name,
    status: row.status as WorkflowDeployment['status'],
    triggerType: row.trigger_type as WorkflowDeployment['triggerType'],
    cronExpression: row.cron_expression,
    triggerEvent: row.trigger_event,
    lastTaskId: row.last_task_id,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status as WorkflowDeployment['lastRunStatus'],
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class WorkflowDeployerImpl implements WorkflowDeployer {
  private readonly _db: BetterSqlite3.Database;
  private readonly _orchestrator: Orchestrator;
  private readonly _cron: CronScheduler;
  private readonly _eventBus: EventBus;
  private readonly _eventListeners: Map<string, (event: import('../types/common.js').QosEvent) => Promise<void>> = new Map();

  constructor(
    db: BetterSqlite3.Database,
    orchestrator: Orchestrator,
    cronScheduler: CronScheduler,
    eventBus: EventBus,
  ) {
    this._db = db;
    this._orchestrator = orchestrator;
    this._cron = cronScheduler;
    this._eventBus = eventBus;
  }

  async deploy(input: DeploymentInput): Promise<WorkflowDeployment> {
    // Validate blueprint exists
    const blueprint = this._db
      .prepare('SELECT id, name, config, topology FROM blueprints WHERE id = ?')
      .get(input.blueprintId) as BlueprintRow | undefined;

    if (!blueprint) {
      throw new Error(`Blueprint '${input.blueprintId}' not found`);
    }

    // Validate trigger type
    if (!['once', 'cron', 'event'].includes(input.triggerType)) {
      throw new Error(`Invalid trigger type: ${input.triggerType}`);
    }

    // Validate cron expression
    if (input.triggerType === 'cron') {
      if (!input.cronExpression) {
        throw new Error('Cron expression required for cron trigger type');
      }
      parseCron(input.cronExpression); // throws on invalid
    }

    // Validate event type
    if (input.triggerType === 'event') {
      if (!input.triggerEvent) {
        throw new Error('Trigger event required for event trigger type');
      }
    }

    // Check deployment limit (E-13)
    const activeCount = this._db
      .prepare("SELECT COUNT(*) as count FROM deployments WHERE status IN ('active', 'running')")
      .get() as { count: number };

    if (activeCount.count >= MAX_ACTIVE_DEPLOYMENTS) {
      throw new Error('Maximum 50 active deployments');
    }

    const id = `dep_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    this._db.prepare(
      `INSERT INTO deployments
       (id, blueprint_id, blueprint_name, status, trigger_type, cron_expression, trigger_event, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.blueprintId,
      blueprint.name,
      input.triggerType,
      input.cronExpression ?? null,
      input.triggerEvent ?? null,
      now,
      now,
    );

    this._eventBus.emit({
      type: 'deployment:created',
      payload: { deploymentId: id, blueprintId: input.blueprintId, triggerType: input.triggerType },
      source: 'workflow-deployer',
    });

    // Execute based on trigger type
    if (input.triggerType === 'once') {
      await this._executeDeployment(id);
    } else if (input.triggerType === 'cron') {
      this._cron.schedule(id, input.cronExpression!, () => {
        void this._executeDeployment(id);
      });
    } else if (input.triggerType === 'event') {
      const listener = async () => {
        await this._executeDeployment(id);
      };
      this._eventListeners.set(id, listener);
      this._eventBus.on(input.triggerEvent as QosEventType, listener);
    }

    const row = this._db
      .prepare('SELECT * FROM deployments WHERE id = ?')
      .get(id) as DeploymentRow;

    return rowToDeployment(row);
  }

  cancel(deploymentId: string): boolean {
    const result = this._db
      .prepare("UPDATE deployments SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('active', 'running', 'paused')")
      .run(new Date().toISOString(), deploymentId);

    if (result.changes === 0) return false;

    // Cancel cron schedule
    this._cron.cancel(deploymentId);

    // Remove event listener
    const listener = this._eventListeners.get(deploymentId);
    if (listener) {
      this._eventListeners.delete(deploymentId);
    }

    this._eventBus.emit({
      type: 'deployment:cancelled',
      payload: { deploymentId },
      source: 'workflow-deployer',
    });
    return true;
  }

  list(statusFilter?: string): readonly WorkflowDeployment[] {
    const rows = statusFilter
      ? this._db
          .prepare('SELECT * FROM deployments WHERE status = ? ORDER BY created_at DESC')
          .all(statusFilter) as DeploymentRow[]
      : this._db
          .prepare('SELECT * FROM deployments ORDER BY created_at DESC')
          .all() as DeploymentRow[];

    return rows.map(rowToDeployment);
  }

  getHistory(deploymentId: string): readonly { taskId: string; status: string; startedAt: string; completedAt: string | null; costUsd: number }[] {
    const deployment = this._db
      .prepare('SELECT * FROM deployments WHERE id = ?')
      .get(deploymentId) as DeploymentRow | undefined;

    if (!deployment) return [];

    // Get tasks created by this deployment
    const tasks = this._db
      .prepare(
        `SELECT id, status, created_at, updated_at
         FROM tasks
         WHERE id IN (
           SELECT last_task_id FROM deployments WHERE id = ?
         )
         ORDER BY created_at DESC`,
      )
      .all(deploymentId) as Array<{
        id: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;

    return tasks.map((t) => ({
      taskId: t.id,
      status: t.status,
      startedAt: t.created_at,
      completedAt: t.status === 'completed' ? t.updated_at : null,
      costUsd: 0,
    }));
  }

  private async _executeDeployment(deploymentId: string): Promise<void> {
    // Atomic lock: set status='running' only if currently 'active'
    const lockResult = this._db
      .prepare("UPDATE deployments SET status = 'running' WHERE id = ? AND status = 'active'")
      .run(deploymentId);

    if (lockResult.changes === 0) return; // already running or cancelled

    const deployment = this._db
      .prepare('SELECT * FROM deployments WHERE id = ?')
      .get(deploymentId) as DeploymentRow | undefined;

    if (!deployment) return;

    const blueprint = this._db
      .prepare('SELECT * FROM blueprints WHERE id = ?')
      .get(deployment.blueprint_id) as BlueprintRow | undefined;

    if (!blueprint) return;

    const now = new Date().toISOString();

    try {
      const config = JSON.parse(blueprint.config || '{}') as Record<string, unknown>;
      const taskOptions = {
        prompt: (config.prompt as string) ?? `Execute ${blueprint.name}`,
        type: (config.taskType as 'custom') ?? 'custom',
        topology: blueprint.topology ?? undefined,
      } as const;

      const result = await this._orchestrator.run(taskOptions);

      this._db.prepare(
        `UPDATE deployments SET
         status = 'active', last_task_id = ?, last_run_at = ?,
         last_run_status = 'success', run_count = run_count + 1, updated_at = ?
         WHERE id = ?`,
      ).run(result.taskId, now, now, deploymentId);

      this._eventBus.emit({
        type: 'deployment:executed',
        payload: { deploymentId, status: 'success' },
        source: 'workflow-deployer',
      });
    } catch {
      this._db.prepare(
        `UPDATE deployments SET
         status = 'active', last_run_at = ?,
         last_run_status = 'failure', run_count = run_count + 1, updated_at = ?
         WHERE id = ?`,
      ).run(now, now, deploymentId);

      this._eventBus.emit({
        type: 'deployment:failed',
        payload: { deploymentId },
        source: 'workflow-deployer',
      });
    }
  }
}
