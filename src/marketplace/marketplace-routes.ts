// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Marketplace API Routes
 *
 * Hono route registrations for the plugin marketplace.
 * LLD Section 5 endpoints: browse, installed, detail, install, uninstall,
 * enable, disable, config get/put, refresh.
 *
 * HR-1: All interfaces are readonly + immutable.
 * All responses use { ok: true, ... } pattern.
 * All POST/PUT endpoints validate input before processing.
 */

import { Hono } from 'hono';
import type { PluginLifecycleManager, PluginRegistry, RegistrySearchOptions, PluginType } from '../types/phase20.js';
import type { SkillStore } from './skill-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InstallBody = {
  readonly pluginId?: unknown;
  readonly source?: unknown;
};

type ConfigBody = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okJson(data: Readonly<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorJson(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidPluginType(value: unknown): value is PluginType {
  return value === 'agent' || value === 'skill' || value === 'tool' || value === 'topology';
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerMarketplaceRoutes(
  app: Hono,
  lifecycle: PluginLifecycleManager,
  registry: PluginRegistry,
  skillStore?: SkillStore,
): void {
  // GET /api/marketplace/browse
  app.get('/api/marketplace/browse', (c) => {
    const { query, type, verified, sort } = c.req.query();

    const options: RegistrySearchOptions = {
      ...(query ? { query } : {}),
      ...(type && isValidPluginType(type) ? { type } : {}),
      ...(verified !== undefined ? { verifiedOnly: verified === 'true' } : {}),
      ...(sort ? { sortBy: sort as RegistrySearchOptions['sortBy'] } : {}),
    };

    const results = registry.search(options);
    return c.json({ ok: true, results, total: results.length });
  });

  // GET /api/marketplace/installed
  app.get('/api/marketplace/installed', (c) => {
    const installed = lifecycle.list();
    return c.json({ ok: true, installed, plugins: installed });
  });

  // GET /api/marketplace/:pluginId/config  — must be before /:pluginId detail route
  app.get('/api/marketplace/:pluginId/config', (c) => {
    const { pluginId } = c.req.param();

    const plugin = lifecycle.get(pluginId);
    if (!plugin) {
      return c.json({ error: `Plugin not found: ${pluginId}` }, 404);
    }

    return c.json({
      ok: true,
      schema: plugin.manifest.config,
      values: plugin.config,
    });
  });

  // GET /api/marketplace/:pluginId
  app.get('/api/marketplace/:pluginId', (c) => {
    const { pluginId } = c.req.param();

    const entry = registry.get(pluginId);
    if (!entry) {
      return c.json({ error: `Plugin not found in registry: ${pluginId}` }, 404);
    }

    const installed = lifecycle.get(pluginId) ?? null;
    return c.json({ ok: true, entry, installed });
  });

  // POST /api/marketplace/install
  app.post('/api/marketplace/install', async (c) => {
    let body: InstallBody;
    try {
      body = (await c.req.json()) as InstallBody;
    } catch {
      return c.json({ error: 'Request body must be valid JSON.' }, 400);
    }

    const { pluginId, source } = body;

    if (typeof pluginId !== 'string' || pluginId.trim() === '') {
      return c.json({ error: 'pluginId is required and must be a non-empty string.' }, 400);
    }

    if (source !== undefined && source !== 'registry' && typeof source !== 'string') {
      return c.json({ error: 'source must be a string when provided.' }, 400);
    }

    try {
      // Strip 'remote:' prefix — the dashboard uses 'remote:xxx' IDs but the
      // plugin registry stores entries by their raw id (e.g., 'bug-triage-team').
      const rawId = pluginId.trim().replace(/^remote:/, '');
      const installed = await lifecycle.install(rawId);
      return c.json({ ok: true, installed }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errStatus = /not found|not exist|unknown plugin/i.test(message) ? 404 : 500;
      return c.json({ error: `Install failed: ${message}` }, errStatus);
    }
  });

  // DELETE /api/marketplace/:pluginId
  app.delete('/api/marketplace/:pluginId', async (c) => {
    const { pluginId } = c.req.param();

    if (!lifecycle.isInstalled(pluginId)) {
      return c.json({ error: `Plugin is not installed: ${pluginId}` }, 404);
    }

    try {
      await lifecycle.uninstall(pluginId);
      return c.json({ ok: true, pluginId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Uninstall failed: ${message}` }, 500);
    }
  });

  // PATCH /api/marketplace/:pluginId/enable
  app.patch('/api/marketplace/:pluginId/enable', async (c) => {
    const { pluginId } = c.req.param();

    if (!lifecycle.isInstalled(pluginId)) {
      return c.json({ error: `Plugin is not installed: ${pluginId}` }, 404);
    }

    try {
      await lifecycle.enable(pluginId);
      return c.json({ ok: true, pluginId, enabled: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Enable failed: ${message}` }, 500);
    }
  });

  // PATCH /api/marketplace/:pluginId/disable
  app.patch('/api/marketplace/:pluginId/disable', async (c) => {
    const { pluginId } = c.req.param();

    if (!lifecycle.isInstalled(pluginId)) {
      return c.json({ error: `Plugin is not installed: ${pluginId}` }, 404);
    }

    try {
      await lifecycle.disable(pluginId);
      return c.json({ ok: true, pluginId, enabled: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Disable failed: ${message}` }, 500);
    }
  });

  // PUT /api/marketplace/:pluginId/config
  app.put('/api/marketplace/:pluginId/config', async (c) => {
    const { pluginId } = c.req.param();

    if (!lifecycle.isInstalled(pluginId)) {
      return c.json({ error: `Plugin is not installed: ${pluginId}` }, 404);
    }

    let config: ConfigBody;
    try {
      config = (await c.req.json()) as ConfigBody;
    } catch {
      return c.json({ error: 'Request body must be valid JSON.' }, 400);
    }

    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return c.json({ error: 'Config must be a JSON object.' }, 400);
    }

    try {
      await lifecycle.configure(pluginId, config);
      const updated = lifecycle.get(pluginId);
      return c.json({ ok: true, pluginId, config: updated?.config ?? {} });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Config update failed: ${message}` }, 500);
    }
  });

  // POST /api/marketplace/refresh
  app.post('/api/marketplace/refresh', async (c) => {
    try {
      await registry.refresh();
      // Re-merge remote entries into the skill store so /api/skill-store/browse
      // reflects new registry entries without a server restart.
      skillStore?.refreshRemote();
      const index = registry.getIndex();
      return c.json({ ok: true, updatedAt: index.updatedAt, count: index.plugins.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Registry refresh failed: ${message}` }, 500);
    }
  });
}
