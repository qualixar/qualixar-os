// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Workflow API Routes
 *
 * Hono route registrations for /api/workflows/*.
 * All responses use { ok: true, ... } pattern.
 * All write endpoints validate inputs before processing.
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-3: No raw SQL — all data access goes through WorkflowStore/WorkflowExecutor.
 */

import { Hono } from 'hono';
import type { WorkflowStore } from './workflow-store.js';
import type { WorkflowValidator } from './workflow-validator.js';
import type { WorkflowConverter } from './workflow-converter.js';
import type { WorkflowExecutor } from './workflow-executor.js';
import type { EventBus } from '../events/event-bus.js';
import type {
  WorkflowNode,
  WorkflowEdge,
} from '../types/phase21.js';

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

function ok(data: Readonly<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function created(data: Readonly<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Input Validation Helpers
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseQueryInt(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function parseQueryTags(val: string | undefined): string[] | undefined {
  if (!val) return undefined;
  return val.split(',').map((t) => t.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerWorkflowRoutes(
  app: Hono,
  store: WorkflowStore,
  validator: WorkflowValidator,
  converter: WorkflowConverter,
  executor: WorkflowExecutor,
  _eventBus: EventBus,
): void {

  // ---------------------------------------------------------------------------
  // GET /api/workflows
  // List workflows with optional search, tags, limit, offset
  // ---------------------------------------------------------------------------
  app.get('/api/workflows', (c) => {
    const { search, tags: tagsRaw, limit: limitRaw, offset: offsetRaw } = c.req.query();

    const limit = parseQueryInt(limitRaw, 50);
    const offset = parseQueryInt(offsetRaw, 0);
    const tags = parseQueryTags(tagsRaw);

    if (limit < 1 || limit > 200) {
      return errorResponse('limit must be between 1 and 200');
    }
    if (offset < 0) {
      return errorResponse('offset must be >= 0');
    }

    const workflows = store.list(search, tags, limit, offset);
    const total = store.count(search, tags);

    return ok({ workflows, total, limit, offset });
  });

  // ---------------------------------------------------------------------------
  // GET /api/workflows/:id
  // Get full workflow document by ID
  // ---------------------------------------------------------------------------
  app.get('/api/workflows/:id', (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const workflow = store.get(id);
    if (!workflow) return errorResponse(`Workflow not found: ${id}`, 404);

    return ok({ workflow });
  });

  // ---------------------------------------------------------------------------
  // POST /api/workflows
  // Create a new workflow
  // ---------------------------------------------------------------------------
  app.post('/api/workflows', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('Invalid JSON body');
    }

    const data = body as Record<string, unknown>;

    const name = data['name'];
    const description = data['description'] ?? '';
    const nodes = data['nodes'] ?? [];
    const edges = data['edges'] ?? [];

    if (typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('name is required and must be a non-empty string');
    }
    if (typeof description !== 'string') {
      return errorResponse('description must be a string');
    }
    if (!Array.isArray(nodes)) {
      return errorResponse('nodes must be an array');
    }
    if (!Array.isArray(edges)) {
      return errorResponse('edges must be an array');
    }

    const workflow = store.create(
      name.trim(),
      description,
      nodes as readonly WorkflowNode[],
      edges as readonly WorkflowEdge[],
    );

    return created({ workflow });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/workflows/:id
  // Update an existing workflow
  // ---------------------------------------------------------------------------
  app.put('/api/workflows/:id', async (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const existing = store.get(id);
    if (!existing) return errorResponse(`Workflow not found: ${id}`, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse('Invalid JSON body');
    }

    const data = body as Record<string, unknown>;
    const changes: Record<string, unknown> = {};

    if ('name' in data) {
      if (typeof data['name'] !== 'string' || (data['name'] as string).trim().length === 0) {
        return errorResponse('name must be a non-empty string');
      }
      changes['name'] = (data['name'] as string).trim();
    }

    if ('description' in data) {
      if (typeof data['description'] !== 'string') {
        return errorResponse('description must be a string');
      }
      changes['description'] = data['description'];
    }

    if ('nodes' in data) {
      if (!Array.isArray(data['nodes'])) {
        return errorResponse('nodes must be an array');
      }
      changes['nodes'] = data['nodes'] as readonly WorkflowNode[];
    }

    if ('edges' in data) {
      if (!Array.isArray(data['edges'])) {
        return errorResponse('edges must be an array');
      }
      changes['edges'] = data['edges'] as readonly WorkflowEdge[];
    }

    if ('tags' in data) {
      if (!isStringArray(data['tags'])) {
        return errorResponse('tags must be an array of strings');
      }
      changes['tags'] = data['tags'] as string[];
    }

    const workflow = store.update(id, changes);
    return ok({ workflow });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/workflows/:id
  // Remove a workflow and its runs (cascade on FK)
  // ---------------------------------------------------------------------------
  app.delete('/api/workflows/:id', (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const removed = store.remove(id);
    if (!removed) return errorResponse(`Workflow not found: ${id}`, 404);

    return ok({ deleted: true, id });
  });

  // ---------------------------------------------------------------------------
  // POST /api/workflows/:id/run
  // Execute a workflow
  // ---------------------------------------------------------------------------
  app.post('/api/workflows/:id/run', async (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const existing = store.get(id);
    if (!existing) return errorResponse(`Workflow not found: ${id}`, 404);

    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      // Body is optional for run — allow empty body
    }

    const prompt = body['prompt'] ?? '';
    const dryRun = body['dryRun'] === true;

    if (typeof prompt !== 'string') {
      return errorResponse('prompt must be a string');
    }

    let result;
    try {
      result = await executor.execute(id, prompt, dryRun);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Execution failures are not 500s — they're expected outcomes
      return ok({
        run: {
          status: 'failed',
          error: msg,
          workflowId: id,
        },
      });
    }

    return ok({ run: result });
  });

  // ---------------------------------------------------------------------------
  // POST /api/workflows/:id/validate
  // Validate workflow without executing
  // ---------------------------------------------------------------------------
  app.post('/api/workflows/:id/validate', (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const doc = store.get(id);
    if (!doc) return errorResponse(`Workflow not found: ${id}`, 404);

    const result = validator.validate(doc);

    return ok({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/workflows/:id/runs
  // Get run history for a workflow
  // ---------------------------------------------------------------------------
  app.get('/api/workflows/:id/runs', (c) => {
    const { id } = c.req.param();
    if (!id) return errorResponse('Missing workflow id', 400);

    const existing = store.get(id);
    if (!existing) return errorResponse(`Workflow not found: ${id}`, 404);

    const { limit: limitRaw } = c.req.query();
    const limit = parseQueryInt(limitRaw, 20);

    if (limit < 1 || limit > 100) {
      return errorResponse('limit must be between 1 and 100');
    }

    const runs = executor.getRunHistory(id, limit);
    return ok({ runs, total: runs.length });
  });
}
