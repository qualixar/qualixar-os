// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import { loadConfigFromDisk, saveConfigToDisk } from './config-routes.js';

// H-09 FIX: Zod schema for DB connector creation — validates type to prevent XSS
const ConnectorCreateInput = z.object({
  name: z.string().min(1, 'name is required').max(200),
  type: z.string().min(1, 'type is required').max(100).regex(
    /^[a-zA-Z0-9_-]+$/,
    'type must contain only alphanumeric characters, hyphens, and underscores',
  ),
  url: z.string().url().optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
});

// PA1-HIGH: Zod schema validation for tool connector input
const ToolConnectorInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  transport: z.enum(['stdio', 'streamable-http']).default('stdio'),
  command: z.string().optional(),
  url: z.string().url().optional(),
  args: z.array(z.string()).optional(),
});

export function registerConnectorRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Connectors (Phase 15) ----

  app.get('/api/connectors', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM connectors ORDER BY name LIMIT 200',
      [],
    );
    const connectors = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      url: r.url,
      toolCount: r.tool_count,
      config: r.config ? JSON.parse(r.config as string) : null,
      lastSeen: r.last_seen,
      createdAt: r.created_at,
    }));
    return c.json({ connectors });
  });

  app.post('/api/connectors', async (c) => {
    try {
      const body = await c.req.json();
      // H-09 FIX: Validate connector input with Zod (prevents XSS via type field)
      const parsed = ConnectorCreateInput.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
      }
      const { name, type, url, config } = parsed.data;
      const id = randomUUID();
      const now = new Date().toISOString();
      orchestrator.db.insert('connectors', {
        id,
        name,
        type,
        status: 'disconnected',
        url: url ?? null,
        tool_count: 0,
        config: config ? JSON.stringify(config) : null,
        last_seen: now,
        created_at: now,
      });
      return c.json({
        id,
        name,
        type,
        status: 'disconnected',
        url: url ?? null,
        toolCount: 0,
        config: config ?? null,
        lastSeen: now,
        createdAt: now,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.delete('/api/connectors/:id', (c) => {
    try {
      const connectorId = c.req.param('id');
      const exists = orchestrator.db.query<{ id: string }>('SELECT id FROM connectors WHERE id = ?', [connectorId]);
      if (exists.length === 0) return c.json({ error: 'Connector not found' }, 404);
      orchestrator.db.db.prepare('DELETE FROM connectors WHERE id = ?').run(connectorId);
      return c.json({ ok: true, id: connectorId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // M-10: Connector test — attempt real connection check via MCP consumer
  // if available, fallback to ok:true for connectors without a testable URL.
  app.post('/api/connectors/:id/test', async (c) => {
    try {
      const connectorId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM connectors WHERE id = ?',
        [connectorId],
      );
      if (rows.length === 0) {
        return c.json({ ok: false, error: 'Connector not found' }, 404);
      }
      const connector = rows[0];
      const url = connector.url as string | null;

      // If the connector has a URL, attempt a lightweight health probe
      if (url) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timeout);
          const reachable = resp.ok || resp.status < 500;
          const now = new Date().toISOString();
          orchestrator.db.update('connectors', {
            status: reachable ? 'connected' : 'error',
            last_seen: now,
          }, { id: connectorId });
          return c.json({ ok: reachable, id: connectorId, status: reachable ? 'connected' : 'error', httpStatus: resp.status });
        } catch {
          orchestrator.db.update('connectors', { status: 'error' }, { id: connectorId });
          return c.json({ ok: false, id: connectorId, status: 'error', reason: 'unreachable' });
        }
      }

      // No URL: fallback to ok:true (local connector or stdio transport)
      return c.json({ ok: true, id: connectorId, status: 'connected' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  // GET /api/connectors/:id/tools — list tools exposed by a connector
  app.get('/api/connectors/:id/tools', (c) => {
    try {
      const connectorId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM connectors WHERE id = ?',
        [connectorId],
      );
      if (rows.length === 0) {
        return c.json({ error: 'Connector not found' }, 404);
      }
      const connector = rows[0];
      // Check if we have cached tools in the connector record
      const cachedTools = connector.tools_json as string | null;
      if (cachedTools) {
        try {
          const tools = JSON.parse(cachedTools);
          return c.json({ tools, source: 'cached', connectorId });
        } catch { /* invalid cache, fall through */ }
      }
      // Check if tools are stored in the DB for this connector
      try {
        const toolRows = orchestrator.db.query<Record<string, unknown>>(
          'SELECT * FROM tools WHERE source = ? LIMIT 50',
          [connector.name as string ?? connectorId],
        );
        if (toolRows.length > 0) {
          const tools = toolRows.map((t) => ({
            name: t.name, description: t.description, category: t.category, source: t.source,
          }));
          return c.json({ tools, source: 'db', connectorId });
        }
      } catch { /* tools table may not exist — fallback to empty */ }
      return c.json({ tools: [], source: 'none', connectorId, message: 'No tools discovered. Test the connection first.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // ---- Tool Connectors (G-10: Config-persisted MCP connectors) ----

  app.get('/api/tool-connectors', (c) => {
    const config = loadConfigFromDisk();
    return c.json({ connectors: config.toolConnectors });
  });

  app.post('/api/tool-connectors', async (c) => {
    try {
      const body = await c.req.json();
      const parsed = ToolConnectorInput.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'Invalid input', details: parsed.error.issues }, 400);
      }
      const id = parsed.data.id ?? randomUUID();
      const entry = { ...parsed.data, id } as { [x: string]: unknown; id: string; name: string; transport: 'stdio' | 'streamable-http' };
      const config = loadConfigFromDisk();
      const updated = [...config.toolConnectors, entry];
      saveConfigToDisk({ ...config, toolConnectors: updated });
      return c.json({ ok: true, connector: entry }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/tool-connectors/:id', (c) => {
    try {
      const id = c.req.param('id');
      const config = loadConfigFromDisk();
      const filtered = config.toolConnectors.filter((conn) => conn.id !== id && conn.name !== id);
      saveConfigToDisk({ ...config, toolConnectors: filtered });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/tool-connectors/:id/refresh', async (c) => {
    const id = c.req.param('id');
    // Refresh is a no-op for config-persisted connectors (tools are discovered at startup)
    return c.json({ ok: true, id, refreshed: true });
  });
}
