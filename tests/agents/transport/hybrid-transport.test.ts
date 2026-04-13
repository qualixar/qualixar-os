/**
 * Phase 10b -- HybridTransport Tests
 *
 * Tests routing to LocalTransport vs A2ATransport based on LocationRegistry,
 * broadcast handling, fallback behavior, and combined subscribe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHybridTransport } from '../../../src/agents/transport/hybrid-transport.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type {
  AgentTransport,
  A2ATaskMessage,
  TransportSendResult,
  LocationRegistry,
  AgentLocationEntry,
  TransportConfig,
} from '../../../src/agents/transport/types.js';
import { DEFAULT_TRANSPORT_CONFIG } from '../../../src/agents/transport/types.js';

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

function makeSendResult(
  overrides?: Partial<TransportSendResult>,
): TransportSendResult {
  return {
    messageId: 'msg-1',
    delivered: true,
    latencyMs: 1,
    transport: 'local',
    ...overrides,
  };
}

function createMockTransport(
  type: 'local' | 'a2a',
  sendResult?: Partial<TransportSendResult>,
): AgentTransport {
  return {
    send: vi.fn(async () => makeSendResult({ transport: type, ...sendResult })),
    subscribe: vi.fn(() => vi.fn()),
    getLatency: vi.fn(() => (type === 'local' ? 0 : 50)),
    getType: vi.fn(() => type),
  };
}

function makeRemoteEntry(agentId: string): AgentLocationEntry {
  return {
    agentId,
    location: 'remote',
    url: 'http://remote:8080',
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
    register: vi.fn(),
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
    from: 'agent-a',
    to: 'agent-b',
    payload: { content: 'hello', contentType: 'text/plain' },
    timestamp: '2026-04-02T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HybridTransport', () => {
  let eventBus: EventBus;
  let localTransport: AgentTransport;
  let a2aTransport: AgentTransport;

  beforeEach(() => {
    eventBus = createMockEventBus();
    localTransport = createMockTransport('local');
    a2aTransport = createMockTransport('a2a');
  });

  // -----------------------------------------------------------------------
  // Factory / basic shape
  // -----------------------------------------------------------------------

  describe('createHybridTransport', () => {
    it('returns an AgentTransport', () => {
      const registry = createMockRegistry();
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );
      expect(transport).toBeDefined();
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.subscribe).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // getType / getLatency
  // -----------------------------------------------------------------------

  describe('getType', () => {
    it('returns "hybrid"', () => {
      const registry = createMockRegistry();
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );
      expect(transport.getType()).toBe('hybrid');
    });
  });

  describe('getLatency', () => {
    it('returns local latency when no A2A data', () => {
      const a2aNoData = createMockTransport('a2a');
      (a2aNoData.getLatency as ReturnType<typeof vi.fn>).mockReturnValue(-1);

      const registry = createMockRegistry();
      const transport = createHybridTransport(
        localTransport, a2aNoData, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );
      expect(transport.getLatency()).toBe(0); // local = 0
    });

    it('returns weighted average of local and A2A latencies', () => {
      const local = createMockTransport('local');
      (local.getLatency as ReturnType<typeof vi.fn>).mockReturnValue(2);
      const a2a = createMockTransport('a2a');
      (a2a.getLatency as ReturnType<typeof vi.fn>).mockReturnValue(100);

      // 2 local, 1 remote
      const entries = [
        makeLocalEntry('a1'),
        makeLocalEntry('a2'),
        makeRemoteEntry('r1'),
      ];
      const registry = createMockRegistry(entries);
      const transport = createHybridTransport(
        local, a2a, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );

      // Weighted: (2*2 + 1*100) / 3 = 104/3 ~ 34.67
      const latency = transport.getLatency();
      expect(latency).toBeCloseTo(34.67, 1);
    });

    it('returns local latency when no agents registered', () => {
      const registry = createMockRegistry([]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );
      expect(transport.getLatency()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // send - routing by location
  // -----------------------------------------------------------------------

  describe('send', () => {
    it('delegates to local transport for local agents', async () => {
      const registry = createMockRegistry([makeLocalEntry('agent-b')]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );

      await transport.send(makeA2AMessage());

      expect(localTransport.send).toHaveBeenCalledOnce();
      expect(a2aTransport.send).not.toHaveBeenCalled();
    });

    it('delegates to A2A transport for remote agents', async () => {
      const registry = createMockRegistry([makeRemoteEntry('agent-b')]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );

      await transport.send(makeA2AMessage());

      expect(a2aTransport.send).toHaveBeenCalledOnce();
      expect(localTransport.send).not.toHaveBeenCalled();
    });

    it('falls back to local when agent not in registry and fallback enabled', async () => {
      const registry = createMockRegistry([]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry,
        { ...DEFAULT_TRANSPORT_CONFIG, fallbackToLocal: true },
        eventBus,
      );

      const result = await transport.send(makeA2AMessage({ to: 'unknown-agent' }));

      expect(localTransport.send).toHaveBeenCalledOnce();
      expect(result.delivered).toBe(true);
    });

    it('throws when agent not in registry and fallback disabled', async () => {
      const registry = createMockRegistry([]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry,
        { ...DEFAULT_TRANSPORT_CONFIG, fallbackToLocal: false },
        eventBus,
      );

      await expect(
        transport.send(makeA2AMessage({ to: 'unknown-agent' })),
      ).rejects.toThrow('Agent not found in location registry and fallback disabled');
    });
  });

  // -----------------------------------------------------------------------
  // send - broadcast
  // -----------------------------------------------------------------------

  describe('send - broadcast', () => {
    it('sends to local and all remote agents on broadcast', async () => {
      const entries = [makeRemoteEntry('r1'), makeRemoteEntry('r2')];
      const registry = createMockRegistry(entries);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );

      const msg = makeA2AMessage({ to: 'broadcast' });
      await transport.send(msg);

      // Local gets the original broadcast
      expect(localTransport.send).toHaveBeenCalledOnce();
      // A2A gets one send per remote agent
      expect(a2aTransport.send).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // send - fallback on A2A failure
  // -----------------------------------------------------------------------

  describe('send - A2A fallback', () => {
    it('falls back to local when A2A send throws and fallback enabled', async () => {
      (a2aTransport.send as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );

      const registry = createMockRegistry([makeRemoteEntry('agent-b')]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry,
        { ...DEFAULT_TRANSPORT_CONFIG, fallbackToLocal: true },
        eventBus,
      );

      const result = await transport.send(makeA2AMessage());

      expect(result.delivered).toBe(true);
      expect(localTransport.send).toHaveBeenCalledOnce();
    });

    it('emits transport:fallback event on A2A failure with fallback', async () => {
      (a2aTransport.send as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );

      const registry = createMockRegistry([makeRemoteEntry('agent-b')]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry,
        { ...DEFAULT_TRANSPORT_CONFIG, fallbackToLocal: true },
        eventBus,
      );

      await transport.send(makeA2AMessage());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:fallback',
          source: 'hybrid-transport',
        }),
      );
    });

    it('re-throws when A2A send throws and fallback disabled', async () => {
      (a2aTransport.send as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );

      const registry = createMockRegistry([makeRemoteEntry('agent-b')]);
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry,
        { ...DEFAULT_TRANSPORT_CONFIG, fallbackToLocal: false },
        eventBus,
      );

      await expect(transport.send(makeA2AMessage())).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  // -----------------------------------------------------------------------
  // subscribe
  // -----------------------------------------------------------------------

  describe('subscribe', () => {
    it('subscribes on both local and A2A transports', () => {
      const registry = createMockRegistry();
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );
      const handler = vi.fn();

      transport.subscribe('agent-x', handler);

      expect(localTransport.subscribe).toHaveBeenCalledWith('agent-x', handler);
      expect(a2aTransport.subscribe).toHaveBeenCalledWith('agent-x', handler);
    });

    it('unsubscribe calls both transport unsubscribes', () => {
      const localUnsub = vi.fn();
      const a2aUnsub = vi.fn();
      (localTransport.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(localUnsub);
      (a2aTransport.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(a2aUnsub);

      const registry = createMockRegistry();
      const transport = createHybridTransport(
        localTransport, a2aTransport, registry, DEFAULT_TRANSPORT_CONFIG, eventBus,
      );

      const unsub = transport.subscribe('agent-x', vi.fn());
      unsub();

      expect(localUnsub).toHaveBeenCalledOnce();
      expect(a2aUnsub).toHaveBeenCalledOnce();
    });
  });
});
