/**
 * Qualixar OS Phase 7 -- HTTP Server Tests
 *
 * Tests the Hono REST API using app.request() (no actual server needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpApp } from '../../src/channels/http-server.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { TaskResult } from '../../src/types/common.js';
import type { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

const mockResult: TaskResult = {
  taskId: 'http-task-1',
  status: 'completed',
  output: 'HTTP result',
  artifacts: [],
  cost: { total_usd: 0.02, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 9.98 },
  judges: [],
  teamDesign: null,
  duration_ms: 300,
  metadata: {},
};

// Capture the eventBus.on callback for SSE broadcast testing
let capturedEventBusHandler: ((event: any) => Promise<void>) | null = null;

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn().mockResolvedValue(mockResult),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    redirect: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({
      taskId: 'http-task-1',
      phase: 'run',
      progress: 50,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: 0.01,
      startedAt: '2026-03-30T10:00:00Z',
    }),
    recoverIncompleteTasks: vi.fn(),
    modeEngine: {
      currentMode: 'companion',
      getFeatureGates: vi.fn().mockReturnValue({
        topologies: ['pipeline', 'star'],
      }),
      getConfig: vi.fn().mockReturnValue({ mode: 'companion' }),
      switchMode: vi.fn(),
    },
    costTracker: {
      getSummary: vi.fn().mockReturnValue({
        total_usd: 0.02,
        by_model: {},
        by_agent: {},
        by_category: {},
        budget_remaining_usd: 9.98,
      }),
    },
    forge: {
      getDesigns: vi.fn().mockReturnValue([]),
    },
    judgePipeline: {
      getResults: vi.fn().mockReturnValue([]),
      getProfiles: vi.fn().mockReturnValue([]),
    },
    slmLite: {
      search: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockReturnValue({ totalEntries: 0 }),
      getBeliefs: vi.fn().mockReturnValue([]),
    },
    agentRegistry: {
      listAgents: vi.fn().mockReturnValue([]),
      getAgent: vi.fn().mockReturnValue({ id: 'a1', status: 'idle', role: 'coder' }),
    },
    strategyScorer: {
      getStats: vi.fn().mockReturnValue({}),
      getStrategies: vi.fn().mockReturnValue([]),
    },
    eventBus: {
      emit: vi.fn(),
      on: vi.fn().mockImplementation((_type: string, handler: (event: any) => Promise<void>) => {
        capturedEventBusHandler = handler;
      }),
      off: vi.fn(),
    },
    db: {
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      db: { prepare: vi.fn().mockReturnValue({ run: vi.fn(), all: vi.fn().mockReturnValue([]) }) },
    },
  } as unknown as Orchestrator;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(app: Hono, path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

async function post(app: Hono, path: string, body?: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HTTP Server', () => {
  let app: Hono;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = createMockOrchestrator();
    app = createHttpApp(orchestrator);
  });

  // ---- Health ----

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await get(app, '/api/health');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.timestamp).toBeTruthy();
    });
  });

  describe('GET /api/ready', () => {
    it('returns ready true', async () => {
      const res = await get(app, '/api/ready');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ready).toBe(true);
      expect(typeof json.version).toBe('string');
      expect(json.version).toBeTruthy();
    });
  });

  // ---- Tasks ----

  describe('GET /api/tasks', () => {
    it('returns task list', async () => {
      const res = await get(app, '/api/tasks');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tasks).toEqual([]);
    });
  });

  describe('POST /api/tasks', () => {
    it('creates a new task and returns 202 immediately', async () => {
      const res = await post(app, '/api/tasks', { prompt: 'Build something' });
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.taskId).toBeDefined();
      expect(json.status).toBe('pending');
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await post(app, '/api/tasks', {});
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/prompt is required|Invalid input/);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns task status', async () => {
      const res = await get(app, '/api/tasks/http-task-1');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.task.taskId).toBe('http-task-1');
    });

    it('returns 404 for unknown task', async () => {
      (orchestrator.getStatus as any).mockImplementation(() => {
        throw new Error('Unknown task');
      });
      const res = await get(app, '/api/tasks/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/pause', () => {
    it('pauses a task', async () => {
      const res = await post(app, '/api/tasks/t1/pause');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('paused');
    });
  });

  describe('POST /api/tasks/:id/resume', () => {
    it('resumes a task', async () => {
      const res = await post(app, '/api/tasks/t1/resume');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('resumed');
    });
  });

  describe('POST /api/tasks/:id/cancel', () => {
    it('cancels a task', async () => {
      const res = await post(app, '/api/tasks/t1/cancel');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('cancelled');
    });
  });

  describe('POST /api/tasks/:id/redirect', () => {
    it('redirects a task', async () => {
      const res = await post(app, '/api/tasks/t1/redirect', { newPrompt: 'New direction' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('redirected');
    });
  });

  // ---- Agents ----

  describe('GET /api/agents', () => {
    it('returns agent list', async () => {
      const res = await get(app, '/api/agents');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agents).toEqual([]);
    });
  });

  describe('GET /api/agents/:id', () => {
    it('returns agent details', async () => {
      const res = await get(app, '/api/agents/a1');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agent.id).toBe('a1');
    });
  });

  // ---- Cost ----

  describe('GET /api/cost', () => {
    it('returns cost summary', async () => {
      const res = await get(app, '/api/cost');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.cost.total_usd).toBe(0.02);
    });
  });

  describe('GET /api/cost/history', () => {
    it('returns cost entries', async () => {
      const res = await get(app, '/api/cost/history');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entries).toEqual([]);
    });
  });

  // ---- Judges ----

  describe('GET /api/judges/results', () => {
    it('returns judge results', async () => {
      const res = await get(app, '/api/judges/results');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results).toEqual([]);
    });
  });

  describe('GET /api/judges/profiles', () => {
    it('returns judge profiles', async () => {
      const res = await get(app, '/api/judges/profiles');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.profiles).toEqual([]);
    });
  });

  // ---- Forge ----

  describe('GET /api/forge/designs', () => {
    it('returns forge designs', async () => {
      const res = await get(app, '/api/forge/designs');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.designs).toEqual([]);
    });
  });

  describe('GET /api/forge/designs/:taskType', () => {
    it('returns designs filtered by task type', async () => {
      const res = await get(app, '/api/forge/designs/code');
      expect(res.status).toBe(200);
      expect(orchestrator.forge.getDesigns).toHaveBeenCalledWith('code');
    });
  });

  // ---- Memory ----

  describe('GET /api/memory/stats', () => {
    it('returns memory stats', async () => {
      const res = await get(app, '/api/memory/stats');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.stats.totalEntries).toBe(0);
    });
  });

  describe('GET /api/memory/search', () => {
    it('searches memory with query', async () => {
      const res = await get(app, '/api/memory/search?q=test&limit=5');
      expect(res.status).toBe(200);
      expect(orchestrator.slmLite.search).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 5 }));
    });
  });

  describe('GET /api/memory/beliefs', () => {
    it('returns beliefs', async () => {
      const res = await get(app, '/api/memory/beliefs');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.beliefs).toEqual([]);
    });
  });

  // ---- Swarm ----

  describe('GET /api/swarm/topologies', () => {
    it('returns topologies', async () => {
      const res = await get(app, '/api/swarm/topologies');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.topologies).toContain('pipeline');
    });
  });

  // ---- RL ----

  describe('GET /api/rl/stats', () => {
    it('returns RL stats', async () => {
      const res = await get(app, '/api/rl/stats');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/rl/strategies', () => {
    it('returns RL strategies', async () => {
      const res = await get(app, '/api/rl/strategies');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.strategies).toEqual([]);
    });
  });

  // ---- System ----

  describe('GET /api/system/config', () => {
    it('returns system config', async () => {
      const res = await get(app, '/api/system/config');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.config.mode).toBe('companion');
    });
  });

  describe('GET /api/system/events', () => {
    it('returns system events', async () => {
      const res = await get(app, '/api/system/events');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.events).toEqual([]);
    });
  });

  // ---- SSE ----

  describe('GET /api/sse', () => {
    it('returns SSE response with correct headers', async () => {
      const res = await get(app, '/api/sse');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.headers.get('Cache-Control')).toBe('no-cache');
    });
  });

  // ---- Compatibility + A2A ----

  describe('GET /api/compatibility/imported', () => {
    it('returns imported agents', async () => {
      const res = await get(app, '/api/compatibility/imported');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agents).toEqual([]);
    });
  });

  describe('GET /api/a2a/agents', () => {
    it('returns A2A agents', async () => {
      const res = await get(app, '/api/a2a/agents');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.agents).toEqual([]);
    });
  });

  // ---- Error branches ----

  describe('POST /api/tasks/:id/pause error', () => {
    it('returns 400 on pause error', async () => {
      (orchestrator.pause as any).mockRejectedValueOnce(new Error('Pause failed'));
      const res = await post(app, '/api/tasks/t1/pause');
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Pause failed');
    });
  });

  describe('POST /api/tasks/:id/resume error', () => {
    it('returns 400 on resume error', async () => {
      (orchestrator.resume as any).mockRejectedValueOnce(new Error('Resume failed'));
      const res = await post(app, '/api/tasks/t1/resume');
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Resume failed');
    });
  });

  describe('POST /api/tasks/:id/cancel error', () => {
    it('returns 400 on cancel error', async () => {
      (orchestrator.cancel as any).mockRejectedValueOnce(new Error('Cancel failed'));
      const res = await post(app, '/api/tasks/t1/cancel');
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Cancel failed');
    });
  });

  describe('POST /api/tasks/:id/redirect error', () => {
    it('returns 400 on redirect error', async () => {
      (orchestrator.redirect as any).mockRejectedValueOnce(new Error('Redirect failed'));
      const res = await post(app, '/api/tasks/t1/redirect', { newPrompt: 'x' });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Redirect failed');
    });
  });

  describe('GET /api/agents/:id error', () => {
    it('returns 404 on agent not found', async () => {
      (orchestrator.agentRegistry.getAgent as any).mockImplementation(() => {
        throw new Error('Agent not found');
      });
      const res = await get(app, '/api/agents/bad-id');
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Agent not found');
    });
  });

  // ---- New endpoints (dashboard upgrade) ----

  describe('POST /api/system/config', () => {
    it('switches mode and returns updated config', async () => {
      const res = await post(app, '/api/system/config', { mode: 'power' });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(orchestrator.modeEngine.switchMode).toHaveBeenCalledWith('power');
    });

    it('rejects invalid mode values with 400', async () => {
      const res = await post(app, '/api/system/config', { mode: 'invalid' });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("mode must be 'companion' or 'power'");
      expect(orchestrator.modeEngine.switchMode).not.toHaveBeenCalledWith('invalid');
    });
  });

  describe('GET /api/system/models', () => {
    it('returns model catalog', async () => {
      const res = await get(app, '/api/system/models');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.models)).toBe(true);
      expect(json.models.length).toBeGreaterThan(0);
      // Each model should have expected fields
      const first = json.models[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('provider');
      expect(first).toHaveProperty('qualityScore');
      expect(first).toHaveProperty('costPerInputToken');
      expect(first).toHaveProperty('available');
    });
  });

  // ---- SSE stream body coverage ----

  describe('GET /api/sse body', () => {
    it('returns an SSE stream with connected event data', async () => {
      const res = await get(app, '/api/sse');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');

      // Read the first chunk from the stream
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: connected');
      expect(text).toContain('clientId');

      // Cancel to prevent hanging
      await reader.cancel();
    });

    it('broadcasts events to SSE clients via eventBus handler', async () => {
      // The eventBus.on callback was captured during createHttpApp
      expect(capturedEventBusHandler).toBeTruthy();

      // Open an SSE connection to register a client
      const res = await get(app, '/api/sse');
      const reader = res.body!.getReader();

      // Read the initial connected event
      await reader.read();

      // Now trigger the event bus handler which calls sseManager.broadcast
      await capturedEventBusHandler!({ type: 'task:completed', payload: { taskId: 't1' } });

      // Read the broadcast event
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: task:completed');
      expect(text).toContain('t1');

      await reader.cancel();
    });
  });
});
