// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Configuration API Routes
 *
 * REST endpoints for dashboard-driven config management.
 * Providers, models, channels, budget, security, memory, import/export.
 * Security: API key env var NAMES only — never values.
 */

import type { Hono } from 'hono';
import fs from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'yaml';
import { QosConfigSchema, type QosConfig } from '../types/common.js';
import type { Orchestrator } from '../engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = resolve(homedir(), '.qualixar-os', 'config.yaml');

// L-08: Advisory lock to prevent concurrent config writes from conflicting
let configWriteLock = false;

export function loadConfigFromDisk(): QosConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return QosConfigSchema.parse({});
  }
  const raw = yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  return QosConfigSchema.parse(raw ?? {});
}

export function saveConfigToDisk(config: QosConfig): void {
  if (configWriteLock) {
    throw new Error('Config write in progress — concurrent write rejected (409)');
  }
  configWriteLock = true;
  try {
    const dir = resolve(homedir(), '.qualixar-os');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Atomic write: write to temp file first, then rename.
    // renameSync is atomic on the same filesystem, preventing truncated config
    // on disk-full or crash (writeFileSync truncates before writing).
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, yaml.stringify(config), 'utf-8');
    fs.renameSync(tmpPath, CONFIG_PATH);
  } finally {
    configWriteLock = false;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

/** List of well-known env var names to check for provider connectivity. */
const KNOWN_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_AI_API_KEY',
  'AZURE_AI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'GOOGLE_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_PROFILE',
  'OLLAMA_HOST',
  'QOS_API_KEY',
] as const;

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerConfigRoutes(app: Hono, orchestrator: Orchestrator, configManager?: { reload(): void }): void {

  // GET /api/config — full config (already exists as /api/system/config, this is alias)
  app.get('/api/config', (c) => {
    const config = loadConfigFromDisk();
    return c.json({ config });
  });

  // PUT /api/config — merge-update config and persist
  app.put('/api/config', async (c) => {
    try {
      const updates = await c.req.json();
      // Validate budget.max_usd is a positive number if provided
      const budgetUpdate = (updates as Record<string, unknown>).budget as Record<string, unknown> | undefined;
      if (budgetUpdate?.max_usd !== undefined) {
        const maxUsd = budgetUpdate.max_usd;
        if (typeof maxUsd !== 'number' || !isFinite(maxUsd) || maxUsd < 0) {
          return c.json({ error: 'budget.max_usd must be a non-negative number' }, 400);
        }
      }
      const current = loadConfigFromDisk();
      const merged = deepMerge(current as unknown as Record<string, unknown>, updates as Record<string, unknown>);
      const validated = QosConfigSchema.parse(merged);
      saveConfigToDisk(validated);
      // PA2-002: Reload in-memory config so GET /api/config returns fresh data
      try { configManager?.reload(); } catch { /* optional — configManager may not be provided */ }
      // Reload in-memory config if orchestrator exposes configManager
      try { orchestrator.modeEngine.switchMode(validated.mode); } catch { /* optional */ }
      return c.json({ ok: true, config: validated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // L-08: Return 409 when concurrent config write detected
      if (msg.includes('concurrent write rejected')) {
        return c.json({ error: 'Config write in progress — try again' }, 409);
      }
      return c.json({ error: msg }, 400);
    }
  });

  // GET /api/config/providers — list providers with connection status
  app.get('/api/config/providers', (c) => {
    const config = loadConfigFromDisk();
    const providers = Object.entries(config.providers).map(([name, cfg]) => {
      const keyEnv = cfg.api_key_env ?? '';
      const hasKey = keyEnv ? !!process.env[keyEnv] : false;
      const hasEndpoint = cfg.endpoint ? true : false;
      let status: 'connected' | 'disconnected' | 'unknown' = 'unknown';
      if (cfg.type === 'ollama') {
        status = 'connected'; // local, no key needed
      } else if (cfg.type === 'azure-openai') {
        status = (hasKey && (hasEndpoint || !!process.env.AZURE_AI_ENDPOINT)) ? 'connected' : 'disconnected';
      } else {
        status = hasKey ? 'connected' : 'disconnected';
      }
      return { name, type: cfg.type, endpoint: cfg.endpoint ?? null, apiKeyEnv: keyEnv, status };
    });
    return c.json({ providers });
  });

  // POST /api/config/providers/:name/test — test provider connection
  app.post('/api/config/providers/:name/test', async (c) => {
    try {
      const name = c.req.param('name');
      const config = loadConfigFromDisk();
      const provider = config.providers[name];
      if (!provider) {
        return c.json({ ok: false, error: `Provider '${name}' not found` }, 404);
      }
      // Check env var
      const keyEnv = provider.api_key_env ?? '';
      const hasKey = keyEnv ? !!process.env[keyEnv] : provider.type === 'ollama';
      if (!hasKey) {
        return c.json({ ok: false, error: `API key env var '${keyEnv}' not set`, status: 'disconnected' });
      }
      // For providers with endpoints, try a lightweight probe
      const endpoint = provider.endpoint ?? process.env.AZURE_AI_ENDPOINT;
      if (endpoint) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(endpoint, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timeout);
          return c.json({ ok: resp.ok || resp.status < 500, status: 'connected', httpStatus: resp.status });
        } catch {
          return c.json({ ok: false, status: 'error', error: 'Endpoint unreachable' });
        }
      }
      return c.json({ ok: true, status: 'connected' });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // PUT /api/config/providers/:name — add or update a single provider
  app.put('/api/config/providers/:name', async (c) => {
    try {
      const name = c.req.param('name');
      const body = await c.req.json();
      if (!body.type) {
        return c.json({ error: 'type is required' }, 400);
      }
      const config = loadConfigFromDisk();
      const updatedProviders = { ...config.providers, [name]: body };
      const merged = { ...config, providers: updatedProviders };
      const validated = QosConfigSchema.parse(merged);
      saveConfigToDisk(validated);
      return c.json({ ok: true, provider: { name, ...body } });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // DELETE /api/config/providers/:name — remove a provider
  app.delete('/api/config/providers/:name', (c) => {
    try {
      const name = c.req.param('name');
      const config = loadConfigFromDisk();
      const { [name]: _removed, ...rest } = config.providers;
      const merged = { ...config, providers: rest };
      const validated = QosConfigSchema.parse(merged);
      saveConfigToDisk(validated);
      return c.json({ ok: true, removed: name });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/config/import — upload config YAML, parse and apply
  app.post('/api/config/import', async (c) => {
    try {
      const body = await c.req.json();
      const yamlContent = body.yaml as string;
      if (!yamlContent) {
        return c.json({ error: 'yaml field is required' }, 400);
      }
      // SEC: Parse YAML in a try/catch with specific error handling
      let parsed: unknown;
      try {
        parsed = yaml.parse(yamlContent);
      } catch (yamlErr) {
        const msg = yamlErr instanceof Error ? yamlErr.message : 'Invalid YAML';
        return c.json({ error: `YAML parse error: ${msg}` }, 400);
      }
      // SEC: Validate parsed result is a plain object (no prototype pollution)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return c.json({ error: 'YAML must parse to a plain object' }, 400);
      }
      if (Object.getPrototypeOf(parsed) !== Object.prototype && Object.getPrototypeOf(parsed) !== null) {
        return c.json({ error: 'YAML produced a non-plain object' }, 400);
      }
      // Reject __proto__ or constructor keys at top level
      const parsedObj = parsed as Record<string, unknown>;
      if (Object.hasOwn(parsedObj, '__proto__') || Object.hasOwn(parsedObj, 'constructor') || Object.hasOwn(parsedObj, 'prototype')) {
        return c.json({ error: 'YAML contains forbidden keys' }, 400);
      }
      // Merge imported config with current disk config so partial imports work
      const current = loadConfigFromDisk();
      const merged = deepMerge(current as unknown as Record<string, unknown>, parsed as Record<string, unknown>);
      const validated = QosConfigSchema.parse(merged);
      saveConfigToDisk(validated);
      return c.json({ ok: true, config: validated });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // GET /api/config/export — download current config as YAML string
  app.get('/api/config/export', (c) => {
    const config = loadConfigFromDisk();
    const yamlStr = yaml.stringify(config);
    return c.text(yamlStr, 200, {
      'Content-Type': 'text/yaml',
      'Content-Disposition': 'attachment; filename="qos-config.yaml"',
    });
  });

  // GET /api/config/env — list which env vars are set (names only, NOT values)
  app.get('/api/config/env', (c) => {
    const envStatus = KNOWN_ENV_VARS.map((name) => ({
      name,
      set: !!process.env[name],
    }));
    return c.json({ env: envStatus });
  });
}
