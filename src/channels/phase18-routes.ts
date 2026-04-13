// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Dashboard Command Center API Routes
 * LLD Section 5
 *
 * REST endpoints for credential management, provider catalog,
 * embedding configuration, channel management, and workflow deployment.
 * All routes under /api/* require bearer auth (enforced by http-server.ts).
 */

import type { Hono } from 'hono';
import type { CredentialStore } from '../types/phase18.js';
import type { EmbeddingSelector } from '../config/embedding-selector.js';
import type { ChannelManager } from './channel-manager.js';
import type { WorkflowDeployer } from '../deploy/workflow-deployer.js';
import { PROVIDER_CATALOG, getProviderCatalog } from '../config/provider-catalog.js';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import { loadConfigFromDisk, saveConfigToDisk } from './config-routes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_NAME_RE = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;
const ENV_VAR_RE = /^[A-Z][A-Z0-9_]*$/;

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerPhase18Routes(
  app: Hono,
  credentialStore: CredentialStore,
  embeddingSelector: EmbeddingSelector,
  channelManager: ChannelManager,
  workflowDeployer: WorkflowDeployer,
  eventBus: EventBus,
  db: QosDatabase,
): void {
  // =========================================================================
  // CREDENTIAL MANAGEMENT
  // =========================================================================

  // POST /api/credentials — store a credential (encrypt or env-ref)
  app.post('/api/credentials', async (c) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      // Accept both canonical (providerName/storageMode) and alias (provider/type) field names
      const providerName = (body.providerName ?? body.provider) as string;
      const storageMode = (body.storageMode ?? body.type) as string;
      const value = body.value as string;

      if (!providerName || !PROVIDER_NAME_RE.test(providerName)) {
        return c.json({ error: 'Invalid provider name (alphanumeric + hyphens, max 64)' }, 400);
      }
      if (storageMode !== 'direct' && storageMode !== 'env_ref') {
        return c.json({ error: "storageMode must be 'direct' or 'env_ref'" }, 400);
      }
      if (!value || value.length === 0) {
        return c.json({ error: 'value must be non-empty' }, 400);
      }
      if (storageMode === 'direct' && value.length < 8) {
        return c.json({ error: 'API key must be at least 8 characters' }, 400);
      }
      if (storageMode === 'env_ref' && !ENV_VAR_RE.test(value)) {
        return c.json({ error: 'Environment variable name must match /^[A-Z][A-Z0-9_]*$/' }, 400);
      }

      const stored = credentialStore.store({ providerName, storageMode, value });
      eventBus.emit({
        type: 'credential:stored',
        payload: { providerName, storageMode },
        source: 'phase18-routes',
      });

      return c.json({
        ok: true,
        credential: {
          id: stored.id,
          providerName: stored.providerName,
          storageMode: stored.storageMode,
          displayValue: stored.storageMode === 'env_ref' ? stored.encryptedValue : '[encrypted]',
          isSet: true,
          createdAt: stored.createdAt,
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to store credential' }, 500);
    }
  });

  // GET /api/credentials — list all credentials (no secrets)
  app.get('/api/credentials', (c) => {
    const credentials = credentialStore.list();
    return c.json({ credentials });
  });

  // DELETE /api/credentials/:providerName — remove a credential
  app.delete('/api/credentials/:providerName', (c) => {
    const providerName = c.req.param('providerName');
    const removed = credentialStore.remove(providerName);
    if (!removed) {
      return c.json({ error: `Credential for '${providerName}' not found` }, 404);
    }
    eventBus.emit({
      type: 'credential:removed',
      payload: { providerName },
      source: 'phase18-routes',
    });
    return c.json({ ok: true, removed: providerName });
  });

  // =========================================================================
  // PROVIDER CATALOG & HEALTH
  // =========================================================================

  // GET /api/config/providers/catalog — full provider catalog
  app.get('/api/config/providers/catalog', (c) => {
    // Build configured providers map from config
    const configuredMap = new Map<string, { type: string }>();
    const credentials = credentialStore.list();
    for (const cred of credentials) {
      const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === cred.providerName);
      if (catalogEntry) {
        configuredMap.set(cred.providerName, { type: catalogEntry.type });
      }
    }
    const catalog = getProviderCatalog(configuredMap);
    return c.json({ catalog });
  });

  // GET /api/config/providers/:name/health — provider health metrics
  app.get('/api/config/providers/:name/health', (c) => {
    const name = c.req.param('name');
    try {
      const row = db.get<{
        total: number;
        avg_latency: number;
        success_rate: number;
        total_cost: number;
        total_tokens: number;
      }>(
        `SELECT
           COUNT(*) as total,
           AVG(latency_ms) as avg_latency,
           SUM(CASE WHEN status='success' THEN 1 ELSE 0 END)*1.0/MAX(COUNT(*),1) as success_rate,
           COALESCE(SUM(cost_usd), 0) as total_cost,
           COALESCE(SUM(input_tokens + output_tokens), 1) as total_tokens
         FROM model_calls
         WHERE provider = ? AND created_at > datetime('now', '-24 hours')`,
        [name],
      );

      if (!row || row.total === 0) {
        return c.json({
          health: {
            providerName: name,
            status: 'unknown',
            avgLatencyMs: 0,
            successRate: 0,
            totalCalls: 0,
            costPer1kTokens: 0,
            lastCheckedAt: new Date().toISOString(),
          },
        });
      }

      const costPer1k = row.total_tokens > 0 ? (row.total_cost / (row.total_tokens / 1000)) : 0;
      const status = row.success_rate >= 0.95 ? 'healthy' : row.success_rate >= 0.8 ? 'degraded' : 'down';

      return c.json({
        health: {
          providerName: name,
          status,
          avgLatencyMs: Math.round(row.avg_latency ?? 0),
          successRate: Math.round((row.success_rate ?? 0) * 100) / 100,
          totalCalls: row.total,
          costPer1kTokens: Math.round(costPer1k * 10000) / 10000,
          lastCheckedAt: new Date().toISOString(),
        },
      });
    } catch {
      return c.json({
        health: {
          providerName: name,
          status: 'unknown',
          avgLatencyMs: 0,
          successRate: 0,
          totalCalls: 0,
          costPer1kTokens: 0,
          lastCheckedAt: new Date().toISOString(),
        },
      });
    }
  });

  // =========================================================================
  // EMBEDDING CONFIGURATION
  // =========================================================================

  // GET /api/config/embedding — current embedding configuration
  app.get('/api/config/embedding', (c) => {
    const config = embeddingSelector.getCurrentConfig();
    return c.json({ embedding: config });
  });

  // GET /api/config/embedding/providers — providers that support embeddings
  app.get('/api/config/embedding/providers', (c) => {
    const configuredMap = new Map<string, { type: string }>();
    // Include credential-based providers
    const credentials = credentialStore.list();
    for (const cred of credentials) {
      const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === cred.providerName);
      if (catalogEntry) {
        configuredMap.set(cred.providerName, { type: catalogEntry.type });
      }
    }
    // Also include providers from disk config (e.g., Ollama — no credential needed)
    try {
      const diskConfig = loadConfigFromDisk() as Record<string, unknown>;
      const diskProviders = (diskConfig.providers ?? {}) as Record<string, Record<string, unknown>>;
      for (const [name, cfg] of Object.entries(diskProviders)) {
        if (!configuredMap.has(name)) {
          const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === name || p.type === cfg.type);
          if (catalogEntry) {
            configuredMap.set(name, { type: catalogEntry.type });
          }
        }
      }
    } catch { /* disk read failed — continue with credential-based only */ }
    const providers = embeddingSelector.listEmbeddingProviders(configuredMap);
    return c.json({ providers });
  });

  // POST /api/config/embedding/test — test embedding generation
  app.post('/api/config/embedding/test', async (c) => {
    try {
      const body = await c.req.json() as { provider: string; model: string };
      if (!body.provider || !body.model) {
        return c.json({ success: false, error: 'provider and model required' }, 400);
      }
      const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === body.provider);
      const providerType = catalogEntry?.type ?? body.provider;
      const result = await embeddingSelector.testEmbedding(
        body.provider,
        providerType,
        body.model,
        credentialStore,
      );
      eventBus.emit({
        type: result.success ? 'embedding:tested' : 'embedding:test_failed',
        payload: { provider: body.provider, model: body.model, success: result.success },
        source: 'phase18-routes',
      });
      return c.json(result);
    } catch (err) {
      return c.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error', latencyMs: 0 }, 500);
    }
  });

  // PUT /api/config/embedding — save embedding config
  app.put('/api/config/embedding', async (c) => {
    try {
      const body = await c.req.json() as { provider: string; model: string; dimensions: number };
      if (!body.provider || !body.model || !body.dimensions) {
        return c.json({ error: 'provider, model, and dimensions required' }, 400);
      }
      const config = embeddingSelector.saveEmbeddingConfig(body.provider, body.model, body.dimensions);
      // G-05: Persist embedding config to disk
      const diskConfig = loadConfigFromDisk();
      saveConfigToDisk({
        ...diskConfig,
        memory: {
          ...diskConfig.memory,
          embedding: { provider: body.provider, model: body.model, dimensions: body.dimensions },
        },
      });
      eventBus.emit({
        type: 'config:changed',
        payload: { section: 'embedding', provider: body.provider },
        source: 'phase18-routes',
      });
      return c.json({ ok: true, embedding: config });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
    }
  });

  // =========================================================================
  // CHANNEL CONFIGURATION
  // =========================================================================

  // GET /api/config/channels — list all channels
  app.get('/api/config/channels', (c) => {
    const channels = channelManager.list();
    return c.json({ channels });
  });

  // PUT /api/config/channels/:channelId — update channel config
  app.put('/api/config/channels/:channelId', async (c) => {
    try {
      const channelId = c.req.param('channelId');
      const body = await c.req.json() as { enabled: boolean; settings: Record<string, unknown> };

      const channel = channelManager.update(channelId, body.enabled, body.settings ?? {});
      // G-05: Persist channel config to disk
      const diskConfig = loadConfigFromDisk();
      const existingChannels = diskConfig.channels;
      const channelPatch: Record<string, unknown> = {};
      channelPatch[channelId] = body.enabled;
      saveConfigToDisk({
        ...diskConfig,
        channels: { ...existingChannels, ...channelPatch },
      } as typeof diskConfig);
      eventBus.emit({
        type: 'config:changed',
        payload: { section: 'channels', channelId },
        source: 'phase18-routes',
      });
      return c.json({ ok: true, channel });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('Unknown channel') ? 400 : 500;
      return c.json({ error: message }, status);
    }
  });

  // POST /api/config/channels/:channelId/test — test channel connectivity
  app.post('/api/config/channels/:channelId/test', async (c) => {
    try {
      const channelId = c.req.param('channelId');
      const result = await channelManager.testChannel(channelId, credentialStore);
      eventBus.emit({
        type: result.success ? 'channel:tested' : 'channel:test_failed',
        payload: { channelId, success: result.success },
        source: 'phase18-routes',
      });
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: message }, 400);
    }
  });

  // =========================================================================
  // WORKFLOW DEPLOYMENTS
  // =========================================================================

  // GET /api/deployments — list deployments
  app.get('/api/deployments', (c) => {
    const status = c.req.query('status');
    const deployments = workflowDeployer.list(status ?? undefined);
    return c.json({ deployments });
  });

  // POST /api/deployments — create a deployment
  app.post('/api/deployments', async (c) => {
    try {
      const body = await c.req.json() as {
        blueprintId: string;
        triggerType: 'once' | 'cron' | 'event';
        cronExpression?: string;
        triggerEvent?: string;
      };

      if (!body.blueprintId || typeof body.blueprintId !== 'string') {
        return c.json({ error: 'blueprintId is required and must be a string' }, 400);
      }
      const validTriggers = ['once', 'cron', 'event'];
      if (!body.triggerType || !validTriggers.includes(body.triggerType)) {
        return c.json({ error: "triggerType must be one of: 'once', 'cron', 'event'" }, 400);
      }
      if (body.triggerType === 'cron' && !body.cronExpression) {
        return c.json({ error: 'cronExpression is required for cron trigger type' }, 400);
      }

      const deployment = await workflowDeployer.deploy({
        blueprintId: body.blueprintId,
        triggerType: body.triggerType,
        cronExpression: body.cronExpression,
        triggerEvent: body.triggerEvent,
      });

      return c.json({ ok: true, deployment }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('not found') ? 404
        : message.includes('Invalid') || message.includes('required') || message.includes('Maximum') ? 400
        : 500;
      return c.json({ error: message }, status);
    }
  });

  // DELETE /api/deployments/:id — cancel a deployment
  app.delete('/api/deployments/:id', (c) => {
    const id = c.req.param('id');
    const cancelled = workflowDeployer.cancel(id);
    if (!cancelled) {
      return c.json({ error: `Deployment '${id}' not found or already cancelled` }, 404);
    }
    return c.json({ ok: true, cancelled: id });
  });

  // GET /api/deployments/:id/history — deployment run history
  app.get('/api/deployments/:id/history', (c) => {
    const id = c.req.param('id');
    const runs = workflowDeployer.getHistory(id);
    return c.json({ runs });
  });
}
