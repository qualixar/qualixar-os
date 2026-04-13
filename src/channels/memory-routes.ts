// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import type { Orchestrator } from '../engine/orchestrator.js';

export function registerMemoryRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Memory ----

  app.get('/api/memory/stats', (c) => {
    const stats = orchestrator.slmLite.getStats();
    return c.json({ stats });
  });

  app.get('/api/memory/search', async (c) => {
    const query = c.req.query('q') ?? '';
    if (!query.trim()) {
      return c.json({ error: 'Query parameter q is required' }, 400);
    }
    const layer = c.req.query('layer');
    const limit = parseInt(c.req.query('limit') ?? '10', 10);
    const results = await orchestrator.slmLite.search(query, { layer, limit });
    return c.json({ results });
  });

  app.get('/api/memory/entries', (c) => {
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM memory_entries ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    return c.json({ entries: rows });
  });

  app.get('/api/memory/beliefs', (c) => {
    const beliefs = orchestrator.slmLite.getBeliefs();
    return c.json({ beliefs: beliefs ?? [] });
  });
}
