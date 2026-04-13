/**
 * Qualixar OS -- Config Routes Tests
 *
 * Tests the /api/config/* endpoints using Hono app.request().
 * Mocks fs at the module level to intercept config file I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { Hono } from 'hono';
import yaml from 'yaml';

// ---------------------------------------------------------------------------
// Mock node:fs BEFORE importing config-routes (hoisted by vitest)
// ---------------------------------------------------------------------------

let storedYaml = '';

// Track pending atomic write (write to .tmp, then renameSync promotes it)
let pendingTmpYaml = '';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((path: string) => {
        if (typeof path === 'string' && path.includes('config.yaml') && !path.endsWith('.tmp')) return storedYaml.length > 0;
        if (typeof path === 'string' && path.includes('.qualixar-os')) return true;
        return actual.existsSync(path);
      }),
      readFileSync: vi.fn((path: string | Buffer, enc?: string) => {
        if (typeof path === 'string' && path.includes('config.yaml') && !path.endsWith('.tmp')) return storedYaml;
        return actual.readFileSync(path, enc as BufferEncoding);
      }),
      writeFileSync: vi.fn((path: string | Buffer, data: string) => {
        if (typeof path === 'string' && path.endsWith('config.yaml.tmp')) { pendingTmpYaml = data; return; }
        if (typeof path === 'string' && path.includes('config.yaml')) { storedYaml = data; return; }
      }),
      renameSync: vi.fn((src: string, dest: string) => {
        if (typeof src === 'string' && src.endsWith('config.yaml.tmp') && typeof dest === 'string' && dest.endsWith('config.yaml')) {
          storedYaml = pendingTmpYaml;
          pendingTmpYaml = '';
          return;
        }
      }),
      mkdirSync: vi.fn(),
      readdirSync: actual.readdirSync,
      statSync: actual.statSync,
    },
    existsSync: vi.fn((path: string) => {
      if (typeof path === 'string' && path.includes('config.yaml') && !path.endsWith('.tmp')) return storedYaml.length > 0;
      if (typeof path === 'string' && path.includes('.qualixar-os')) return true;
      return actual.existsSync(path);
    }),
    readFileSync: vi.fn((path: string | Buffer, enc?: string) => {
      if (typeof path === 'string' && path.includes('config.yaml') && !path.endsWith('.tmp')) return storedYaml;
      return actual.readFileSync(path, enc as BufferEncoding);
    }),
    writeFileSync: vi.fn((path: string | Buffer, data: string) => {
      if (typeof path === 'string' && path.endsWith('config.yaml.tmp')) { pendingTmpYaml = data; return; }
      if (typeof path === 'string' && path.includes('config.yaml')) { storedYaml = data; return; }
    }),
    renameSync: vi.fn((src: string, dest: string) => {
      if (typeof src === 'string' && src.endsWith('config.yaml.tmp') && typeof dest === 'string' && dest.endsWith('config.yaml')) {
        storedYaml = pendingTmpYaml;
        pendingTmpYaml = '';
        return;
      }
    }),
    mkdirSync: vi.fn(),
  };
});

// Import AFTER mocking
const { createHttpApp } = await import('../../src/channels/http-server.js');

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn().mockResolvedValue({}),
    pause: vi.fn(),
    resume: vi.fn(),
    redirect: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn().mockReturnValue({}),
    recoverIncompleteTasks: vi.fn(),
    modeEngine: {
      currentMode: 'companion',
      getFeatureGates: vi.fn().mockReturnValue({ topologies: ['pipeline'] }),
      getConfig: vi.fn().mockReturnValue({ mode: 'companion' }),
      switchMode: vi.fn(),
    },
    costTracker: {
      getSummary: vi.fn().mockReturnValue({ total_usd: 0, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 10 }),
    },
    forge: { getDesigns: vi.fn().mockReturnValue([]) },
    judgePipeline: { getResults: vi.fn().mockReturnValue([]), getProfiles: vi.fn().mockReturnValue([]) },
    slmLite: { search: vi.fn().mockResolvedValue([]), getStats: vi.fn().mockReturnValue({}), getBeliefs: vi.fn().mockReturnValue([]) },
    agentRegistry: { listAgents: vi.fn().mockReturnValue([]), getAgent: vi.fn() },
    strategyScorer: { getStats: vi.fn().mockReturnValue({}), getStrategies: vi.fn().mockReturnValue([]) },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    db: {
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      db: { prepare: vi.fn().mockReturnValue({ run: vi.fn() }) },
    },
    budgetChecker: { check: vi.fn().mockReturnValue({ allowed: true }) },
    modelRouter: { route: vi.fn().mockResolvedValue({ content: 'ok', model: 'test' }) },
  } as unknown as Orchestrator;
}

// ---------------------------------------------------------------------------
// Seed config
// ---------------------------------------------------------------------------

const SEED_CONFIG = {
  mode: 'companion' as const,
  providers: {
    'test-azure': {
      type: 'azure-openai' as const,
      endpoint: 'https://test.openai.azure.com',
      api_key_env: 'TEST_AZURE_KEY',
    },
  },
  models: { primary: 'claude-sonnet-4-6', fallback: 'gpt-4.1-mini' },
  budget: { max_usd: 10, warn_pct: 0.8 },
  security: { container_isolation: false, allowed_paths: ['./'], denied_commands: ['rm -rf'] },
  memory: { enabled: true, auto_invoke: true, max_ram_mb: 50 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(app: Hono, path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}
async function put(app: Hono, path: string, body?: unknown): Promise<Response> {
  return app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
async function post(app: Hono, path: string, body?: unknown): Promise<Response> {
  return app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
async function del(app: Hono, path: string): Promise<Response> {
  return app.request(path, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Config Routes', () => {
  let app: Hono;

  beforeEach(() => {
    // Seed the mock filesystem
    storedYaml = yaml.stringify(SEED_CONFIG);
    const orchestrator = createMockOrchestrator();
    app = createHttpApp(orchestrator);
  });

  // ---- GET /api/config ----

  it('returns current config', async () => {
    const res = await get(app, '/api/config');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config).toBeDefined();
    expect(data.config.mode).toBe('companion');
    expect(data.config.providers['test-azure']).toBeDefined();
  });

  // ---- PUT /api/config ----

  it('merges config updates', async () => {
    const res = await put(app, '/api/config', { budget: { max_usd: 25 } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.config.budget.max_usd).toBe(25);
    // Original providers still present
    expect(data.config.providers['test-azure']).toBeDefined();
  });

  it('returns 400 for invalid mode', async () => {
    const res = await put(app, '/api/config', { mode: 'INVALID' });
    expect(res.status).toBe(400);
  });

  // ---- GET /api/config/providers ----

  it('lists providers with status', async () => {
    const res = await get(app, '/api/config/providers');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.providers.length).toBe(1);
    expect(data.providers[0].name).toBe('test-azure');
    expect(data.providers[0].type).toBe('azure-openai');
    // TEST_AZURE_KEY not in env => disconnected
    expect(data.providers[0].status).toBe('disconnected');
  });

  // ---- POST /api/config/providers/:name/test ----

  it('returns 404 for unknown provider test', async () => {
    const res = await post(app, '/api/config/providers/nonexistent/test');
    expect(res.status).toBe(404);
  });

  it('returns failure when env var not set', async () => {
    const res = await post(app, '/api/config/providers/test-azure/test');
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  // ---- PUT /api/config/providers/:name ----

  it('adds a new provider', async () => {
    const res = await put(app, '/api/config/providers/openai', { type: 'openai', api_key_env: 'OPENAI_API_KEY' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.provider.name).toBe('openai');
  });

  it('requires type field', async () => {
    const res = await put(app, '/api/config/providers/bad', {});
    expect(res.status).toBe(400);
  });

  // ---- DELETE /api/config/providers/:name ----

  it('removes a provider', async () => {
    const res = await del(app, '/api/config/providers/test-azure');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.removed).toBe('test-azure');
  });

  // ---- POST /api/config/import ----

  it('imports YAML config', async () => {
    const yamlStr = 'mode: power\nbudget:\n  max_usd: 50\n';
    const res = await post(app, '/api/config/import', { yaml: yamlStr });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.config.mode).toBe('power');
  });

  it('requires yaml field', async () => {
    const res = await post(app, '/api/config/import', {});
    expect(res.status).toBe(400);
  });

  // ---- GET /api/config/export ----

  it('exports config as YAML', async () => {
    const res = await get(app, '/api/config/export');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('mode:');
    expect(text).toContain('companion');
  });

  // ---- GET /api/config/env ----

  it('returns env var detection status', async () => {
    const res = await get(app, '/api/config/env');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.env)).toBe(true);
    const names = data.env.map((e: { name: string }) => e.name);
    expect(names).toContain('ANTHROPIC_API_KEY');
    expect(names).toContain('AZURE_AI_API_KEY');
    expect(names).toContain('OPENAI_API_KEY');
    // Each entry has name + set
    for (const entry of data.env) {
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.set).toBe('boolean');
    }
  });
});
