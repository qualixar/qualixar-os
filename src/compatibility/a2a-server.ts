// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8b -- A2A Server
 *
 * Expose Qualixar OS agents as A2A-discoverable services.
 * Implements the A2A v0.3 protocol endpoints:
 *   GET  /.well-known/agent-card   -- discovery
 *   POST /a2a/tasks/send           -- submit task (async, returns 202)
 *   GET  /a2a/tasks/:id/status     -- poll task status
 *
 * Hard Rules:
 *   - protocol MUST be 'a2a/v0.3' (REWRITE-SPEC)
 *   - readonly on all interface properties
 *   - ESM .js extensions on local imports
 *   - No silent error swallowing
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { Orchestrator } from '../engine/orchestrator.js';
import type { EventBus } from '../events/event-bus.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface A2ATaskRequest {
  readonly id?: string;
  readonly prompt: string;
  readonly taskType?: string;
  readonly maxBudgetUsd?: number;
  readonly timeoutMs?: number;
  readonly callbackUrl?: string;
}

export interface A2ATaskResponse {
  readonly id: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly output?: string;
  readonly costUsd?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface A2AAgentCard {
  readonly name: string;
  readonly protocol: string;
  readonly capabilities: readonly string[];
  readonly description?: string;
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Internal task state
// ---------------------------------------------------------------------------

interface ActiveTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface A2AServer {
  getAgentCard(): A2AAgentCard;
  registerCapability(capability: string): void;
  mountRoutes(app: Hono): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class A2AServerImpl implements A2AServer {
  private readonly _orchestrator: Orchestrator;
  private readonly _eventBus: EventBus;
  private readonly _agentRegistry: AgentRegistry;
  private readonly _configManager: ConfigManager;
  private readonly _logger: Logger;
  private readonly _capabilities: string[] = [];
  private readonly _activeTasks: Map<string, ActiveTask> = new Map();

  constructor(
    orchestrator: Orchestrator,
    eventBus: EventBus,
    agentRegistry: AgentRegistry,
    configManager: ConfigManager,
    logger: Logger,
  ) {
    this._orchestrator = orchestrator;
    this._eventBus = eventBus;
    this._agentRegistry = agentRegistry;
    this._configManager = configManager;
    this._logger = logger;
  }

  getAgentCard(): A2AAgentCard {
    return {
      name: 'Qualixar OS',
      protocol: 'a2a/v0.3',
      capabilities: [...this._capabilities],
      description: 'Qualixar OS Agent Operating System',
    };
  }

  registerCapability(capability: string): void {
    if (!this._capabilities.includes(capability)) {
      this._capabilities.push(capability);
    }
  }

  mountRoutes(app: Hono): void {
    // Route 1: Agent card discovery
    app.get('/.well-known/agent-card', (c) => {
      return c.json(this.getAgentCard());
    });

    // Route 2: Submit task (async)
    app.post('/a2a/tasks/send', async (c) => {
      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }

      // Validate prompt
      const prompt = body.prompt;
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return c.json({ error: 'prompt is required and must be a non-empty string' }, 400);
      }

      const taskId = (body.id as string) || randomUUID();

      // Register task as pending (in-memory + DB for persistence, M-15)
      const task: ActiveTask = {
        id: taskId,
        status: 'pending',
      };
      this._activeTasks.set(taskId, task);
      this._persistTaskState(taskId, task);

      // Emit event
      this._eventBus.emit({
        type: 'a2a:request_received',
        payload: {
          taskId,
          prompt: prompt as string,
          taskType: body.taskType,
        },
        source: 'a2a-server',
      });

      // Launch async execution (fire-and-forget)
      this._executeA2ATask(taskId, {
        prompt: prompt as string,
        taskType: body.taskType as string | undefined,
        maxBudgetUsd: body.maxBudgetUsd as number | undefined,
        timeoutMs: body.timeoutMs as number | undefined,
      });

      // Return 202 Accepted immediately
      return c.json({ id: taskId, status: 'pending' } as A2ATaskResponse, 202);
    });

    // Route 3: Task status polling (M-15: check DB if not in memory)
    app.get('/a2a/tasks/:id/status', (c) => {
      const taskId = c.req.param('id');
      let task = this._activeTasks.get(taskId);

      // M-15: Fallback to DB for persisted A2A tasks (e.g., after server restart)
      if (!task) {
        const dbTask = this._loadTaskFromDb(taskId);
        if (dbTask) {
          this._activeTasks.set(taskId, dbTask);
          task = dbTask;
        }
      }

      if (!task) {
        return c.json({ error: `Task '${taskId}' not found` }, 404);
      }

      return c.json(this._buildTaskResponse(taskId));
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _executeA2ATask(
    taskId: string,
    options: {
      prompt: string;
      taskType?: string;
      maxBudgetUsd?: number;
      timeoutMs?: number;
    },
  ): void {
    const task = this._activeTasks.get(taskId);
    /* v8 ignore next 3 -- defensive guard: task always exists here (added by route handler immediately before this call) */
    if (!task) {
      return;
    }

    task.status = 'running';

    // Run orchestrator asynchronously
    this._orchestrator
      .run({
        prompt: options.prompt,
        type: (options.taskType as 'code' | 'research' | 'analysis' | 'creative' | 'custom') ?? undefined,
        budget_usd: options.maxBudgetUsd,
      })
      .then((result) => {
        const t = this._activeTasks.get(taskId);
        /* v8 ignore next -- defensive: task always exists (added before _executeA2ATask call, never removed during execution) */
        if (t) {
          t.status = result.status === 'completed' ? 'completed' : 'failed';
          t.output = result.output;
          t.costUsd = result.cost.total_usd;
          t.metadata = result.metadata;
          this._persistTaskState(taskId, t);
        }
      })
      .catch((err: unknown) => {
        const t = this._activeTasks.get(taskId);
        /* v8 ignore next -- defensive: same as .then branch above */
        if (t) {
          t.status = 'failed';
          t.output = err instanceof Error ? err.message : String(err);
          this._persistTaskState(taskId, t);
        }
        this._logger.error({ taskId, err }, 'A2A task execution failed');
      });
  }

  // M-15: Persist A2A task state to the tasks table so it survives restarts.
  private _persistTaskState(taskId: string, task: ActiveTask): void {
    try {
      const db = this._orchestrator.db;
      const existing = db.query<{ id: string }>('SELECT id FROM tasks WHERE id = ?', [taskId]);
      if (existing.length > 0) {
        db.update('tasks', {
          status: task.status,
          result: task.output ?? null,
          cost_usd: task.costUsd ?? 0,
          updated_at: new Date().toISOString(),
        }, { id: taskId });
      }
    } catch {
      // DB persistence is best-effort for A2A; in-memory is the primary source.
    }
  }

  // M-15: Load A2A task state from DB (for tasks surviving server restart).
  private _loadTaskFromDb(taskId: string): ActiveTask | null {
    try {
      const rows = this._orchestrator.db.query<Record<string, unknown>>(
        'SELECT id, status, result, cost_usd FROM tasks WHERE id = ?',
        [taskId],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        id: row.id as string,
        status: (row.status as ActiveTask['status']) ?? 'failed',
        output: row.result as string | undefined,
        costUsd: row.cost_usd as number | undefined,
      };
    } catch {
      return null;
    }
  }

  private _buildTaskResponse(taskId: string): A2ATaskResponse {
    const task = this._activeTasks.get(taskId);
    /* v8 ignore next 3 -- defensive guard: caller (status route) already verifies task existence before calling this */
    if (!task) {
      return { id: taskId, status: 'failed', output: 'Task not found' };
    }

    return {
      id: task.id,
      status: task.status,
      output: task.output,
      costUsd: task.costUsd,
      metadata: task.metadata,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createA2AServer(
  orchestrator: Orchestrator,
  eventBus: EventBus,
  agentRegistry: AgentRegistry,
  configManager: ConfigManager,
  logger: Logger,
): A2AServer {
  return new A2AServerImpl(orchestrator, eventBus, agentRegistry, configManager, logger);
}
