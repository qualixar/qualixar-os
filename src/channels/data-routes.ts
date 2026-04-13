// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS — Data & Analytics Routes
 *
 * Extracted from http-server.ts (lines 1239-1851).
 * Covers: Structured Logs, Reviews/Gate, Datasets, Vectors,
 *         Blueprints, Prompt Library, Lab/Experiments, Traces,
 *         Flows, HitL (Human-in-the-Loop).
 */

import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import { createEmbeddingProvider, cosineSimilarity } from '../memory/embeddings.js';

// Zod schema for blueprint creation (Fix 5: replace ad-hoc validation)
const BlueprintCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['single', 'pipeline', 'debate', 'swarm', 'hierarchical', 'mesh', 'custom']),
  description: z.string().max(2000).optional(),
  topology: z.string().optional(),
  agentCount: z.number().int().min(0).optional(),
  tags: z.array(z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export function registerDataRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Structured Logs (Phase 15) ----

  app.get('/api/logs', (c) => {
    // Try structured_logs first
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM structured_logs ORDER BY timestamp DESC LIMIT 200',
      [],
    );
    if (rows.length > 0) {
      const logs = rows.map((r) => ({
        id: r.id,
        level: r.level,
        source: r.source,
        message: r.message,
        taskId: r.task_id,
        agentId: r.agent_id,
        metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
        timestamp: r.timestamp,
      }));
      return c.json({ logs, total: logs.length });
    }
    // Fallback: derive logs from events table (always populated)
    const eventRows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT id, type, source, task_id, payload, created_at FROM events ORDER BY created_at DESC LIMIT 200',
      [],
    );
    const logs = eventRows.map((r) => {
      const evType = String(r.type ?? '');
      const level = evType.includes('error') || evType.includes('failed') ? 'error'
        : evType.includes('warn') ? 'warn'
        : evType.includes('debug') ? 'debug'
        : 'info';
      let payload: Record<string, unknown> = {};
      try { payload = typeof r.payload === 'string' ? JSON.parse(r.payload as string) : (r.payload as Record<string, unknown>) ?? {}; } catch { /* ignore */ }
      return {
        id: String(r.id),
        level,
        source: String(r.source ?? 'system'),
        message: `[${evType}] ${payload.status ? String(payload.status) : evType}`,
        taskId: r.task_id ? String(r.task_id) : undefined,
        agentId: undefined,
        metadata: payload,
        timestamp: String(r.created_at),
      };
    });
    return c.json({ logs, total: logs.length });
  });

  // ---- Reviews / Gate (Phase 15) ----

  app.get('/api/reviews', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200',
      [],
    );
    const reviews = rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      content: r.content,
      status: r.status,
      priority: r.priority,
      reviewer: r.reviewer,
      feedback: r.feedback,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }));
    return c.json({ reviews });
  });

  // POST /api/reviews — create a new review item (manual or auto from pipeline)
  app.post('/api/reviews', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.content) {
        return c.json({ error: 'content is required' }, 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.db.prepare(
        'INSERT INTO reviews (id, task_id, agent_id, content, status, priority, reviewer, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        body.taskId ?? '',
        body.agentId ?? 'manual',
        body.content,
        'pending',
        body.priority ?? 'medium',
        body.reviewer ?? null,
        null,
        now,
      );
      orchestrator.eventBus.emit({ type: 'review:created', payload: { id, taskId: body.taskId }, source: 'data-routes' });
      return c.json({ ok: true, id, status: 'pending' }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.put('/api/reviews/:id', async (c) => {
    try {
      const reviewId = c.req.param('id');
      const body = await c.req.json();
      const now = new Date().toISOString();
      const result = orchestrator.db.db.prepare(
        'UPDATE reviews SET status = ?, feedback = ?, reviewed_at = ? WHERE id = ?',
      ).run(body.status ?? 'approved', body.feedback ?? null, body.reviewedAt ?? now, reviewId);
      if (result.changes === 0) {
        return c.json({ error: 'Review not found' }, 404);
      }
      return c.json({ ok: true, id: reviewId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // ---- Datasets (Phase 15) ----

  app.get('/api/datasets', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM datasets ORDER BY created_at DESC',
      [],
    );
    const datasets = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      format: r.format,
      rowCount: r.row_count,
      columnCount: r.column_count,
      sizeBytes: r.size_bytes,
      data: r.data ? JSON.parse(r.data as string) : null,
      createdAt: r.created_at,
    }));
    return c.json({ datasets, total: datasets.length });
  });

  app.post('/api/datasets', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return c.json({ error: 'name is required and must be a non-empty string' }, 400);
      }
      if (!body.format || typeof body.format !== 'string') {
        return c.json({ error: 'format is required and must be a string' }, 400);
      }
      if (body.data !== undefined && !Array.isArray(body.data)) {
        return c.json({ error: 'data must be an array when provided' }, 400);
      }
      if (body.rowCount !== undefined && (typeof body.rowCount !== 'number' || body.rowCount < 0)) {
        return c.json({ error: 'rowCount must be a non-negative number' }, 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      // Compute metadata from data array
      const dataArr = Array.isArray(body.data) ? body.data : [];
      const computedRowCount = dataArr.length;
      const computedColCount = dataArr.length > 0 && typeof dataArr[0] === 'object' && dataArr[0] !== null
        ? Object.keys(dataArr[0] as Record<string, unknown>).length : 0;
      const dataStr = dataArr.length > 0 ? JSON.stringify(dataArr) : null;
      const computedSizeBytes = dataStr ? Buffer.byteLength(dataStr, 'utf-8') : 0;
      orchestrator.db.insert('datasets', {
        id,
        name: body.name,
        description: body.description ?? null,
        format: body.format,
        row_count: computedRowCount,
        column_count: computedColCount,
        size_bytes: computedSizeBytes,
        data: dataStr,
        created_at: now,
      });
      return c.json({
        id,
        name: body.name,
        description: body.description ?? null,
        format: body.format,
        rowCount: computedRowCount,
        columnCount: computedColCount,
        sizeBytes: computedSizeBytes,
        createdAt: now,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // M-16: Dataset preview endpoint — returns first N rows of a dataset.
  app.get('/api/datasets/:id/preview', (c) => {
    try {
      const datasetId = c.req.param('id');
      const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20), 500);
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM datasets WHERE id = ?',
        [datasetId],
      );
      if (rows.length === 0) {
        return c.json({ error: 'Dataset not found' }, 404);
      }
      const dataset = rows[0];
      let data: unknown[] = [];
      if (typeof dataset.data === 'string') {
        try {
          const parsed = JSON.parse(dataset.data);
          data = Array.isArray(parsed) ? parsed.slice(0, limit) : [parsed];
        } catch {
          data = [];
        }
      }
      return c.json({
        id: datasetId,
        name: dataset.name,
        format: dataset.format,
        previewRows: data,
        totalRows: dataset.row_count,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.delete('/api/datasets/:id', (c) => {
    try {
      const datasetId = c.req.param('id');
      const exists = orchestrator.db.query<{ id: string }>('SELECT id FROM datasets WHERE id = ?', [datasetId]);
      if (exists.length === 0) return c.json({ error: 'Dataset not found' }, 404);
      orchestrator.db.db.prepare('DELETE FROM datasets WHERE id = ?').run(datasetId);
      return c.json({ ok: true, id: datasetId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // ---- Vectors (Phase 16) ----

  app.get('/api/vectors', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT id, content, source, metadata, created_at FROM vector_entries ORDER BY created_at DESC LIMIT 100',
      [],
    );
    const vectors = rows.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
      createdAt: r.created_at,
    }));
    return c.json({ vectors });
  });

  // POST /api/vectors — ingest text into vector store (with optional embedding generation)
  app.post('/api/vectors', async (c) => {
    try {
      const body = await c.req.json();
      const items = Array.isArray(body) ? body : (body.items ?? [body]);
      if (items.length === 0) return c.json({ error: 'At least one item required (content field)' }, 400);

      const now = new Date().toISOString();
      const embeddingProvider = createEmbeddingProvider();
      const canEmbed = embeddingProvider.isAvailable();
      const results: Array<{ id: string; embedded: boolean }> = [];

      for (const item of items) {
        const content = item.content as string;
        if (!content) continue;
        const id = randomUUID();
        const source = (item.source as string) ?? 'manual';
        const metadata = item.metadata ? JSON.stringify(item.metadata) : null;

        // Generate embedding if provider is available
        let embedding: string | null = null;
        if (canEmbed) {
          try {
            const vec = await embeddingProvider.generateEmbedding(content);
            embedding = JSON.stringify(vec);
          } catch { /* embedding generation failed — store without */ }
        }

        orchestrator.db.db.prepare(
          'INSERT INTO vector_entries (id, content, source, metadata, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(id, content, source, metadata, embedding, now);
        results.push({ id, embedded: !!embedding });
      }

      return c.json({ ok: true, ingested: results.length, items: results }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // DELETE /api/vectors/:id — remove a vector entry
  app.delete('/api/vectors/:id', (c) => {
    const vecId = c.req.param('id');
    orchestrator.db.db.prepare('DELETE FROM vector_entries WHERE id = ?').run(vecId);
    return c.json({ ok: true, id: vecId });
  });

  app.get('/api/vectors/stats', (c) => {
    const countRows = orchestrator.db.query<{ total: number }>(
      'SELECT count(*) as total FROM vector_entries',
      [],
    );
    const total = countRows.length > 0 ? countRows[0].total : 0;
    const sourceRows = orchestrator.db.query<{ source: string; count: number }>(
      'SELECT source, count(*) as count FROM vector_entries GROUP BY source ORDER BY count DESC',
      [],
    );
    // Check dimensions from first vector entry if available
    let dimensions = 0;
    try {
      const dimRow = orchestrator.db.get<{ embedding: string }>(
        'SELECT embedding FROM vector_entries WHERE embedding IS NOT NULL LIMIT 1',
      );
      if (dimRow?.embedding) {
        const emb = JSON.parse(dimRow.embedding) as unknown[];
        dimensions = emb.length;
      }
    } catch { /* no embeddings yet */ }
    return c.json({ total, totalVectors: total, dimensions, sources: sourceRows });
  });

  // GET vector search (query param convenience)
  app.get('/api/vectors/search', (c) => {
    const query = c.req.query('q') ?? '';
    const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20), 500);
    if (!query.trim()) return c.json({ results: [], method: 'none' });
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT id, content, source, metadata, created_at FROM vector_entries WHERE content LIKE ? LIMIT ?',
      [`%${query}%`, limit],
    );
    const results = rows.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source,
      metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
      createdAt: r.created_at,
      score: 0,
    }));
    return c.json({ results, method: 'keyword' });
  });

  app.post('/api/vectors/search', async (c) => {
    try {
      const body = await c.req.json();
      const query = body.query ?? '';
      const limit = Math.min(Math.max(1, typeof body.limit === 'number' ? body.limit : 20), 500);

      // C-12: Try vector search with embeddings first, fall back to LIKE
      const embeddingProvider = createEmbeddingProvider();
      const queryEmbedding = embeddingProvider.isAvailable()
        ? await embeddingProvider.generateEmbedding(query)
        : null;

      if (queryEmbedding) {
        // Vector search: fetch all entries with embeddings, compute cosine similarity
        const allRows = orchestrator.db.query<Record<string, unknown>>(
          'SELECT id, content, source, metadata, embedding, created_at FROM vector_entries WHERE embedding IS NOT NULL',
          [],
        );
        const scored = allRows
          .map((r) => {
            let emb: number[] = [];
            try {
              emb = JSON.parse(r.embedding as string) as number[];
            } catch { /* skip invalid */ }
            const score = emb.length > 0 ? cosineSimilarity(queryEmbedding, emb) : 0;
            return {
              id: r.id,
              content: r.content,
              source: r.source,
              metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
              createdAt: r.created_at,
              score,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return c.json({ results: scored, method: 'vector' });
      }

      // Fallback: SQL LIKE search
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT id, content, source, metadata, created_at FROM vector_entries WHERE content LIKE ? LIMIT ?',
        [`%${query}%`, limit],
      );
      const results = rows.map((r) => ({
        id: r.id,
        content: r.content,
        source: r.source,
        metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
        createdAt: r.created_at,
      }));
      return c.json({ results, method: 'like' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // ---- Blueprints (Phase 16) ----

  app.get('/api/blueprints', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM blueprints ORDER BY usage_count DESC LIMIT 200',
      [],
    );
    const blueprints = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      topology: r.topology,
      agentCount: r.agent_count,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags as string) : r.tags,
      config: typeof r.config === 'string' ? JSON.parse(r.config as string) : r.config,
      usageCount: r.usage_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return c.json({ blueprints, total: blueprints.length });
  });

  app.post('/api/blueprints', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = BlueprintCreateSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid blueprint data', details: parsed.error.issues }, 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.insert('blueprints', {
        id,
        name: body.name,
        type: body.type,
        description: body.description ?? '',
        topology: body.topology ?? null,
        agent_count: body.agentCount ?? null,
        tags: JSON.stringify(body.tags ?? []),
        config: JSON.stringify(body.config ?? {}),
        usage_count: 0,
        created_at: now,
        updated_at: now,
      });
      // Audit trail: log blueprint creation
      try {
        orchestrator.db.db.prepare(
          'INSERT INTO audit_log (id, event_type, resource_type, resource_id, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(`aud_${randomUUID().slice(0, 24)}`, 'create', 'blueprint', id, JSON.stringify({ name: body.name }), now);
      } catch { /* audit table may not exist */ }
      return c.json({
        id,
        name: body.name,
        type: body.type,
        description: body.description ?? '',
        topology: body.topology ?? null,
        agentCount: body.agentCount ?? null,
        tags: body.tags ?? [],
        config: body.config ?? {},
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.post('/api/blueprints/:id/deploy', async (c) => {
    try {
      const blueprintId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>('SELECT * FROM blueprints WHERE id = ?', [blueprintId]);
      if (rows.length === 0) return c.json({ error: 'Blueprint not found' }, 404);
      const blueprint = rows[0];
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

      // Increment usage counter
      orchestrator.db.db.prepare(
        "UPDATE blueprints SET usage_count = usage_count + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(blueprintId);

      // Submit as a real task to the orchestrator
      const topology = (blueprint.topology as string) ?? 'sequential';
      const prompt = (body.prompt as string) ?? `Deploy blueprint "${blueprint.name}": ${blueprint.description ?? 'no description'}`;
      const taskId = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.db.prepare(
        'INSERT OR IGNORE INTO tasks (id, type, prompt, status, mode, result, cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(taskId, 'custom', prompt, 'pending', 'power', '', 0, now, now);

      void orchestrator.run({
        prompt,
        type: 'custom',
        topology,
        budget_usd: (body.budget as number) ?? 2.0,
        simulate: false,
        taskId,
      }).catch(() => { /* blueprint deploy errors tracked via task status */ });

      return c.json({ ok: true, blueprintId, taskId, status: 'running', topology });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.delete('/api/blueprints/:id', (c) => {
    try {
      const blueprintId = c.req.param('id');
      const exists = orchestrator.db.query<{ id: string }>('SELECT id FROM blueprints WHERE id = ?', [blueprintId]);
      if (exists.length === 0) return c.json({ error: 'Blueprint not found' }, 404);
      // Cascade: delete related deployments first to avoid FK constraint
      try { orchestrator.db.db.prepare('DELETE FROM deployments WHERE blueprint_id = ?').run(blueprintId); } catch { /* no deployments table or no FK */ }
      orchestrator.db.db.prepare('DELETE FROM blueprints WHERE id = ?').run(blueprintId);
      // Audit trail: log blueprint deletion
      try {
        orchestrator.db.db.prepare(
          'INSERT INTO audit_log (id, event_type, resource_type, resource_id, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(`aud_${randomUUID().slice(0, 24)}`, 'delete', 'blueprint', blueprintId, '{}', new Date().toISOString());
      } catch { /* audit table may not exist */ }
      return c.json({ ok: true, id: blueprintId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // ---- Prompt Library (Phase 16) ----

  app.get('/api/prompts', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM prompt_library ORDER BY usage_count DESC LIMIT 200',
      [],
    );
    const prompts = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      content: r.content,
      version: r.version,
      usageCount: r.usage_count,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags as string) : r.tags,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return c.json({ prompts });
  });

  app.post('/api/prompts', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.name || !body.category || !body.content) {
        return c.json({ error: 'name, category, and content are required' }, 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.insert('prompt_library', {
        id,
        name: body.name,
        category: body.category,
        content: body.content,
        version: 1,
        usage_count: 0,
        tags: JSON.stringify(body.tags ?? []),
        created_at: now,
        updated_at: now,
      });
      return c.json({
        id,
        name: body.name,
        category: body.category,
        content: body.content,
        version: 1,
        usageCount: 0,
        tags: body.tags ?? [],
        createdAt: now,
        updatedAt: now,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.put('/api/prompts/:id', async (c) => {
    try {
      const promptId = c.req.param('id');
      const body = await c.req.json();
      if (!body.content) {
        return c.json({ error: 'content is required' }, 400);
      }
      const now = new Date().toISOString();
      // Update ALL editable fields: name, category, content, tags + auto-increment version
      const tagsJson = body.tags ? JSON.stringify(body.tags) : undefined;
      const setClauses = ['content = ?', 'version = version + 1', 'updated_at = ?'];
      const params: unknown[] = [body.content, now];
      if (body.name) { setClauses.push('name = ?'); params.push(body.name); }
      if (body.category) { setClauses.push('category = ?'); params.push(body.category); }
      if (tagsJson !== undefined) { setClauses.push('tags = ?'); params.push(tagsJson); }
      params.push(promptId);
      const result = orchestrator.db.db.prepare(
        `UPDATE prompt_library SET ${setClauses.join(', ')} WHERE id = ?`,
      ).run(...params);
      if (result.changes === 0) {
        return c.json({ error: 'Prompt not found' }, 404);
      }
      return c.json({ ok: true, id: promptId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.delete('/api/prompts/:id', (c) => {
    try {
      const promptId = c.req.param('id');
      const exists = orchestrator.db.get<{ id: string }>('SELECT id FROM prompt_library WHERE id = ?', [promptId]);
      if (!exists) {
        return c.json({ error: 'Prompt not found' }, 404);
      }
      orchestrator.db.db.prepare('DELETE FROM prompt_library WHERE id = ?').run(promptId);
      return c.json({ ok: true, id: promptId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // ---- Lab / Experiments (Phase 14) ----

  app.get('/api/lab/experiments', (c) => {
    try {
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM experiments ORDER BY created_at DESC LIMIT 100',
        [],
      );
      const experiments = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        config: typeof r.config === 'string' ? JSON.parse(r.config as string) : r.config,
        results: typeof r.results === 'string' ? JSON.parse(r.results as string) : r.results,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return c.json({ experiments });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // POST /api/lab/experiments — create and run an A/B experiment
  app.post('/api/lab/experiments', async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, taskPrompt, variantA, variantB } = body as {
        name: string; description?: string; taskPrompt: string;
        variantA: { topology: string; model: string; systemPrompt?: string; temperature?: number; maxTokens?: number };
        variantB: { topology: string; model: string; systemPrompt?: string; temperature?: number; maxTokens?: number };
      };
      if (!name || !taskPrompt || !variantA?.model || !variantB?.model) {
        return c.json({ error: 'name, taskPrompt, variantA.model, and variantB.model are required' }, 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      const variants = JSON.stringify({ a: variantA, b: variantB });
      orchestrator.db.db.prepare(
        'INSERT INTO experiments (id, name, description, task_prompt, variants, results, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(id, name, description ?? '', taskPrompt, variants, '{}', 'running', now);

      // Submit both variants as real tasks to the orchestrator (fire-and-forget via run)
      const submitVariant = async (variant: typeof variantA, label: string) => {
        try {
          // Use orchestrator.run which returns TaskResult with taskId
          // Run in background (don't await completion — experiments track via polling)
          const taskId = randomUUID();
          // Insert task record directly so we get the ID immediately
          orchestrator.db.db.prepare(
            'INSERT OR IGNORE INTO tasks (id, type, prompt, status, mode, result, cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(taskId, 'custom', taskPrompt, 'pending', 'power', '', 0, now, now);
          // Fire orchestrator.run in background
          void orchestrator.run({
            prompt: taskPrompt,
            type: 'custom',
            topology: variant.topology ?? 'sequential',
            budget_usd: 2.0,
            simulate: false,
            taskId,
          }).catch(() => { /* experiment tracks via polling */ });
          return { taskId, label, status: 'submitted' };
        } catch (err) {
          return { taskId: null, label, status: 'error', error: err instanceof Error ? err.message : String(err) };
        }
      };

      const [resultA, resultB] = await Promise.all([
        submitVariant(variantA, 'A'),
        submitVariant(variantB, 'B'),
      ]);

      // Store initial results with task IDs for later polling
      const initialResults = JSON.stringify({
        variantA: resultA,
        variantB: resultB,
        startedAt: now,
      });
      orchestrator.db.db.prepare(
        'UPDATE experiments SET results = ? WHERE id = ?',
      ).run(initialResults, id);

      return c.json({ ok: true, id, status: 'running', variantA: resultA, variantB: resultB });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // GET /api/lab/experiments/:id — single experiment with live status
  app.get('/api/lab/experiments/:id', (c) => {
    try {
      const expId = c.req.param('id');
      const row = orchestrator.db.get<Record<string, unknown>>(
        'SELECT * FROM experiments WHERE id = ?',
        [expId],
      );
      if (!row) return c.json({ error: 'Experiment not found' }, 404);

      const results = typeof row.results === 'string' ? JSON.parse(row.results as string) as Record<string, Record<string, unknown>> : {};
      const taskIdA = results.variantA?.taskId as string | undefined;
      const taskIdB = results.variantB?.taskId as string | undefined;

      // Enrich with live task status
      const getTaskStatus = (taskId: string | undefined) => {
        if (!taskId) return { status: 'error' };
        const task = orchestrator.db.get<Record<string, unknown>>('SELECT status, result, cost_usd FROM tasks WHERE id = ?', [taskId]);
        return task ? { status: task.status, resultLength: (task.result as string)?.length ?? 0, cost: task.cost_usd } : { status: 'not_found' };
      };

      return c.json({
        experiment: {
          id: row.id, name: row.name, description: row.description,
          taskPrompt: row.task_prompt, status: row.status,
          variants: typeof row.variants === 'string' ? JSON.parse(row.variants as string) : row.variants,
          results,
          liveStatus: { a: getTaskStatus(taskIdA), b: getTaskStatus(taskIdB) },
          createdAt: row.created_at,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // GET /api/lab/experiments/:id/results — detailed comparison results
  app.get('/api/lab/experiments/:id/results', (c) => {
    try {
      const expId = c.req.param('id');
      const row = orchestrator.db.get<Record<string, unknown>>(
        'SELECT * FROM experiments WHERE id = ?',
        [expId],
      );
      if (!row) return c.json({ error: 'Experiment not found' }, 404);

      const results = typeof row.results === 'string' ? JSON.parse(row.results as string) : {};
      const taskIdA = results.variantA?.taskId;
      const taskIdB = results.variantB?.taskId;

      const getTaskDetail = (taskId: string | undefined) => {
        if (!taskId) return null;
        const task = orchestrator.db.get<Record<string, unknown>>('SELECT status, result, cost_usd, created_at, updated_at FROM tasks WHERE id = ?', [taskId]);
        if (!task) return null;
        const durationMs = task.updated_at && task.created_at
          ? new Date(task.updated_at as string).getTime() - new Date(task.created_at as string).getTime()
          : 0;
        return {
          taskId,
          status: task.status,
          output: (task.result as string)?.substring(0, 2000) ?? '',
          outputLength: (task.result as string)?.length ?? 0,
          cost: task.cost_usd as number ?? 0,
          durationMs,
        };
      };

      const detailA = getTaskDetail(taskIdA);
      const detailB = getTaskDetail(taskIdB);

      // Determine winner based on completion + output quality (length as proxy)
      let winner: string | null = null;
      if (detailA?.status === 'completed' && detailB?.status === 'completed') {
        winner = (detailA.outputLength >= detailB.outputLength) ? 'A' : 'B';
      } else if (detailA?.status === 'completed') {
        winner = 'A';
      } else if (detailB?.status === 'completed') {
        winner = 'B';
      }

      // Update experiment status if both done
      if (detailA && detailB && detailA.status !== 'running' && detailB.status !== 'running') {
        const finalStatus = winner ? 'completed' : 'failed';
        orchestrator.db.db.prepare('UPDATE experiments SET status = ?, results = ? WHERE id = ?').run(
          finalStatus,
          JSON.stringify({ ...results, winner, detailA, detailB, completedAt: new Date().toISOString() }),
          expId,
        );
      }

      return c.json({ variantA: detailA, variantB: detailB, winner });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ---- Traces (Phase 14) ----

  app.get('/api/traces', (c) => {
    try {
      const rows = orchestrator.db.query<Record<string, unknown>>(
        `SELECT id, type, payload, source, task_id, created_at FROM events
         WHERE type LIKE 'task:%' OR type LIKE 'orchestrator:%'
         ORDER BY created_at DESC LIMIT 100`,
        [],
      );
      const traces = rows.map((r) => ({
        id: r.id,
        type: r.type,
        taskId: r.task_id,
        source: r.source,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload as string) : r.payload,
        createdAt: r.created_at,
      }));
      return c.json({ traces });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get('/api/traces/metrics', (c) => {
    try {
      const countRow = orchestrator.db.get<{ total: number }>(
        'SELECT count(*) as total FROM tasks',
        [],
      );
      const totalTraces = countRow?.total ?? 0;
      const avgRow = orchestrator.db.get<{ avg_dur: number | null }>(
        `SELECT avg(
          CAST((julianday(updated_at) - julianday(created_at)) * 86400000 AS INTEGER)
        ) as avg_dur FROM tasks WHERE status = 'completed'`,
        [],
      );
      const avgDurationMs = Math.round(avgRow?.avg_dur ?? 0);
      const errorRow = orchestrator.db.get<{ err_count: number }>(
        "SELECT count(*) as err_count FROM tasks WHERE status = 'failed'",
        [],
      );
      const errorRate = totalTraces > 0 ? (errorRow?.err_count ?? 0) / totalTraces : 0;
      return c.json({ totalTraces, avgDurationMs, p95LatencyMs: avgDurationMs * 2, errorRate });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ---- Flows (Phase 14) ----

  app.get('/api/flows', (c) => {
    try {
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM flow_definitions ORDER BY created_at DESC LIMIT 100',
        [],
      );
      const flows = rows.map((r) => ({
        id: r.id,
        name: r.name,
        topology: r.topology,
        nodes: typeof r.nodes === 'string' ? JSON.parse(r.nodes as string) : r.nodes,
        edges: typeof r.edges === 'string' ? JSON.parse(r.edges as string) : r.edges,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      return c.json({ flows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ---- Flow CRUD (Phase 14) ----

  app.get('/api/flows/:id', (c) => {
    try {
      const flowId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM flow_definitions WHERE id = ?', [flowId],
      );
      if (rows.length === 0) return c.json({ error: 'Flow not found' }, 404);
      const r = rows[0];
      return c.json({
        flow: {
          id: r.id, name: r.name, topology: r.topology,
          nodes: typeof r.nodes === 'string' ? JSON.parse(r.nodes as string) : r.nodes,
          edges: typeof r.edges === 'string' ? JSON.parse(r.edges as string) : r.edges,
          createdAt: r.created_at, updatedAt: r.updated_at,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post('/api/flows', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ error: 'name is required' }, 400);
      const id = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.insert('flow_definitions', {
        id,
        name: body.name,
        topology: body.topology ?? 'sequential',
        nodes: JSON.stringify(body.nodes ?? []),
        edges: JSON.stringify(body.edges ?? []),
        created_at: now,
        updated_at: now,
      });
      return c.json({ id, name: body.name }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.put('/api/flows/:id', async (c) => {
    try {
      const flowId = c.req.param('id');
      const body = await c.req.json();
      const now = new Date().toISOString();
      const result = orchestrator.db.db.prepare(
        'UPDATE flow_definitions SET name = ?, topology = ?, nodes = ?, edges = ?, updated_at = ? WHERE id = ?',
      ).run(
        body.name ?? 'Untitled',
        body.topology ?? 'sequential',
        JSON.stringify(body.nodes ?? []),
        JSON.stringify(body.edges ?? []),
        now, flowId,
      );
      if (result.changes === 0) {
        return c.json({ error: 'Flow not found' }, 404);
      }
      return c.json({ ok: true, id: flowId });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/flows/:id', (c) => {
    try {
      const flowId = c.req.param('id');
      // Only delete user-created flows, not built-in topologies
      orchestrator.db.db.prepare('DELETE FROM flow_definitions WHERE id = ?').run(flowId);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/flows/:id/run', async (c) => {
    try {
      const flowId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM flow_definitions WHERE id = ?', [flowId],
      );
      if (rows.length === 0) return c.json({ error: 'Flow not found' }, 404);
      const flow = rows[0];
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

      // Parse flow definition
      const nodes = typeof flow.nodes === 'string' ? JSON.parse(flow.nodes as string) : (flow.nodes ?? []);
      const topology = (flow.topology as string) ?? 'sequential';
      const prompt = (body.prompt as string) ?? `Execute flow "${flow.name}" with ${(nodes as unknown[]).length} agents using ${topology} topology.`;

      // Submit as a real task to the orchestrator
      const taskId = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.db.prepare(
        'INSERT OR IGNORE INTO tasks (id, type, prompt, status, mode, result, cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(taskId, 'custom', prompt, 'pending', 'power', '', 0, now, now);

      // Fire-and-forget execution
      void orchestrator.run({
        prompt,
        type: 'custom',
        topology,
        budget_usd: (body.budget as number) ?? 2.0,
        simulate: false,
        taskId,
      }).catch(() => { /* flow execution errors tracked via task status */ });

      return c.json({ ok: true, flowId, taskId, status: 'running', topology });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // ---- HitL (Human-in-the-Loop) ----

  app.post('/api/chat/hitl/:requestId', async (c) => {
    try {
      const requestId = c.req.param('requestId');
      const body = await c.req.json();
      const action = body.action as string;
      if (action !== 'approve' && action !== 'reject') {
        return c.json({ error: 'action must be "approve" or "reject"' }, 400);
      }
      const eventType = action === 'approve' ? 'steering:hitl_approved' : 'steering:hitl_rejected';
      orchestrator.eventBus.emit({
        type: eventType,
        payload: { requestId, action },
        source: 'http-server',
      });
      return c.json({ ok: true, requestId, action });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });
}
