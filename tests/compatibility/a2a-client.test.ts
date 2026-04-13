/**
 * Qualixar OS Phase 8b -- A2AClient Tests
 * TDD: RED phase -- tests written before implementation.
 *
 * Mocks: global fetch (never makes real HTTP requests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventBus } from '../../src/events/event-bus.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { Logger } from 'pino';

import {
  A2AClient,
  createA2AClient,
  type TaskDelegation,
  type TaskDelegationResult,
} from '../../src/compatibility/a2a-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validAgentCard = {
  name: 'ExternalAgent',
  protocol: 'a2a/v0.3',
  capabilities: ['research', 'analysis'],
  url: 'http://external:3000',
};

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
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

function createMockDb(): QosDatabase {
  return {
    db: {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      }),
    },
    runMigrations: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    close: vi.fn(),
  } as unknown as QosDatabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2AClient', () => {
  let client: A2AClient;
  let eventBus: EventBus;
  let logger: Logger;
  let db: QosDatabase;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createMockEventBus();
    logger = createMockLogger();
    db = createMockDb();
    client = createA2AClient(eventBus, logger, db);

    // Save and mock global fetch
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---- Factory ----

  describe('createA2AClient()', () => {
    it('creates an A2AClient instance', () => {
      expect(client).toBeDefined();
      expect(typeof client.discover).toBe('function');
      expect(typeof client.delegate).toBe('function');
      expect(typeof client.listKnownAgents).toBe('function');
      expect(typeof client.healthCheck).toBe('function');
    });
  });

  // ---- discover() ----

  describe('discover()', () => {
    it('fetches and stores agent card from /.well-known/agent-card', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );

      const card = await client.discover('http://external:3000');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://external:3000/.well-known/agent-card',
        expect.any(Object),
      );
      expect(card.name).toBe('ExternalAgent');
      expect(card.protocol).toBe('a2a/v0.3');
    });

    it('validates protocol is a2a/v0.3', async () => {
      const badCard = { ...validAgentCard, protocol: 'a2a/v0.1' };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(badCard), { status: 200 }),
      );

      await expect(client.discover('http://external:3000')).rejects.toThrow('protocol');
    });

    it('validates agent card has a name', async () => {
      const badCard = { ...validAgentCard, name: '' };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(badCard), { status: 200 }),
      );

      await expect(client.discover('http://external:3000')).rejects.toThrow('name');
    });

    it('validates agent card has non-empty capabilities', async () => {
      const badCard = { ...validAgentCard, capabilities: [] };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(badCard), { status: 200 }),
      );

      await expect(client.discover('http://external:3000')).rejects.toThrow('capabilities');
    });

    it('persists discovered agent to database', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );

      await client.discover('http://external:3000');

      expect(db.insert).toHaveBeenCalledWith(
        'a2a_agents',
        expect.objectContaining({
          name: 'ExternalAgent',
          url: 'http://external:3000',
        }),
      );
    });

    it('emits a2a:agent_registered event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );

      await client.discover('http://external:3000');

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'a2a:agent_registered',
          source: 'a2a-client',
        }),
      );
    });

    it('throws when fetch fails', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(client.discover('http://external:3000')).rejects.toThrow('Network error');
    });

    it('throws when server returns non-200', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(client.discover('http://external:3000')).rejects.toThrow();
    });
  });

  // ---- delegate() ----

  describe('delegate()', () => {
    beforeEach(async () => {
      // Discover an agent first
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );
      await client.discover('http://external:3000');
    });

    it('delegates a task and returns completed result', async () => {
      // POST /a2a/tasks/send -> 202 with id
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'remote-task-1', status: 'pending' }), { status: 202 }),
      );
      // GET /a2a/tasks/:id/status -> completed
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'remote-task-1',
          status: 'completed',
          output: 'Research results here',
          costUsd: 0.02,
        }), { status: 200 }),
      );

      const task: TaskDelegation = {
        prompt: 'Research quantum computing',
        taskType: 'research',
      };

      const result = await client.delegate('http://external:3000', task);

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Research results here');
      expect(result.costUsd).toBe(0.02);
    });

    it('emits a2a:request_sent event', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-2', status: 'pending' }), { status: 202 }),
      );
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-2', status: 'completed', output: 'done' }), { status: 200 }),
      );

      await client.delegate('http://external:3000', { prompt: 'Test' });

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'a2a:request_sent',
          source: 'a2a-client',
        }),
      );
    });

    it('polls until task completes', async () => {
      // POST send
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-3', status: 'pending' }), { status: 202 }),
      );
      // Poll 1: running
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-3', status: 'running' }), { status: 200 }),
      );
      // Poll 2: completed
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-3', status: 'completed', output: 'final' }), { status: 200 }),
      );

      const result = await client.delegate('http://external:3000', { prompt: 'Poll test' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('final');
    });

    it('returns failed when remote task fails', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-4', status: 'pending' }), { status: 202 }),
      );
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-4', status: 'failed' }), { status: 200 }),
      );

      const result = await client.delegate('http://external:3000', { prompt: 'Fail test' });
      expect(result.status).toBe('failed');
    });

    it('returns timeout when timeoutMs is exceeded', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-5', status: 'pending' }), { status: 202 }),
      );
      // Keep returning "running" -- should timeout
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ id: 'task-5', status: 'running' }), { status: 200 }),
      );

      const result = await client.delegate('http://external:3000', {
        prompt: 'Timeout test',
        timeoutMs: 200,
      });

      expect(result.status).toBe('timeout');
    });

    it('throws when send request fails', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Send failed'));

      await expect(
        client.delegate('http://external:3000', { prompt: 'Error test' }),
      ).rejects.toThrow('Send failed');
    });

    it('throws when send response is non-OK (line 165)', async () => {
      // POST /a2a/tasks/send -> 500
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(
        client.delegate('http://external:3000', { prompt: 'Server error test' }),
      ).rejects.toThrow('Failed to delegate task');
    });

    it('returns failed when status poll returns non-OK (line 187)', async () => {
      // POST /a2a/tasks/send -> 202 with id
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-poll-fail', status: 'pending' }), { status: 202 }),
      );
      // GET /a2a/tasks/:id/status -> 503 (server unavailable)
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 }),
      );

      const result = await client.delegate('http://external:3000', { prompt: 'Poll fail test' });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('Status check failed: HTTP 503');
    });

    it('returns failed result with costUsd and metadata from remote', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-meta', status: 'pending' }), { status: 202 }),
      );
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'task-meta',
          status: 'failed',
          output: 'Out of budget',
          costUsd: 1.50,
          metadata: { reason: 'budget_exceeded' },
        }), { status: 200 }),
      );

      const result = await client.delegate('http://external:3000', { prompt: 'Meta test' });
      expect(result.status).toBe('failed');
      expect(result.output).toBe('Out of budget');
      expect(result.costUsd).toBe(1.50);
      expect(result.metadata).toEqual({ reason: 'budget_exceeded' });
    });
  });

  // ---- listKnownAgents() ----

  describe('listKnownAgents()', () => {
    it('returns empty array when no agents discovered', () => {
      const agents = client.listKnownAgents();
      expect(agents).toEqual([]);
    });

    it('returns discovered agents', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );

      await client.discover('http://external:3000');
      const agents = client.listKnownAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('ExternalAgent');
      expect(agents[0].url).toBe('http://external:3000');
    });
  });

  // ---- healthCheck() ----

  describe('healthCheck()', () => {
    it('returns true when agent is reachable', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(validAgentCard), { status: 200 }),
      );

      const isHealthy = await client.healthCheck('http://external:3000');
      expect(isHealthy).toBe(true);
    });

    it('returns false when agent is not reachable', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Connection refused'));

      const isHealthy = await client.healthCheck('http://external:3000');
      expect(isHealthy).toBe(false);
    });
  });
});
