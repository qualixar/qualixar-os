/**
 * Phase 10b -- A2ATransport Tests
 *
 * Tests HTTP-based A2A transport with retry, circuit breaker, and subscribe.
 * Uses mock fetch, LocationRegistry, EventBus, and Logger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createA2ATransport } from '../../../src/agents/transport/a2a-transport.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type {
  A2ATaskMessage,
  LocationRegistry,
  AgentLocationEntry,
  TransportConfig,
} from '../../../src/agents/transport/types.js';
import { DEFAULT_TRANSPORT_CONFIG } from '../../../src/agents/transport/types.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn(async () => 0),
    getLastEventId: vi.fn(() => 0),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  } as unknown as Logger;
}

function makeRemoteEntry(
  agentId: string,
  url: string = 'http://remote-agent:8080',
): AgentLocationEntry {
  return {
    agentId,
    location: 'remote',
    url,
    transport: 'a2a',
    avgLatencyMs: 50,
    lastSeen: new Date().toISOString(),
  };
}

function makeLocalEntry(agentId: string): AgentLocationEntry {
  return {
    agentId,
    location: 'local',
    transport: 'local',
    avgLatencyMs: 0,
    lastSeen: new Date().toISOString(),
  };
}

function createMockRegistry(
  entries: AgentLocationEntry[] = [],
): LocationRegistry {
  const map = new Map(entries.map((e) => [e.agentId, e]));
  return {
    register: vi.fn((entry) => map.set(entry.agentId, entry)),
    lookup: vi.fn((id) => map.get(id)),
    listRemote: vi.fn(() => entries.filter((e) => e.location === 'remote')),
    listAll: vi.fn(() => [...map.values()]),
    discoverFromCard: vi.fn(() => entries[0] ?? makeRemoteEntry('unknown')),
    remove: vi.fn(),
    isLocal: vi.fn((id) => map.get(id)?.location === 'local'),
    swapLocation: vi.fn(),
    onLocationChange: vi.fn(() => () => {}),
  };
}

function makeA2AMessage(overrides?: Partial<A2ATaskMessage>): A2ATaskMessage {
  return {
    id: 'msg-1',
    type: 'task',
    from: 'local-agent',
    to: 'remote-agent',
    payload: { content: 'hello', contentType: 'text/plain' },
    timestamp: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

const FAST_CONFIG: TransportConfig = {
  ...DEFAULT_TRANSPORT_CONFIG,
  a2aTimeoutMs: 1_000,
  retryCount: 1,
  retryBaseDelayMs: 10,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2ATransport', () => {
  let eventBus: EventBus;
  let logger: Logger;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    eventBus = createMockEventBus();
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Factory / basic shape
  // -----------------------------------------------------------------------

  describe('createA2ATransport', () => {
    it('returns an object with AgentTransport methods', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.subscribe).toBe('function');
      expect(typeof transport.getLatency).toBe('function');
      expect(typeof transport.getType).toBe('function');
      expect(typeof transport.dispatchInbound).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // getType / getLatency
  // -----------------------------------------------------------------------

  describe('getType', () => {
    it('returns "a2a"', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      expect(transport.getType()).toBe('a2a');
    });
  });

  describe('getLatency', () => {
    it('returns -1 when no data', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      expect(transport.getLatency()).toBe(-1);
    });
  });

  // -----------------------------------------------------------------------
  // send
  // -----------------------------------------------------------------------

  describe('send', () => {
    it('throws when agent not in registry', async () => {
      const registry = createMockRegistry([]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      await expect(transport.send(makeA2AMessage())).rejects.toThrow(
        'Agent not found in location registry: remote-agent',
      );
    });

    it('throws when agent is local', async () => {
      const registry = createMockRegistry([makeLocalEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      await expect(transport.send(makeA2AMessage())).rejects.toThrow(
        'A2ATransport cannot send to local agent: remote-agent',
      );
    });

    it('sends POST request to agent URL on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      const result = await transport.send(makeA2AMessage());

      expect(result.delivered).toBe(true);
      expect(result.transport).toBe('a2a');
      expect(result.messageId).toBe('msg-1');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://remote-agent:8080/a2a/tasks/send',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('emits transport:message_sent on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      await transport.send(makeA2AMessage());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:message_sent',
          source: 'a2a-transport',
        }),
      );
    });

    it('returns delivered=false after all retries fail', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      const result = await transport.send(makeA2AMessage());

      expect(result.delivered).toBe(false);
      expect(result.transport).toBe('a2a');
      // retryCount=1 means 2 total attempts
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('emits transport:send_failed after retries exhausted', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      await transport.send(makeA2AMessage());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:send_failed',
          source: 'a2a-transport',
        }),
      );
    });

    it('handles network errors (fetch throws)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Connection refused'));

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      const result = await transport.send(makeA2AMessage());

      expect(result.delivered).toBe(false);
    });

    it('updates getLatency after successful send', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      expect(transport.getLatency()).toBe(-1);

      await transport.send(makeA2AMessage());

      expect(transport.getLatency()).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // Circuit Breaker
  // -----------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('opens after 5 consecutive failures', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const noRetryConfig: TransportConfig = {
        ...FAST_CONFIG,
        retryCount: 0, // 1 attempt per send
      };
      const transport = createA2ATransport(registry, noRetryConfig, eventBus, logger);

      // Send 5 times to trip the breaker
      for (let i = 0; i < 5; i++) {
        await transport.send(makeA2AMessage());
      }

      // 6th call should throw immediately (circuit open)
      await expect(transport.send(makeA2AMessage())).rejects.toThrow(
        'Circuit breaker open for agent: remote-agent',
      );
    });

    it('transitions to half-open after reset period', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const registry = createMockRegistry([makeRemoteEntry('remote-agent')]);
      const noRetryConfig: TransportConfig = {
        ...FAST_CONFIG,
        retryCount: 0,
      };
      const transport = createA2ATransport(registry, noRetryConfig, eventBus, logger);

      // Trip the breaker
      for (let i = 0; i < 5; i++) {
        await transport.send(makeA2AMessage());
      }

      // Mock Date.now to simulate time passing beyond reset period
      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 61_000; // 61s later

      // Should NOT throw -- half-open state allows one attempt
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const result = await transport.send(makeA2AMessage());
      expect(result.delivered).toBe(true);

      Date.now = originalDateNow;
    });
  });

  // -----------------------------------------------------------------------
  // subscribe / dispatchInbound
  // -----------------------------------------------------------------------

  describe('subscribe', () => {
    it('stores handler and invokes on dispatchInbound', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      const handler = vi.fn();

      transport.subscribe('agent-x', handler);

      const inbound = makeA2AMessage({ to: 'agent-x' });
      transport.dispatchInbound('agent-x', inbound);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(inbound);
    });

    it('unsubscribe removes handler', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      const handler = vi.fn();

      const unsub = transport.subscribe('agent-x', handler);
      unsub();

      transport.dispatchInbound('agent-x', makeA2AMessage({ to: 'agent-x' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('logs warning when no handlers for dispatchInbound', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);

      transport.dispatchInbound('unknown-agent', makeA2AMessage());

      expect(logger.warn).toHaveBeenCalled();
    });

    it('supports multiple handlers per agent', () => {
      const registry = createMockRegistry();
      const transport = createA2ATransport(registry, FAST_CONFIG, eventBus, logger);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.subscribe('agent-x', handler1);
      transport.subscribe('agent-x', handler2);

      transport.dispatchInbound('agent-x', makeA2AMessage({ to: 'agent-x' }));

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });
});
