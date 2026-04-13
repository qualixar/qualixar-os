// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import { loadConfigFromDisk } from './config-routes.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'TaskRoutes' });

// ---------------------------------------------------------------------------
// G-06: Workspace file listing helper
// ---------------------------------------------------------------------------

// M-08: Added maxDepth and maxFiles limits to prevent DoS from deep/large directories (e.g. node_modules)
function listWorkspaceFiles(
  dir: string,
  prefix = '',
  depth = 0,
  maxDepth = 5,
  collected: { count: number } = { count: 0 },
  maxFiles = 1000,
): Array<{ path: string; size: number; isDirectory: boolean }> {
  if (depth > maxDepth || collected.count >= maxFiles) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const result: Array<{ path: string; size: number; isDirectory: boolean }> = [];
  for (const entry of entries) {
    if (collected.count >= maxFiles) break;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push({ path: relPath, size: 0, isDirectory: true });
      collected.count++;
      result.push(...listWorkspaceFiles(join(dir, entry.name), relPath, depth + 1, maxDepth, collected, maxFiles));
    } else {
      const stat = statSync(join(dir, entry.name));
      result.push({ path: relPath, size: stat.size, isDirectory: false });
      collected.count++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// DEF-018: Zod Schemas for Request Body Validation
// ---------------------------------------------------------------------------

const TASK_TYPES = ['code', 'research', 'analysis', 'creative', 'custom'] as const;
const QOS_MODES = ['companion', 'power'] as const;

const RunTaskSchema = z.object({
  prompt: z.string().min(1),
  type: z.enum(TASK_TYPES).optional(),
  mode: z.enum(QOS_MODES).optional(),
  budget_usd: z.number().optional(),
  topology: z.string().optional(),
  simulate: z.boolean().optional(),
  stream: z.boolean().optional(),
  workingDir: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Register all task-related routes
// ---------------------------------------------------------------------------

export function registerTaskRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Tasks ----

  app.get('/api/tasks', (c) => {
    const rows = orchestrator.db.query<{ id: string; status: string; type: string; created_at: string; last_heartbeat: string | null }>(
      'SELECT id, status, type, created_at, last_heartbeat FROM tasks ORDER BY created_at DESC LIMIT 100',
      [],
    );
    // G-13: Enrich tasks with heartbeat status for dashboard visibility
    const enriched = rows.map(r => {
      const isRunning = r.status === 'running';
      const heartbeatAge = r.last_heartbeat ? Date.now() - new Date(r.last_heartbeat).getTime() : null;
      return {
        ...r,
        heartbeat: isRunning ? {
          lastSeen: r.last_heartbeat,
          ageMs: heartbeatAge,
          status: !heartbeatAge ? 'unknown' : heartbeatAge < 60_000 ? 'healthy' : heartbeatAge < 300_000 ? 'warning' : 'stale',
        } : null,
      };
    });
    return c.json({ tasks: enriched, total: enriched.length });
  });

  app.post('/api/tasks', async (c) => {
    try {
      const body = await c.req.json();
      // DEF-018: Zod validation for task creation
      const parsed = RunTaskSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
      }
      const taskId = randomUUID();
      const now = new Date().toISOString();
      // Pre-insert task row so GET /api/tasks/:id works immediately
      const currentMode = orchestrator.modeEngine.currentMode ?? 'companion';
      try {
        orchestrator.db.insert('tasks', {
          id: taskId,
          type: parsed.data.type ?? 'custom',
          prompt: parsed.data.prompt,
          status: 'pending',
          mode: parsed.data.mode ?? currentMode,
          cost_usd: 0,
          created_at: now,
          updated_at: now,
        });
      } catch {
        /* best-effort — orchestrator.run() will also insert */
      }
      // G-14: Resolve workspace directory and execution config from disk config
      let resolvedWorkingDir = parsed.data.workingDir;
      let resolvedMaxOutputTokens: number | undefined;
      try {
        const diskConfig = loadConfigFromDisk();
        if (!resolvedWorkingDir) {
          const customDir = diskConfig.workspace;
          if (customDir?.default_dir) {
            resolvedWorkingDir = join(customDir.default_dir, taskId);
          }
        }
        // Read execution.max_output_tokens from config (dashboard-configurable)
        if (diskConfig.execution?.max_output_tokens) {
          resolvedMaxOutputTokens = diskConfig.execution.max_output_tokens;
        }
      } catch { /* config read failed, orchestrator will use defaults */ }

      // Fire-and-forget: run the task async so we return 202 immediately
      orchestrator.run({
        prompt: parsed.data.prompt,
        type: parsed.data.type ?? 'custom',
        mode: parsed.data.mode,
        budget_usd: parsed.data.budget_usd,
        topology: parsed.data.topology,
        simulate: parsed.data.simulate,
        stream: parsed.data.stream,
        workingDir: resolvedWorkingDir,
        maxOutputTokens: resolvedMaxOutputTokens,
        taskId,
      }).catch((err) => {
        // Store the error in the task record so it's visible in the dashboard
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ taskId, err: errMsg }, 'orchestrator error');
        try {
          orchestrator.db.update('tasks', {
            status: 'failed',
            result: JSON.stringify({ error: errMsg, phase: 'orchestrator' }),
            updated_at: new Date().toISOString(),
          }, { id: taskId });
        } catch { /* best-effort error storage */ }
        orchestrator.eventBus.emit({
          type: 'task:failed',
          payload: { taskId, error: errMsg },
          source: 'http-server',
        });
      });
      return c.json({ taskId, status: 'pending' }, 202);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.get('/api/tasks/:id', (c) => {
    try {
      const taskId = c.req.param('id');
      // Try in-memory orchestrator first (active tasks)
      try {
        const status = orchestrator.getStatus(taskId);
        return c.json({ task: status });
      } catch {
        // Fall back to DB (completed/historical tasks)
        const rows = orchestrator.db.query<Record<string, unknown>>(
          'SELECT id, status, type, created_at, updated_at, result FROM tasks WHERE id = ?',
          [taskId],
        );
        if (rows.length > 0) {
          return c.json({ task: rows[0] });
        }
        return c.json({ error: 'Task not found' }, 404);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 404);
    }
  });

  app.get('/api/tasks/:id/detail', (c) => {
    try {
      const taskId = c.req.param('id');
      const taskRows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM tasks WHERE id = ?',
        [taskId],
      );
      if (taskRows.length === 0) {
        return c.json({ error: 'Task not found' }, 404);
      }
      const judges = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM judge_results WHERE task_id = ?',
        [taskId],
      );
      const agents = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM agents WHERE task_id = ?',
        [taskId],
      );
      const costs = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM model_calls WHERE task_id = ?',
        [taskId],
      );

      // Parse the result JSON to extract clean output + artifacts
      const task = { ...taskRows[0] } as Record<string, unknown>;
      let parsedOutput: string | null = null;
      let parsedArtifacts: unknown[] = [];
      if (typeof task.result === 'string') {
        try {
          const parsed = JSON.parse(task.result) as Record<string, unknown>;
          parsedOutput = (parsed.output as string) ?? null;
          parsedArtifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
        } catch {
          // result is plain text, not JSON
          parsedOutput = task.result;
        }
      }
      task.parsedOutput = parsedOutput;
      task.parsedArtifacts = parsedArtifacts;

      return c.json({ task, judges, agents, costs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ---- Agent Logs (Deep Structured Logging — Phase E G-11) ----

  app.get('/api/tasks/:id/logs', (c) => {
    try {
      const taskId = c.req.param('id');
      const logDir = join(homedir(), '.qualixar-os', 'workspaces', taskId, '.qos-log');
      if (!existsSync(logDir)) return c.json({ logs: [] });

      const teamLog = join(logDir, 'team.jsonl');
      if (!existsSync(teamLog)) return c.json({ logs: [] });

      const lines = readFileSync(teamLog, 'utf-8').trim().split('\n');
      const logs = lines.filter((l) => l).map((l) => JSON.parse(l));
      return c.json({ logs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // Helper: determine correct error response for task lifecycle ops
  // DEF-042: Standardized { error: string, details?: unknown } pattern
  const taskLifecycleErrorResponse = (c: { json: (data: { error: string; details?: unknown }, status: number) => Response }, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unknown task|not found/i.test(msg)) return c.json({ error: msg }, 404);
    if (/cannot .* task in .* state|invalid state/i.test(msg)) return c.json({ error: msg }, 409);
    return c.json({ error: msg }, 400);
  };

  app.post('/api/tasks/:id/pause', async (c) => {
    try {
      const taskId = c.req.param('id');
      await orchestrator.pause(taskId);
      return c.json({ ok: true, taskId, action: 'paused' });
    } catch (err) {
      return taskLifecycleErrorResponse(c, err);
    }
  });

  app.post('/api/tasks/:id/resume', async (c) => {
    try {
      const taskId = c.req.param('id');
      await orchestrator.resume(taskId);
      return c.json({ ok: true, taskId, action: 'resumed' });
    } catch (err) {
      return taskLifecycleErrorResponse(c, err);
    }
  });

  app.post('/api/tasks/:id/cancel', async (c) => {
    try {
      const taskId = c.req.param('id');
      await orchestrator.cancel(taskId);
      return c.json({ ok: true, taskId, action: 'cancelled' });
    } catch (err) {
      return taskLifecycleErrorResponse(c, err);
    }
  });

  app.post('/api/tasks/:id/redirect', async (c) => {
    try {
      const taskId = c.req.param('id');
      const body = await c.req.json();
      if (!body.newPrompt || typeof body.newPrompt !== 'string') {
        return c.json({ error: 'newPrompt is required and must be a string' }, 400);
      }
      await orchestrator.redirect(taskId, body.newPrompt);
      return c.json({ ok: true, taskId, action: 'redirected' });
    } catch (err) {
      return taskLifecycleErrorResponse(c, err);
    }
  });

  // ---- G-06: Workspace Browsing ----

  app.get('/api/tasks/:taskId/workspace', (c) => {
    const taskId = c.req.param('taskId');
    let baseDir: string;
    try {
      const wsConfig = loadConfigFromDisk();
      const customDir = (wsConfig as Record<string, unknown>).workspace as { default_dir?: string } | undefined;
      const rawDir = customDir?.default_dir || '';
      baseDir = rawDir ? rawDir.replace(/^~/, homedir()) : join(homedir(), '.qualixar-os', 'workspaces');
    } catch {
      baseDir = join(homedir(), '.qualixar-os', 'workspaces');
    }
    const wsDir = join(baseDir, taskId);

    if (!existsSync(wsDir)) {
      return c.json({ files: [], exists: false });
    }

    const files = listWorkspaceFiles(wsDir);
    return c.json({ files, exists: true, path: wsDir });
  });

  app.get('/api/tasks/:taskId/workspace/*', (c) => {
    const taskId = c.req.param('taskId');
    const filePath = c.req.path.replace(`/api/tasks/${taskId}/workspace/`, '');
    let baseDir: string;
    try {
      const wsConfig = loadConfigFromDisk();
      const customDir = (wsConfig as Record<string, unknown>).workspace as { default_dir?: string } | undefined;
      const rawDir = customDir?.default_dir || '';
      baseDir = rawDir ? rawDir.replace(/^~/, homedir()) : join(homedir(), '.qualixar-os', 'workspaces');
    } catch {
      baseDir = join(homedir(), '.qualixar-os', 'workspaces');
    }
    const wsDir = join(baseDir, taskId);
    const fullPath = join(wsDir, filePath);

    // Security: containment check — prevent path traversal
    if (!fullPath.startsWith(wsDir)) {
      return c.json({ error: 'Path outside workspace' }, 403);
    }

    if (!existsSync(fullPath)) {
      return c.json({ error: 'File not found' }, 404);
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      return c.json({ content, path: filePath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });
}
