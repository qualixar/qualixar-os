// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * System routes extracted from http-server.ts
 *
 * Health, setup, ready, models, A2A discovery, cwd, browse, mkdir,
 * system config, system models, system events.
 */

import type { Hono } from 'hono';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import { loadConfigFromDisk, saveConfigToDisk } from './config-routes.js';
import { MODEL_CATALOG } from '../router/model-call.js';
import { VERSION } from '../version.js';
import { detectAvailableModels } from '../config/model-fallback.js';

const MkdirSchema = z.object({
  path: z.string().min(1),
});

export function registerSystemRoutes(app: Hono, orchestrator: Orchestrator): void {

  app.get('/api/health', (c) => c.json({
    status: 'ok',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/setup/status', async (c) => {
    const fallback = await detectAvailableModels();
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasAzure = Boolean(process.env.AZURE_AI_API_KEY && process.env.AZURE_AI_ENDPOINT);
    const hasGoogle = Boolean(process.env.GOOGLE_API_KEY);
    const isConfigured = hasAnthropic || hasOpenAI || hasAzure || hasGoogle || fallback.available.length > 0;

    // SEC: Only reveal per-provider availability when auth is enabled (QOS_API_KEY set).
    // Without auth, an unauthenticated caller could fingerprint which API keys exist.
    const authEnabled = Boolean(process.env.QOS_API_KEY);
    if (!authEnabled) {
      return c.json({
        configured: isConfigured,
        providers: { redacted: true },
        localModels: [],
        tier: fallback.tier,
      });
    }

    return c.json({
      configured: isConfigured,
      providers: {
        anthropic: hasAnthropic,
        openai: hasOpenAI,
        azure: hasAzure,
        google: hasGoogle,
        local: fallback.available.length > 0,
      },
      localModels: fallback.available,
      tier: fallback.tier,
    });
  });

  app.get('/api/ready', (c) => {
    let dbOk = false;
    try {
      orchestrator.db.get('SELECT 1', []);
      dbOk = true;
    } catch { /* db unavailable */ }
    // H-08 FIX: MODEL_CATALOG is an array, not an object. Use .length directly.
    const modelsOk = Array.isArray(MODEL_CATALOG) && MODEL_CATALOG.length > 0;
    const allOk = dbOk && modelsOk;
    return c.json({
      ready: allOk,
      version: VERSION,
      checks: { database: dbOk, eventBus: true, models: modelsOk },
    });
  });

  // ---- Models (PA2-004) ----

  app.get('/api/models', (c) => {
    const catalogModels = MODEL_CATALOG.map((m) => ({
      name: m.name,
      provider: m.provider,
      qualityScore: m.qualityScore,
      maxTokens: m.maxTokens,
      available: m.available,
    }));
    return c.json({ models: catalogModels, total: catalogModels.length });
  });

  app.get('/api/models/status', (c) => {
    // Enrich with circuit breaker state from the orchestrator's model router
    const catalogModels = MODEL_CATALOG.map((m) => ({
      name: m.name,
      provider: m.provider,
      qualityScore: m.qualityScore,
      maxTokens: m.maxTokens,
      available: m.available,
    }));
    return c.json({ models: catalogModels, total: catalogModels.length, discoveryDone: true });
  });

  // ---- A2A Discovery (H-14) ----

  app.get('/.well-known/agent-card', (c) => {
    return c.json({
      name: 'Qualixar OS',
      protocol: 'a2a/v0.3',
      capabilities: ['orchestration', 'multi-agent', 'quality-judges', 'cost-routing'],
      description: 'Qualixar OS Universal Agent OS',
      url: c.req.url.replace('/.well-known/agent-card', ''),
    });
  });

  app.get('/api/system/cwd', (c) => {
    return c.json({ cwd: process.cwd() });
  });

  // ---- Directory Browser (for working directory picker) ----

  app.get('/api/system/browse', (c) => {
    const dirPath = c.req.query('path') ?? process.cwd();
    try {
      const resolved = resolve(dirPath);
      // DEF-017: Restrict browsing to within user's home directory
      const homeRoot = homedir();
      if (!resolved.startsWith(homeRoot)) {
        return c.json({ error: 'Path outside allowed root' }, 403);
      }
      const entries = readdirSync(resolved, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: join(resolved, e.name),
          type: 'directory' as const,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return c.json({ current: resolved, entries });
    } catch (err) {
      return c.json({ error: `Cannot read directory: ${dirPath}` }, 400);
    }
  });

  app.post('/api/system/mkdir', async (c) => {
    try {
      const body = await c.req.json();
      // DEF-018: Validate mkdir input with Zod
      const mkdirParsed = MkdirSchema.safeParse(body);
      if (!mkdirParsed.success) {
        return c.json({ error: 'Invalid input', details: mkdirParsed.error.issues }, 400);
      }
      const dirPath = mkdirParsed.data.path;
      const resolved = resolve(dirPath);
      // DEF-017: Restrict mkdir to within user's home directory
      const homeRoot = homedir();
      if (!resolved.startsWith(homeRoot)) {
        return c.json({ error: 'Path outside allowed root' }, 403);
      }
      mkdirSync(resolved, { recursive: true });
      return c.json({ ok: true, path: resolved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.get('/api/system/config', (c) => {
    // Merge in-memory config (modeEngine) with disk config (workspace, execution, quality)
    // modeEngine doesn't track workspace/execution/quality — those live on disk only
    const memConfig = orchestrator.modeEngine.getConfig() as Record<string, unknown>;
    try {
      const diskConfig = loadConfigFromDisk() as Record<string, unknown>;
      const merged = { ...memConfig };
      for (const key of ['workspace', 'execution', 'quality']) {
        if (diskConfig[key] !== undefined) {
          merged[key] = diskConfig[key];
        }
      }
      return c.json({ config: merged });
    } catch {
      return c.json({ config: memConfig });
    }
  });

  app.post('/api/system/config', async (c) => {
    try {
      const updates = await c.req.json();
      if (typeof updates !== 'object' || updates === null || Object.keys(updates).length === 0) {
        return c.json({ error: 'Request body must be a non-empty object' }, 400);
      }
      // Validate mode if provided
      if (updates.mode !== undefined) {
        if (updates.mode !== 'companion' && updates.mode !== 'power') {
          return c.json({ error: "mode must be 'companion' or 'power'" }, 400);
        }
        orchestrator.modeEngine.switchMode(updates.mode);
      }
      // Persist ALL config updates to disk (workspace, quality, execution, models, etc.)
      // This ensures dashboard changes survive server restart.
      try {
        const diskConfig = loadConfigFromDisk();
        const merged = { ...diskConfig } as Record<string, unknown>;
        for (const [key, value] of Object.entries(updates)) {
          if (key === 'mode') continue; // mode handled above via modeEngine
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            merged[key] = { ...(merged[key] as Record<string, unknown> ?? {}), ...(value as Record<string, unknown>) };
          } else {
            merged[key] = value;
          }
        }
        saveConfigToDisk(merged as Parameters<typeof saveConfigToDisk>[0]);
      } catch { /* disk persist best-effort — in-memory config still updated */ }
      return c.json({ ok: true, config: orchestrator.modeEngine.getConfig() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.get('/api/system/models', async (c) => {
    // Prefer REAL models from disk config (survives hot-reload without restart)
    // In-memory modeEngine config may be stale after PUT /api/config saves to disk.
    let configModels: unknown[] | undefined;
    try {
      const diskConfig = loadConfigFromDisk() as Record<string, unknown>;
      const diskModels = (diskConfig.models as Record<string, unknown>)?.catalog;
      if (Array.isArray(diskModels) && diskModels.length > 0) {
        configModels = diskModels;
      }
    } catch { /* disk read failed — fall through to in-memory */ }
    if (!configModels) {
      const config = orchestrator.modeEngine.getConfig();
      configModels = (config.models as Record<string, unknown>)?.catalog as unknown[] | undefined;
    }
    if (Array.isArray(configModels) && configModels.length > 0) {
      const models = (configModels as Record<string, unknown>[]).map((m) => ({
        name: (m.name as string) ?? '',
        provider: (m.provider as string) ?? '',
        qualityScore: (m.quality_score as number) ?? 0.8,
        costPerInputToken: (m.cost_per_input_token as number) ?? 0,
        costPerOutputToken: (m.cost_per_output_token as number) ?? 0,
        maxTokens: (m.max_tokens as number) ?? 4096,
        available: true,
      }));
      return c.json({ models });
    }

    // Dynamic detection: Ollama models + cloud provider availability
    const allModels: Array<Record<string, unknown>> = [];
    try {
      const fallback = await detectAvailableModels();
      for (const m of fallback.available) {
        allModels.push({
          name: m.name,
          provider: m.provider,
          qualityScore: 0.7,
          costPerInputToken: 0,
          costPerOutputToken: 0,
          maxTokens: 8192,
          available: true,
        });
      }
    } catch { /* Ollama detection failed, continue */ }

    // Add cloud models with API key checks
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasGoogle = Boolean(process.env.GOOGLE_API_KEY);
    for (const m of MODEL_CATALOG) {
      const available = (m.provider === 'anthropic' && hasAnthropic)
        || (m.provider === 'openai' && hasOpenAI)
        || (m.provider === 'google' && hasGoogle)
        || m.provider === 'ollama';
      // Only include models that are actually available (have API keys or are local)
      if (!available) continue;
      allModels.push({
        name: m.name,
        provider: m.provider,
        qualityScore: m.qualityScore,
        costPerInputToken: m.costPerInputToken,
        costPerOutputToken: m.costPerOutputToken,
        maxTokens: m.maxTokens,
        available: true,
      });
    }
    return c.json({ models: allModels });
  });

  app.get('/api/system/events', (c) => {
    const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') ?? '50', 10) || 50), 500);
    const events = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM events ORDER BY id DESC LIMIT ?',
      [limit],
    );
    return c.json({ events });
  });
}
