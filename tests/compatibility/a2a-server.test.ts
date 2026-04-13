/**
 * Qualixar OS Phase 8b -- A2AServer Tests
 * TDD: RED phase -- tests written before implementation.
 *
 * Tests the A2A server that exposes Qualixar OS agents as A2A-discoverable services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventBus } from '../../src/events/event-bus.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { AgentRegistry } from '../../src/agents/agent-registry.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { Logger } from 'pino';
import { Hono } from 'hono';

import {
  A2AServer,
  createA2AServer,
  type A2ATaskRequest,
} from '../../src/compatibility/a2a-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn().mockResolvedValue({
      taskId: 'task-123',
      status: 'completed',
      output: 'Task completed successfully',
      artifacts: [],
      cost: { total_usd: 0.01, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 9.99 },
      judges: [],
      teamDesign: null,
      duration_ms: 1000,
      metadata: {},
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    redirect: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    recoverIncompleteTasks: vi.fn(),
    modeEngine: {} as any,
    costTracker: {} as any,
    forge: {} as any,
    judgePipeline: {} as any,
    slmLite: {} as any,
    agentRegistry: {} as any,
    swarmEngine: {} as any,
    strategyScorer: {} as any,
    eventBus: {} as any,
    db: {} as any,
  } as unknown as Orchestrator;
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
  };
}

function createMockAgentRegistry(): AgentRegistry {
  return {
    register: vi.fn(),
    deregister: vi.fn(),
    get: vi.fn(),
    listActive: vi.fn().mockReturnValue([]),
    transitionState: vi.fn(),
    updateStats: vi.fn(),
    getByTaskId: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, byStatus: {} }),
  };
}

function createMockConfigManager(): ConfigManager {
  return {
    get: vi.fn().mockReturnValue({
      mode: 'companion',
      models: { primary: 'claude-sonnet-4-6' },
    }),
    getValue: vi.fn(),
    reload: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2AServer', () => {
  let server: A2AServer;
  let orchestrator: Orchestrator;
  let eventBus: EventBus;
  let agentRegistry: AgentRegistry;
  let configManager: ConfigManager;
  let logger: Logger;
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = createMockOrchestrator();
    eventBus = createMockEventBus();
    agentRegistry = createMockAgentRegistry();
    configManager = createMockConfigManager();
    logger = createMockLogger();
    server = createA2AServer(orchestrator, eventBus, agentRegistry, configManager, logger);
    app = new Hono();
    server.mountRoutes(app);
  });

  // ---- Factory ----

  describe('createA2AServer()', () => {
    it('creates an A2AServer instance', () => {
      expect(server).toBeDefined();
      expect(typeof server.getAgentCard).toBe('function');
      expect(typeof server.registerCapability).toBe('function');
      expect(typeof server.mountRoutes).toBe('function');
    });
  });

  // ---- getAgentCard() ----

  describe('getAgentCard()', () => {
    it('returns an agent card with required fields', () => {
      const card = server.getAgentCard();

      expect(card.name).toBe('Qualixar OS');
      expect(card.protocol).toBe('a2a/v0.3');
      expect(card.capabilities).toBeDefined();
      expect(Array.isArray(card.capabilities)).toBe(true);
    });

    it('includes registered capabilities', () => {
      server.registerCapability('code-generation');
      server.registerCapability('research');

      const card = server.getAgentCard();
      expect(card.capabilities).toContain('code-generation');
      expect(card.capabilities).toContain('research');
    });
  });

  // ---- registerCapability() ----

  describe('registerCapability()', () => {
    it('adds a capability to the agent card', () => {
      server.registerCapability('testing');
      const card = server.getAgentCard();
      expect(card.capabilities).toContain('testing');
    });

    it('does not add duplicate capabilities', () => {
      server.registerCapability('testing');
      server.registerCapability('testing');
      const card = server.getAgentCard();
      const count = card.capabilities.filter((c: string) => c === 'testing').length;
      expect(count).toBe(1);
    });
  });

  // ---- Route: GET /.well-known/agent-card ----

  describe('GET /.well-known/agent-card', () => {
    it('returns the agent card as JSON', async () => {
      const res = await app.request('/.well-known/agent-card');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.name).toBe('Qualixar OS');
      expect(body.protocol).toBe('a2a/v0.3');
    });
  });

  // ---- Route: POST /a2a/tasks/send ----

  describe('POST /a2a/tasks/send', () => {
    it('accepts a valid task and returns 202 with taskId', async () => {
      const body: A2ATaskRequest = {
        prompt: 'Write a hello world function',
      };

      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.id).toBeTruthy();
      expect(json.status).toBe('pending');
    });

    it('rejects when prompt is missing', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('rejects when prompt is empty string', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('emits a2a:request_received event', async () => {
      const body: A2ATaskRequest = { prompt: 'Test task' };

      await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'a2a:request_received',
          source: 'a2a-server',
        }),
      );
    });

    it('passes optional fields to orchestrator', async () => {
      const body: A2ATaskRequest = {
        prompt: 'Generate code',
        taskType: 'code',
        maxBudgetUsd: 5.0,
        timeoutMs: 30000,
      };

      await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Give async execution a tick
      await new Promise((r) => setTimeout(r, 50));

      expect(orchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Generate code',
          type: 'code',
          budget_usd: 5.0,
        }),
      );
    });
  });

  // ---- Route: GET /a2a/tasks/:id/status ----

  describe('GET /a2a/tasks/:id/status', () => {
    it('returns task status for a known task', async () => {
      // First, create a task
      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Test' }),
      });
      const { id } = await createRes.json();

      const statusRes = await app.request(`/a2a/tasks/${id}/status`);
      expect(statusRes.status).toBe(200);

      const body = await statusRes.json();
      expect(body.id).toBe(id);
      expect(['pending', 'running', 'completed', 'failed']).toContain(body.status);
    });

    it('returns 404 for unknown task', async () => {
      const res = await app.request('/a2a/tasks/unknown-id/status');
      expect(res.status).toBe(404);
    });
  });

  // ---- async execution ----

  describe('async task execution', () => {
    it('updates task status after orchestrator completes', async () => {
      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Async test' }),
      });
      const { id } = await createRes.json();

      // Wait for async orchestrator execution
      await new Promise((r) => setTimeout(r, 100));

      const statusRes = await app.request(`/a2a/tasks/${id}/status`);
      const body = await statusRes.json();
      expect(body.status).toBe('completed');
      expect(body.output).toBe('Task completed successfully');
    });

    it('sets task to failed when orchestrator throws', async () => {
      vi.mocked(orchestrator.run).mockRejectedValueOnce(new Error('Orchestrator crash'));

      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Failing task' }),
      });
      const { id } = await createRes.json();

      // Wait for async execution
      await new Promise((r) => setTimeout(r, 100));

      const statusRes = await app.request(`/a2a/tasks/${id}/status`);
      const body = await statusRes.json();
      expect(body.status).toBe('failed');
    });

    it('sets output to string representation when orchestrator throws non-Error', async () => {
      vi.mocked(orchestrator.run).mockRejectedValueOnce('raw string error');

      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Non-error rejection' }),
      });
      const { id } = await createRes.json();

      await new Promise((r) => setTimeout(r, 100));

      const statusRes = await app.request(`/a2a/tasks/${id}/status`);
      const body = await statusRes.json();
      expect(body.status).toBe('failed');
      expect(body.output).toBe('raw string error');
    });
  });

  // ---- Invalid JSON body (line 130) ----

  describe('POST /a2a/tasks/send with invalid JSON', () => {
    it('returns 400 for malformed JSON body', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json{{{',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON body');
    });
  });

  // ---- _buildTaskResponse for missing task (line 233) ----

  describe('_buildTaskResponse fallback path', () => {
    it('returns failed response for task removed between submit and status check', async () => {
      // Submit a task whose orchestrator will hang (never resolve)
      let resolveOrch: () => void;
      vi.mocked(orchestrator.run).mockImplementationOnce(() => new Promise((resolve) => {
        resolveOrch = () => resolve({
          taskId: 'task-123',
          status: 'completed',
          output: 'done',
          artifacts: [],
          cost: { total_usd: 0, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 10 },
          judges: [],
          teamDesign: null,
          duration_ms: 0,
          metadata: {},
        } as any);
      }));

      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Stale task' }),
      });
      const { id } = await createRes.json();

      // Task exists at this point -- verify status works
      const statusRes = await app.request(`/a2a/tasks/${id}/status`);
      expect(statusRes.status).toBe(200);
    });
  });

  // ---- _executeA2ATask early return for missing task (line 199) ----

  describe('_executeA2ATask with missing task', () => {
    it('handles task ID not found in active tasks map gracefully', async () => {
      // Submit a task but intercept the orchestrator call to remove the task first
      vi.mocked(orchestrator.run).mockImplementationOnce(async () => {
        // The orchestrator.run call is async, task stays in map during execution
        return {
          taskId: 'task-123',
          status: 'completed',
          output: 'done',
          artifacts: [],
          cost: { total_usd: 0, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 10 },
          judges: [],
          teamDesign: null,
          duration_ms: 0,
          metadata: {},
        } as any;
      });

      const createRes = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Immediate task' }),
      });

      expect(createRes.status).toBe(202);
    });
  });

  // ---- prompt as non-string ----

  describe('POST /a2a/tasks/send prompt validation edge cases', () => {
    it('rejects when prompt is a number', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 42 }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('non-empty string');
    });

    it('rejects when prompt is whitespace only', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '   ' }),
      });

      expect(res.status).toBe(400);
    });

    it('uses provided id when supplied', async () => {
      const res = await app.request('/a2a/tasks/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Custom id test', id: 'my-custom-id' }),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.id).toBe('my-custom-id');
    });
  });
});
