// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import type { Orchestrator } from '../engine/orchestrator.js';

export function registerAgentRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Agents ----

  app.get('/api/agents', (c) => {
    // Try in-memory first; if empty, fall back to DB (agents persist across restarts)
    const inMemory = orchestrator.agentRegistry.listAgents();
    if (inMemory.length > 0) {
      return c.json({ agents: inMemory, total: inMemory.length });
    }
    const dbAgents = orchestrator.db.query<Record<string, unknown>>(
      'SELECT id, role, model, status, cost_usd, task_id FROM agents ORDER BY created_at DESC LIMIT 100',
      [],
    );
    return c.json({ agents: dbAgents, total: dbAgents.length });
  });

  app.get('/api/agents/:id', (c) => {
    try {
      const agentId = c.req.param('id');
      // Try in-memory first
      try {
        const agent = orchestrator.agentRegistry.getAgent(agentId);
        return c.json({ agent });
      } catch {
        // Fall back to DB
        const rows = orchestrator.db.query<Record<string, unknown>>(
          'SELECT * FROM agents WHERE id = ?',
          [agentId],
        );
        if (rows.length === 0) {
          return c.json({ error: 'Agent not found' }, 404);
        }
        return c.json({ agent: rows[0] });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 404);
    }
  });

  // ---- Agent Detail (for lifecycle drill-down) ----

  app.get('/api/agents/:id/detail', (c) => {
    try {
      const agentId = c.req.param('id');
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM agents WHERE id = ?',
        [agentId],
      );
      if (rows.length === 0) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      const agent = rows[0];
      // Get model calls for this agent
      const calls = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM model_calls WHERE agent_id = ?',
        [agentId],
      );
      // Get events for this agent (escape LIKE wildcards to prevent pattern injection)
      const escapedId = agentId.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const events = orchestrator.db.query<Record<string, unknown>>(
        "SELECT * FROM events WHERE payload LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20",
        [`%${escapedId}%`],
      );
      return c.json({ agent, calls, events });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });
}
