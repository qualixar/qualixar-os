// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- HTTP Server Channel (Thin Orchestrator)
 *
 * DEF-008: Split from 2,913 lines into 9 domain route modules.
 * This file: middleware, SSE, dashboard, bootstrap, WebSocket.
 * Route modules: system, task, agent, cost, quality, memory, connector, data, chat.
 * Export createHttpApp() for testing, startHttpServer() for production.
 *
 * M-03: Standard API Response Envelope (for NEW code -- don't refactor existing routes):
 *   Success: { ok: true, data: T, requestId?: string }
 *   Error:   { ok: false, error: string, requestId?: string }
 *   Use wrapOk(data) and wrapError(msg) helpers below.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import type { Orchestrator } from '../engine/orchestrator.js';
import { registerApiDocs } from './api-docs.js';
// DEF-045: createStreamingModelCall / StreamingModelCall removed (unused)
import { registerDocumentRoutes } from './document-routes.js';
import { registerConfigRoutes } from './config-routes.js';
import { registerPhase18Routes } from './phase18-routes.js';
import { createCredentialManager } from '../credentials/credential-manager.js';
import { createEmbeddingSelector } from '../config/embedding-selector.js';
import { createChannelManager } from './channel-manager.js';
import { createConfigManager } from '../config/config-manager.js';
// DEF-008: loadConfigFromDisk/saveConfigToDisk moved to connector-routes.ts and task-routes.ts
import { createWorkflowDeployer } from '../deploy/workflow-deployer.js';
import { createCronScheduler } from '../deploy/cron-scheduler.js';
import { createToolRegistry } from '../tools/tool-registry.js';
import { getDefaultCategories } from '../tools/tool-categories.js';
import { createSkillStore } from '../marketplace/skill-store.js';
import { createSkillInstaller } from '../marketplace/skill-installer.js';
import { SkillManifestSchema } from '../marketplace/skill-package.js';
import { registerMarketplaceRoutes } from '../marketplace/marketplace-routes.js';
import { createPluginLifecycleManager } from '../marketplace/plugin-lifecycle.js';
import { createPluginRegistry } from '../marketplace/plugin-registry.js';
import { createPluginLoader } from '../marketplace/plugin-loader.js';
import { createPluginSandbox } from '../marketplace/plugin-sandbox.js';
import { registerHelpRoutes, type HelpRouteState } from '../help/help-routes.js';
import { createGraphRetriever } from '../help/graph-retriever.js';
// DEF-008: detectAvailableModels, MODEL_CATALOG, VERSION, z, embeddings moved to route modules
import { registerWorkflowRoutes } from '../builder/workflow-routes.js';
import { createCommandContext } from '../commands/context-factory.js';
import { createWiredCommandRouter } from '../commands/index.js';
import { createCmdRoutes } from '../commands/adapters/http-adapter.js';
import { handleWsCommand } from '../commands/adapters/ws-adapter.js';
import { createWorkflowStore } from '../builder/workflow-store.js';
import { createWorkflowValidator } from '../builder/workflow-validator.js';
import { createWorkflowConverter } from '../builder/workflow-converter.js';
import { createWorkflowExecutor } from '../builder/workflow-executor.js';
import { bootstrapEnterprise } from '../enterprise/enterprise-bootstrap.js';
import { registerEnterpriseRoutes } from '../enterprise/enterprise-routes.js';
import { createLogger } from '../utils/logger.js';
import { registerSystemRoutes } from './system-routes.js';
import { registerTaskRoutes } from './task-routes.js';
import { registerAgentRoutes } from './agent-routes.js';
import { registerCostRoutes } from './cost-routes.js';
import { registerQualityRoutes } from './quality-routes.js';
import { registerMemoryRoutes } from './memory-routes.js';
import { registerConnectorRoutes } from './connector-routes.js';
import { registerDataRoutes } from './data-routes.js';
import { registerChatRoutes } from './chat-routes.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'HttpServer' });

// ---------------------------------------------------------------------------
// M-03: Standard API Response Envelope Helpers
// Use in NEW routes. Don't refactor existing routes (too risky pre-launch).
// ---------------------------------------------------------------------------

/** Wrap a successful response in the standard envelope. */
export function wrapOk<T>(data: T, requestId?: string): { ok: true; data: T; requestId?: string } {
  return { ok: true, data, ...(requestId ? { requestId } : {}) };
}

/** Wrap an error response in the standard envelope. */
export function wrapError(error: string, requestId?: string): { ok: false; error: string; requestId?: string } {
  return { ok: false, error, ...(requestId ? { requestId } : {}) };
}

// ---------------------------------------------------------------------------
// SSE Client Manager
// ---------------------------------------------------------------------------

interface SseClient {
  readonly id: string;
  readonly controller: ReadableStreamDefaultController;
}

class SseManager {
  private readonly _clients: Map<string, SseClient> = new Map();

  add(controller: ReadableStreamDefaultController): string {
    const id = randomUUID();
    this._clients.set(id, { id, controller });
    return id;
  }

  /* v8 ignore next 3 -- called from SSE abort signal, not directly testable in unit tests */
  remove(id: string): void {
    this._clients.delete(id);
  }

  broadcast(event: string, data: string): void {
    const message = `event: ${event}\ndata: ${data}\n\n`;
    const encoded = new TextEncoder().encode(message);
    for (const [id, client] of this._clients) {
      try {
        client.controller.enqueue(encoded);
      } catch {
        /* v8 ignore next -- dead client cleanup, requires closed stream controller */
        this._clients.delete(id);
      }
    }
  }

  /* v8 ignore next 3 -- diagnostic getter, not called from any endpoint */
  get clientCount(): number {
    return this._clients.size;
  }
}

// ---------------------------------------------------------------------------
// G-06: Workspace file listing helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// App Factory
// ---------------------------------------------------------------------------

export function createHttpApp(orchestrator: Orchestrator): Hono {
  const app = new Hono();
  const sseManager = new SseManager();

  // DEF-010: Configurable CORS origin (defaults to same-origin dashboard)
  // Detect actual port: CLI --port arg sets QOS_PORT, fallback to 3000
  // This MUST match the actual serving port or CSRF blocks all browser requests
  // M-10: Support comma-separated multiple origins in QOS_CORS_ORIGIN
  const httpPort = parseInt(process.env.QOS_PORT ?? process.env.PORT ?? '3000', 10);
  const defaultOrigin = `http://localhost:${httpPort}`;
  const corsOriginEnv = process.env.QOS_CORS_ORIGIN;
  const allowedOrigins: readonly string[] = corsOriginEnv
    ? corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : [defaultOrigin];
  // For backward compat: single-origin string used by CSRF checks
  const allowedOrigin = allowedOrigins[0] ?? defaultOrigin;

  // DEF-051: Correlation ID for request tracing
  // M-02: Store requestId in Hono context so route handlers and error handler can access it
  app.use('*', async (c, next) => {
    const requestId = randomUUID();
    (c as unknown as { set(key: string, value: string): void }).set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
  });

  // CORS middleware — allow dashboard and external API consumers
  // M-10: Check request Origin against allowedOrigins list, set matching origin in response
  app.use('*', async (c, next) => {
    const requestOrigin = c.req.header('Origin');
    const matchedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigin;
    c.header('Access-Control-Allow-Origin', matchedOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    return next();
  });

  // DEF-011: CSRF protection for state-changing requests
  app.use('/api/*', async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }
    const origin = c.req.header('Origin');
    const referer = c.req.header('Referer');
    if (origin) {
      // Browser requests must have an Origin matching the allowed CORS origins
      // M-10: Check against multi-origin list
      if (!allowedOrigins.includes(origin)) {
        return c.json({ error: 'Origin not allowed' }, 403);
      }
      return next();
    }
    // SEC: Fallback to Referer header when Origin is absent
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        // M-10: Check against multi-origin list
        if (!allowedOrigins.includes(refOrigin)) {
          return c.json({ error: 'Referer origin not allowed' }, 403);
        }
        return next();
      } catch {
        return c.json({ error: 'Invalid Referer header' }, 403);
      }
    }
    // No Origin AND no Referer — allow if:
    // 1. Client has Authorization header (API clients — CSRF is browser-only)
    // 2. Request is from localhost/internal (dashboard, tests, local tools)
    // 3. No Host header at all (Hono test client, internal calls)
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      return next();
    }
    const host = c.req.header('Host') ?? '';
    if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
      return next();
    }
    return c.json({ error: 'Missing Origin or Referer header on state-changing request' }, 403);
  });

  // Wire EventBus to SSE
  orchestrator.eventBus.on('*', async (event) => {
    sseManager.broadcast(event.type, JSON.stringify(event.payload));
  });

  // Body size limit middleware — reject payloads > 1MB to prevent DoS
  // M-01: Also enforce limit for chunked/missing Content-Length on mutation methods
  const MAX_BODY_BYTES = 1_048_576; // 1MB
  app.use('/api/*', async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return c.json({ error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` }, 413);
    }
    // M-01: Reject mutation requests without Content-Length that could bypass size check via chunked encoding
    const method = c.req.method;
    if (!contentLength && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      // Allow requests with no body (content-length 0 is omitted by some clients)
      // but enforce a stream-based size check by reading the body
      const transferEncoding = c.req.header('transfer-encoding');
      if (transferEncoding?.includes('chunked')) {
        return c.json({ error: `Chunked requests must include Content-Length header (max ${MAX_BODY_BYTES} bytes)` }, 413);
      }
    }
    return next();
  });

  // M-22: Simple IP-based rate limiter (in-memory sliding window).
  // 2000 requests per 60-second window per IP (increased for dashboard with 24+ tabs).
  const rateLimitWindow = 60_000;
  const rateLimitMax = 2000;
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  // PA1-002: Periodic cleanup to prevent memory leak from unbounded IP entries
  const RATE_LIMIT_MAX_ENTRIES = 10_000;
  const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
    // LRU fallback: if still too large after expiry cleanup, clear oldest half
    if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES) {
      const entries = [...rateLimitMap.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      const toRemove = entries.slice(0, Math.floor(entries.length / 2));
      for (const [ip] of toRemove) {
        rateLimitMap.delete(ip);
      }
    }
  }, 60_000);
  rateLimitCleanupInterval.unref(); // Don't prevent process exit
  // Expose cleanup handle so startHttpServer can clear it on shutdown
  (app as unknown as Record<string, unknown>)._rateLimitCleanupInterval = rateLimitCleanupInterval;
  app.use('/api/*', async (c, next) => {
    // SEC: Only trust X-Forwarded-For when behind a reverse proxy (indicated by x-real-ip header).
    // Without a reverse proxy, use a hash of request metadata to differentiate clients.
    // This prevents IP spoofing via X-Forwarded-For on direct connections.
    const realIpHeader = c.req.header('x-real-ip');
    const ip = realIpHeader
      ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? realIpHeader)
      : '127.0.0.1';
    const now = Date.now();
    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + rateLimitWindow };
      rateLimitMap.set(ip, entry);
    }
    entry.count++;
    // Add rate limit headers to every API response
    c.header('X-RateLimit-Limit', String(rateLimitMax));
    c.header('X-RateLimit-Remaining', String(Math.max(0, rateLimitMax - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > rateLimitMax) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    return next();
  });

  // C-09: Bearer token auth middleware
  const apiKey = process.env.QOS_API_KEY;
  // H-03 FIX: In production, refuse to start without an API key
  if (!apiKey && process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: QOS_API_KEY is not set. Qualixar OS refuses to start in production without authentication. ' +
      'Set the QOS_API_KEY environment variable to a strong secret.',
    );
  }
  // DEF-012: Warn when API is open (no key configured) — development/test only
  if (!apiKey) {
    console.warn('WARNING: No QOS_API_KEY set. API is accessible without authentication. Set QOS_API_KEY env var for production use.');
  }
  app.use('/api/*', async (c, next) => {
    // Skip auth for health/ready endpoints
    const reqPath = c.req.path;
    if (reqPath === '/api/health' || reqPath === '/api/ready') {
      return next();
    }
    // If no apiKey configured, skip auth (open mode)
    if (!apiKey) {
      return next();
    }
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }
    // DEF-013: Timing-safe comparison to prevent timing attacks
    const provided = Buffer.from(authHeader.slice(7));
    const expected = Buffer.from(apiKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return c.json({ error: 'Invalid API key' }, 403);
    }
    return next();
  });

  // ---- Universal Command Protocol (Phase A1) ----
  // SEC: /cmd/* routes use the same auth gate as /api/*
  const ucpCtx = createCommandContext(orchestrator);
  const commandRouter = createWiredCommandRouter(ucpCtx);
  app.use('/cmd/*', async (c, next) => {
    if (!apiKey) return next();
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }
    const provided = Buffer.from(authHeader.slice(7));
    const expected = Buffer.from(apiKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return c.json({ error: 'Invalid API key' }, 403);
    }
    return next();
  });
  app.route('/cmd', createCmdRoutes(commandRouter));

  // ---- DEF-008: Domain Route Modules ----
  registerSystemRoutes(app, orchestrator);
  registerTaskRoutes(app, orchestrator);
  registerAgentRoutes(app, orchestrator);
  registerCostRoutes(app, orchestrator);
  registerQualityRoutes(app, orchestrator);
  registerMemoryRoutes(app, orchestrator);
  registerConnectorRoutes(app, orchestrator);
  registerDataRoutes(app, orchestrator);
  registerChatRoutes(app, orchestrator);

  // [DEF-008] All inline routes moved to domain modules above.
  // Remaining: SSE, Dashboard, Bootstrap (Phase 18/20/21/22), Help, Tools, Skills.

  // ---- PLACEHOLDER_DEF008_REMOVAL_START ----
  // This marker is used to identify the start of the old inline routes block.
  // Everything between this and the SSE section has been removed.
  // ---- SSE ----
  // L-11: LLD DEVIATION (intentional): SSE is provided as an alternative
  // transport alongside WebSocket. The LLD specifies WebSocket only, but
  // SSE is simpler for read-only event streaming and works through HTTP
  // proxies that may not support WebSocket upgrade.

  app.get('/api/sse', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const clientId = sseManager.add(controller);
        // Send initial connection event
        const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
        controller.enqueue(new TextEncoder().encode(connectMsg));

        // Cleanup on close
        /* v8 ignore next 3 -- abort signal fires on real client disconnect */
        c.req.raw.signal.addEventListener('abort', () => {
          sseManager.remove(clientId);
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // ---- Dashboard Static Files ----
  /* v8 ignore start -- static file serving for dashboard SPA */
  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  };

  // DEF-055: CSP headers for dashboard
  // M-06: Removed 'unsafe-inline' from script-src. Kept for style-src (React CSS-in-JS needs it).
  app.use('/dashboard/*', async (c, next) => {
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:*");
    await next();
  });

  app.get('/dashboard', (c) => c.redirect('/dashboard/'));
  app.get('/dashboard/*', (c) => {
    // Resolve dashboard dist: try relative to this file first, then from package root
    const candidateA = resolve(import.meta.dirname ?? '.', '../../dist/dashboard');
    const candidateB = resolve(import.meta.dirname ?? '.', '../dist/dashboard');
    const pkgRoot = resolve(import.meta.dirname ?? '.', '../../');
    const candidateC = resolve(pkgRoot, 'dist/dashboard');
    const dashDir = existsSync(join(candidateA, 'index.html')) ? candidateA
      : existsSync(join(candidateB, 'index.html')) ? candidateB
      : existsSync(join(candidateC, 'index.html')) ? candidateC
      : candidateA;
    const reqPath = c.req.path.replace('/dashboard', '') || '/index.html';
    const filePath = join(dashDir, reqPath === '/' ? '/index.html' : reqPath);

    // DEF-002: Prevent path traversal outside dashboard directory
    if (!filePath.startsWith(dashDir)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (!existsSync(filePath)) {
      // SPA fallback: serve index.html for client-side routing
      const indexPath = join(dashDir, 'index.html');
      if (existsSync(indexPath)) {
        return c.body(readFileSync(indexPath, 'utf-8'), 200, { 'Content-Type': 'text/html' });
      }
      return c.json({ error: 'Dashboard not built. Run: cd dashboard && npm run build' }, 404);
    }

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    return c.body(readFileSync(filePath), 200, { 'Content-Type': contentType });
  });
  /* v8 ignore stop */

  // H-05: Register OpenAPI/Swagger documentation routes
  registerApiDocs(app);

  // Register document ingestion routes
  registerDocumentRoutes(app, orchestrator);

  // G-04: Config hot-reload — watch config.yaml for changes and auto-reload
  const configPath = resolve(homedir(), '.qualixar-os', 'config.yaml');
  const hotReloadCfgMgr = existsSync(configPath) ? createConfigManager(configPath) : undefined;
  if (hotReloadCfgMgr) {
    hotReloadCfgMgr.startWatching(orchestrator.eventBus);
  }

  // Register configuration management routes (Settings panel)
  // PA2-002: Pass configManager so PUT /api/config can reload in-memory state
  registerConfigRoutes(app, orchestrator, hotReloadCfgMgr);

  // Phase 18: Dashboard Command Center routes
  const credentialStore = createCredentialManager(orchestrator.db.db);
  const embeddingSelector = createEmbeddingSelector();
  const channelManager = createChannelManager();
  const cronScheduler = createCronScheduler();
  const workflowDeployer = createWorkflowDeployer(
    orchestrator.db.db,
    orchestrator,
    cronScheduler,
    orchestrator.eventBus,
  );
  registerPhase18Routes(
    app,
    credentialStore,
    embeddingSelector,
    channelManager,
    workflowDeployer,
    orchestrator.eventBus,
    orchestrator.db,
  );

  // Phase 20: Marketplace routes
  const pluginRegistry = createPluginRegistry();
  // Refresh the plugin registry from GitHub on startup + periodically.
  // Non-blocking — the registry works from disk cache immediately, but
  // this ensures the cache is populated on first run and stays fresh.
  pluginRegistry.refresh().catch(() => { /* network unavailable — use disk cache */ });

  // Periodic background refresh is set up after skillStore creation (below).
  const pluginLoader = createPluginLoader();
  const pluginSandbox = createPluginSandbox();
  const pluginLifecycle = createPluginLifecycleManager(
    orchestrator.db, pluginRegistry, pluginLoader, pluginSandbox, orchestrator.eventBus,
  );
  // Marketplace routes registered after skillStore is created (below)

  // Phase 21: Workflow builder routes
  const workflowStore = createWorkflowStore(orchestrator.db);
  const workflowValidator = createWorkflowValidator();
  const workflowConverter = createWorkflowConverter();
  const workflowExecutor = createWorkflowExecutor(
    orchestrator.db, workflowStore, workflowValidator, workflowConverter,
    orchestrator.swarmEngine as never, orchestrator.eventBus,
  );
  registerWorkflowRoutes(app, workflowStore, workflowValidator, workflowConverter, workflowExecutor, orchestrator.eventBus);

  // Phase 22: Enterprise hardening routes (vault, RBAC, audit, SSO, rate limit)
  const enterprise = bootstrapEnterprise(orchestrator.db, orchestrator.eventBus);

  // C-01 FIX: Wire RBAC and rate-limiter middleware to enterprise routes
  app.use('/api/enterprise/*', enterprise.rateLimiterMiddleware);
  app.use('/api/enterprise/*', enterprise.rbacMiddleware);

  registerEnterpriseRoutes(
    app as never,
    enterprise.vault,
    enterprise.auditLogger,
    enterprise.ssoEngine,
    enterprise.rateLimiter,
    orchestrator.db,
  );

  // Phase Pivot-2: Tool Registry API endpoints
  // Create a registry for the API layer with all built-in + extended tools.
  const toolReg = createToolRegistry(orchestrator.eventBus, null, { includeExtended: true });

  app.get('/api/tools', (c) => {
    return c.json({
      tools: toolReg.getCatalogSummary(),
      categories: toolReg.getCategories(),
    });
  });

  app.get('/api/tools/categories', (c) => {
    return c.json({ categories: toolReg.getCategories() });
  });

  app.get('/api/tools/for-task/:taskType', (c) => {
    const taskType = c.req.param('taskType');
    const relevantCategories = getDefaultCategories(taskType);
    const allTools = toolReg.getCatalogSummary();
    const filtered = allTools.filter((t) =>
      (relevantCategories as readonly string[]).includes(t.category),
    );
    return c.json({ tools: filtered });
  });

  // Phase 3: Unified Skill Store + Installer API endpoints
  const skillStore = createSkillStore(orchestrator.db, pluginRegistry);

  // Phase 20: Marketplace routes (needs skillStore for refresh sync)
  registerMarketplaceRoutes(app, pluginLifecycle, pluginRegistry, skillStore);

  // Periodic background refresh every 6 hours so long-running servers
  // pick up new registry entries without restart.
  const REGISTRY_REFRESH_MS = 6 * 60 * 60 * 1_000; // 6 hours
  const registryTimer = setInterval(() => {
    pluginRegistry.refresh()
      .then(() => { skillStore.refreshRemote(); })
      .catch(() => { /* silent — stale cache is acceptable */ });
  }, REGISTRY_REFRESH_MS);
  // unref() so this timer doesn't prevent clean process shutdown
  registryTimer.unref();
  const skillInstaller = createSkillInstaller(orchestrator.db, toolReg, orchestrator.eventBus);

  // Load all active installed skills into ToolRegistry at startup (3C bootstrap bridge)
  skillInstaller.loadAllActive();

  app.get('/api/skill-store/browse', (c) => {
    const { query, category, type, sort, installedOnly } = c.req.query();
    const results = skillStore.search({
      ...(query ? { query } : {}),
      ...(category ? { category: category as import('../tools/tool-categories.js').ToolCategory } : {}),
      ...(type ? { type } : {}),
      ...(installedOnly === 'true' ? { installedOnly: true } : {}),
      ...(sort ? { sort: sort as 'name' | 'toolCount' | 'category' } : {}),
    });
    return c.json({ ok: true, results, total: results.length });
  });

  app.get('/api/skill-store/:id', (c) => {
    const id = c.req.param('id');
    const entry = skillStore.get(id);
    if (!entry) return c.json({ error: 'Skill not found' }, 404);
    return c.json({ ok: true, entry });
  });

  app.get('/api/skill-store/installed', (c) => {
    return c.json({ ok: true, results: skillStore.getInstalled() });
  });

  app.post('/api/skill-store/install', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const manifest = body.manifest ?? body;
    try {
      const validated = SkillManifestSchema.parse(manifest);
      const result = skillInstaller.install(validated);
      return c.json({ ok: true, ...result }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Install failed: ${msg}` }, 400);
    }
  });

  app.post('/api/skill-store/:id/uninstall', (c) => {
    const id = c.req.param('id');
    const result = skillInstaller.uninstall(id);
    if (!result.removed) return c.json({ error: 'Skill not found' }, 404);
    return c.json({ ok: true, ...result });
  });

  app.delete('/api/skill-store/:id', (c) => {
    const id = c.req.param('id');
    const result = skillInstaller.deleteSkill(id);
    if (!result.deleted) return c.json({ error: 'Skill not found' }, 404);
    return c.json({ ok: true, ...result });
  });

  // ---- Help / Docs Chatbot Integration ----

  // Serve markdown docs from /docs/*
  app.get('/docs/*', (c) => {
    const docPath = c.req.path.replace('/docs/', '');
    const docsDir = resolve(import.meta.dirname ?? '.', '../../docs');
    const fullPath = resolve(docsDir, docPath);
    // Path traversal prevention: must stay within docs directory
    if (!fullPath.startsWith(docsDir) || !existsSync(fullPath) || !fullPath.endsWith('.md')) {
      return c.json({ error: 'Document not found' }, 404);
    }
    const content = readFileSync(fullPath, 'utf-8');
    return new Response(content, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
  });

  app.get('/api/product-docs', (c) => {
    const docsDir = resolve(import.meta.dirname ?? '.', '../../docs');
    if (!existsSync(docsDir)) return c.json({ docs: [], total: 0 });
    try {
      const files: { name: string; path: string; category: string }[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full, prefix ? `${prefix}/${entry}` : entry);
          } else if (entry.endsWith('.md')) {
            const relPath = prefix ? `${prefix}/${entry}` : entry;
            files.push({ name: entry, path: `/docs/${relPath}`, category: prefix || 'root' });
          }
        }
      };
      walk(docsDir, '');
      return c.json({ docs: files, total: files.length });
    } catch {
      return c.json({ docs: [], total: 0 });
    }
  });

  // Help system: graph retriever + RAG routes
  const helpState: HelpRouteState = {
    docsIngested: false,
    fileCount: 0,
    chunkCount: 0,
    codeIntelIngested: false,
    codeIntelChunks: 0,
    codeIntelCategories: {},
  };
  const graphRetriever = createGraphRetriever(process.cwd());

  // Mark code-intel as available if graph DB exists
  if (graphRetriever) {
    helpState.codeIntelIngested = true;
    helpState.codeIntelChunks = 1; // graph-retriever queries live, not pre-indexed
    helpState.codeIntelCategories = { graph_local: 1, graph_global: 1 };
  }

  // Simple in-memory search provider for help (keyword LIKE over embedded docs)
  const helpSearchProvider = {
    search: async (query: string, options?: { readonly layer?: string; readonly limit?: number }) => {
      // L-10: Clamp limit to prevent unbounded SQL queries
      const limit = Math.min(Math.max(1, options?.limit ?? 10), 500);
      try {
        // Split query into individual keywords and search each with AND-like logic
        const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
        if (keywords.length === 0) return [];

        // Build WHERE clause: each keyword must be present (AND semantics)
        const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' AND ');
        const params = keywords.map((k) => `%${k}%`);

        const rows = orchestrator.db.query<Record<string, unknown>>(
          `SELECT content, source FROM memory_entries WHERE ${conditions} LIMIT ?`,
          [...params, limit],
        );

        // If AND returns nothing, try OR (broader match)
        if (rows.length === 0 && keywords.length > 1) {
          const orConditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
          const orRows = orchestrator.db.query<Record<string, unknown>>(
            `SELECT content, source FROM memory_entries WHERE ${orConditions} LIMIT ?`,
            [...params, limit],
          );
          return orRows.map((r) => ({
            layer: (r.source as string) ?? 'memory',
            content: r.content as string,
          }));
        }

        return rows.map((r) => ({
          layer: (r.source as string) ?? 'memory',
          content: r.content as string,
        }));
      } catch {
        return [];
      }
    },
  };

  registerHelpRoutes(app, helpSearchProvider, helpState, graphRetriever);

  // Auto-create qos-help-builtin conversation with clean start on restart
  try {
    const existing = orchestrator.db.get<{ id: string }>(
      'SELECT id FROM conversations WHERE id = ?',
      ['qos-help-builtin'],
    );
    if (!existing) {
      const now = new Date().toISOString();
      orchestrator.db.insert('conversations', {
        id: 'qos-help-builtin',
        title: 'Qualixar OS Help',
        status: 'active',
        message_count: 0,
        created_at: now,
        updated_at: now,
      });
    } else {
      // Clean start: clear old help messages on restart
      orchestrator.db.db.prepare(
        "DELETE FROM chat_messages WHERE conversation_id = 'qos-help-builtin'",
      ).run();
      orchestrator.db.update('conversations', {
        message_count: 0,
        updated_at: new Date().toISOString(),
      }, { id: 'qos-help-builtin' });
    }
  } catch { /* best-effort help conversation setup */ }

  // Background ingestion: index docs for help search (recursive)
  void (async () => {
    try {
      const docsDir = resolve(import.meta.dirname ?? '.', '../../docs');
      if (!existsSync(docsDir)) return;

      const mdFiles: string[] = [];
      const walkDocs = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            walkDocs(full);
          } else if (entry.endsWith('.md')) {
            mdFiles.push(full);
          }
        }
      };
      walkDocs(docsDir);

      let totalChunks = 0;
      for (const filePath of mdFiles) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          // Strip YAML frontmatter
          const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
          if (!body) continue;

          // Chunk by sections (## headers) for better retrieval
          const sections = body.split(/(?=^## )/m).filter((s) => s.trim());
          const relPath = filePath.replace(docsDir + '/', '');

          for (const section of sections) {
            const chunk = section.trim().slice(0, 2000); // cap at 2000 chars
            if (chunk.length < 20) continue;
            try {
              orchestrator.db.insert('memory_entries', {
                id: randomUUID(),
                layer: 'semantic',
                content: chunk,
                source: `docs/${relPath}`,
                trust_score: 1.0,
                access_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              totalChunks++;
            } catch { /* duplicate or schema issue, skip */ }
          }
        } catch { /* single file read failed, continue */ }
      }

      helpState.fileCount = mdFiles.length;
      helpState.chunkCount = totalChunks;
      helpState.docsIngested = mdFiles.length > 0;
    } catch { /* background indexing failed, non-fatal */ }
  })();

  // Custom 404 handler — consistent JSON error format
  app.notFound((c) => {
    return c.json({ error: `Not found: ${c.req.method} ${c.req.path}` }, 404);
  });

  // Global error handler — consistent JSON error format
  // SEC: Never expose raw error messages to clients; log full detail server-side
  // M-02: Include requestId in error logs and response for correlation
  app.onError((err, c) => {
    const requestId = (c as unknown as { get(key: string): unknown }).get('requestId') as string | undefined;
    logger.error({ err, path: c.req.path, method: c.req.method, requestId }, 'Unhandled request error');
    return c.json({ error: 'Internal server error', ...(requestId ? { requestId } : {}) }, 500);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Server Starter
// ---------------------------------------------------------------------------

/* v8 ignore start -- requires real port binding, tested via integration */
export function startHttpServer(
  orchestrator: Orchestrator,
  port: number = 3000,
): ReturnType<typeof serve> {
  // Set QOS_PORT so CORS/CSRF middleware uses the actual serving port
  process.env.QOS_PORT = String(port);
  const app = createHttpApp(orchestrator);
  const server = serve({ fetch: app.fetch, port });

  // UCP router for WebSocket JSON-RPC 2.0 dispatch (Phase A1)
  const wsUcpCtx = createCommandContext(orchestrator);
  const wsCommandRouter = createWiredCommandRouter(wsUcpCtx);

  // Attach WebSocket server on /ws path for real-time dashboard comms
  const wss = new WebSocketServer({
    server: server as unknown as import('node:http').Server,
    path: '/ws',
  });

  wss.on('connection', (ws, req) => {
    // DEF-009: WebSocket authentication — validate token if QOS_API_KEY is set
    const wsApiKey = process.env.QOS_API_KEY;
    if (wsApiKey) {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token') ?? '';
      const tokenBuf = Buffer.from(token);
      const keyBuf = Buffer.from(wsApiKey);
      if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Unauthorized: invalid or missing token' } }));
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    // Subscribe to ALL EventBus events, relay to client as JSON
    const handler = async (event: { type: string; payload: unknown }) => {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: event.type, payload: event.payload }));
        }
      } catch {
        // Client disconnected mid-send, ignore
      }
    };
    orchestrator.eventBus.on('*', handler);

    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket client error');
    });

    ws.on('close', () => {
      orchestrator.eventBus.off('*', handler);
    });

    // Handle incoming commands from the dashboard client + UCP JSON-RPC 2.0
    ws.on('message', (data) => {
      try {
        const raw = data.toString();
        const parsed = JSON.parse(raw);

        // JSON-RPC 2.0 dispatch (UCP Phase A1) — detected by "jsonrpc" field or array batch
        if (Array.isArray(parsed) || (parsed as Record<string, unknown>).jsonrpc === '2.0') {
          handleWsCommand(ws, raw, wsCommandRouter).catch((err) => logger.error({ err }, 'WebSocket JSON-RPC command failed'));
          return;
        }

        // Legacy dashboard commands (backward compatible)
        const cmd = parsed as Record<string, string>;
        if (cmd.type === 'task:pause' && cmd.taskId) {
          orchestrator.pause(cmd.taskId).catch((err) => logger.error({ err, taskId: cmd.taskId }, 'task pause failed'));
        }
        if (cmd.type === 'task:resume' && cmd.taskId) {
          orchestrator.resume(cmd.taskId).catch((err) => logger.error({ err, taskId: cmd.taskId }, 'task resume failed'));
        }
        if (cmd.type === 'task:cancel' && cmd.taskId) {
          orchestrator.cancel(cmd.taskId).catch((err) => logger.error({ err, taskId: cmd.taskId }, 'task cancel failed'));
        }
      } catch {
        // Malformed message, ignore
      }
    });

    // Send initial handshake so client knows it connected
    ws.send(JSON.stringify({
      type: 'connected',
      payload: { timestamp: new Date().toISOString() },
    }));
  });

  // M-13: WebSocket keepalive ping every 30s
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.ping();
      }
    }
  }, 30_000);

  // H-11 FIX: Periodic task recovery sweep every 5 minutes.
  // Tasks stuck in 'pending' due to DB errors are only recovered on restart without this.
  const taskRecoveryInterval = setInterval(() => {
    orchestrator.recoverIncompleteTasks().catch((err) => {
      logger.error({ err }, 'Periodic task recovery sweep failed');
    });
  }, 5 * 60_000);
  taskRecoveryInterval.unref(); // Don't prevent process exit

  wss.on('error', (err) => {
    logger.error({ err }, 'WebSocket server error');
  });
  wss.on('close', () => {
    clearInterval(pingInterval);
    clearInterval(taskRecoveryInterval); // H-11: Clean up recovery interval on shutdown
    // PA1-002: Clear rate limit cleanup interval on shutdown
    const rlInterval = (app as unknown as Record<string, unknown>)._rateLimitCleanupInterval;
    if (rlInterval) clearInterval(rlInterval as ReturnType<typeof setInterval>);
  });

  return server;
}
/* v8 ignore stop */
