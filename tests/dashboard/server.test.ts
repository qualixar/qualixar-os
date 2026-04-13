/**
 * Qualixar OS Phase 7 -- Dashboard Server Tests
 * Tests WebSocket relay, event subscription, and command handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventBus } from '../../src/events/event-bus.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { QosEvent } from '../../src/types/common.js';
import type { QosEventType } from '../../src/types/events.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

type EventHandler = (event: QosEvent) => Promise<void>;

function createMockEventBus(): EventBus & {
  readonly handlers: Map<string, Set<EventHandler>>;
  triggerEvent: (event: QosEvent) => void;
} {
  const handlers = new Map<string, Set<EventHandler>>();
  return {
    handlers,
    emit: vi.fn((event: Omit<QosEvent, 'id' | 'timestamp'>) => {
      // no-op for test
    }),
    on: vi.fn((type: QosEventType | '*', handler: EventHandler) => {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
    }),
    off: vi.fn((type: QosEventType | '*', handler: EventHandler) => {
      const set = handlers.get(type);
      if (set) {
        set.delete(handler);
      }
    }),
    replay: vi.fn(async () => 0),
    getLastEventId: vi.fn(() => 0),
    triggerEvent(event: QosEvent) {
      const allHandlers = handlers.get('*') ?? new Set();
      const typeHandlers = handlers.get(event.type) ?? new Set();
      for (const h of allHandlers) {
        h(event).catch(() => {});
      }
      for (const h of typeHandlers) {
        h(event).catch(() => {});
      }
    },
  };
}

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn(),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    redirect: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    getStatus: vi.fn(() => ({
      taskId: 'test-task',
      phase: 'init' as const,
      progress: 0,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: 0,
      startedAt: new Date().toISOString(),
    })),
    recoverIncompleteTasks: vi.fn(async () => {}),
    modeEngine: {} as never,
    costTracker: {} as never,
    forge: {} as never,
    judgePipeline: {} as never,
    slmLite: {} as never,
    agentRegistry: {} as never,
    swarmEngine: {} as never,
    strategyScorer: {} as never,
    eventBus: {} as never,
    db: {} as never,
  };
}

function createMockWebSocket(): {
  readonly send: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly ping: ReturnType<typeof vi.fn>;
  readyState: number;
  readonly listeners: Map<string, ((...args: unknown[]) => void)[]>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    readyState: 1, // WebSocket.OPEN
    listeners,
    on(event: string, cb: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(cb);
      listeners.set(event, existing);
    },
    emit(event: string, ...args: unknown[]) {
      const cbs = listeners.get(event) ?? [];
      for (const cb of cbs) {
        cb(...args);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard Server', () => {
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockOrchestrator = createMockOrchestrator();
  });

  describe('createDashboardServer', () => {
    it('should create server with Hono app and WebSocketServer', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      expect(server.app).toBeDefined();
      expect(server.wss).toBeDefined();
      expect(server.connectedClients).toBe(0);
      expect(typeof server.attachToServer).toBe('function');
      expect(typeof server.shutdown).toBe('function');

      server.shutdown();
    });

    it('should subscribe to all EventBus events on creation', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      expect(mockEventBus.on).toHaveBeenCalledWith('*', expect.any(Function));

      server.shutdown();
    });
  });

  describe('Event relay', () => {
    it('should relay EventBus events to connected WS clients', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      // Simulate a WS connection via the WSS 'connection' event
      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      expect(server.connectedClients).toBe(1);

      // Trigger an event through the EventBus handler
      const testEvent: QosEvent = {
        id: 1,
        type: 'task:completed',
        payload: { taskId: 'task-1', status: 'completed' },
        source: 'orchestrator',
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
      };
      mockEventBus.triggerEvent(testEvent);

      // Wait for async event processing
      await new Promise((r) => setTimeout(r, 10));

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('task:update');
      expect(sentData.payload.eventType).toBe('task:completed');

      server.shutdown();
    });

    it('should map known event types correctly', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const eventMappings = [
        { input: 'agent:spawned', expected: 'agent:update' },
        { input: 'judge:verdict', expected: 'judge:verdict' },
        { input: 'cost:recorded', expected: 'cost:update' },
        { input: 'forge:designed', expected: 'forge:update' },
        { input: 'memory:recalled', expected: 'memory:update' },
        { input: 'swarm:started', expected: 'swarm:update' },
      ];

      for (const { input, expected } of eventMappings) {
        mockWs.send.mockClear();
        const event: QosEvent = {
          id: 1,
          type: input as QosEventType,
          payload: {},
          source: 'test',
          timestamp: new Date().toISOString(),
        };
        mockEventBus.triggerEvent(event);
        await new Promise((r) => setTimeout(r, 10));

        expect(mockWs.send).toHaveBeenCalled();
        const sent = JSON.parse(mockWs.send.mock.calls[0][0] as string);
        expect(sent.type).toBe(expected);
      }

      server.shutdown();
    });

    it('should map unknown event types to log', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const event: QosEvent = {
        id: 1,
        type: 'system:started',
        payload: { version: '2.0' },
        source: 'system',
        timestamp: new Date().toISOString(),
      };
      mockEventBus.triggerEvent(event);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockWs.send).toHaveBeenCalled();
      const sent = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('log');

      server.shutdown();
    });

    it('should not send to closed clients', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      mockWs.readyState = 3; // WebSocket.CLOSED
      server.wss.emit('connection', mockWs);

      const event: QosEvent = {
        id: 1,
        type: 'task:completed',
        payload: {},
        source: 'test',
        timestamp: new Date().toISOString(),
      };
      mockEventBus.triggerEvent(event);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockWs.send).not.toHaveBeenCalled();

      server.shutdown();
    });
  });

  describe('Command handling', () => {
    it('should handle task:pause command', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const command = JSON.stringify({ action: 'task:pause', taskId: 'task-1' });
      mockWs.emit('message', command);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockOrchestrator.pause).toHaveBeenCalledWith('task-1');
      expect(mockWs.send).toHaveBeenCalled();

      server.shutdown();
    });

    it('should handle task:resume command', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const command = JSON.stringify({ action: 'task:resume', taskId: 'task-1' });
      mockWs.emit('message', command);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockOrchestrator.resume).toHaveBeenCalledWith('task-1');

      server.shutdown();
    });

    it('should handle task:cancel command', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const command = JSON.stringify({ action: 'task:cancel', taskId: 'task-1' });
      mockWs.emit('message', command);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockOrchestrator.cancel).toHaveBeenCalledWith('task-1');

      server.shutdown();
    });

    it('should handle subscribe/unsubscribe commands', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const subscribeCmd = JSON.stringify({ action: 'subscribe', eventTypes: ['task:update'] });
      mockWs.emit('message', subscribeCmd);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.send).toHaveBeenCalled();
      const response = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(response.ok).toBe(true);

      server.shutdown();
    });

    it('should reject invalid JSON commands', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      mockWs.emit('message', 'not valid json {{{');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Invalid command' }),
      );

      server.shutdown();
    });

    it('should require taskId for task commands', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const command = JSON.stringify({ action: 'task:pause' });
      mockWs.emit('message', command);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.send).toHaveBeenCalled();
      const response = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(response.error).toBe('taskId required');

      server.shutdown();
    });

    it('should handle orchestrator errors gracefully', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      vi.mocked(mockOrchestrator.pause).mockRejectedValueOnce(new Error('Unknown task'));
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);

      const command = JSON.stringify({ action: 'task:pause', taskId: 'bad-id' });
      mockWs.emit('message', command);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.send).toHaveBeenCalled();
      const response = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(response.error).toBe('Unknown task');

      server.shutdown();
    });
  });

  describe('Client lifecycle', () => {
    it('should track client connections and disconnections', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);
      expect(server.connectedClients).toBe(1);

      // Emit dashboard:client_connected
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard:client_connected',
          payload: expect.objectContaining({ clientCount: 1 }),
        }),
      );

      // Simulate disconnect
      mockWs.emit('close');
      expect(server.connectedClients).toBe(0);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard:client_disconnected',
          payload: expect.objectContaining({ clientCount: 0 }),
        }),
      );

      server.shutdown();
    });

    it('should track multiple clients', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      server.wss.emit('connection', ws1);
      server.wss.emit('connection', ws2);

      expect(server.connectedClients).toBe(2);

      ws1.emit('close');
      expect(server.connectedClients).toBe(1);

      server.shutdown();
    });
  });

  describe('Shutdown', () => {
    it('should clean up on shutdown', async () => {
      const { createDashboardServer } = await import('../../src/dashboard/server.js');
      const server = createDashboardServer(mockEventBus, mockOrchestrator);

      const mockWs = createMockWebSocket();
      server.wss.emit('connection', mockWs);
      expect(server.connectedClients).toBe(1);

      server.shutdown();

      expect(mockEventBus.off).toHaveBeenCalledWith('*', expect.any(Function));
      expect(mockWs.close).toHaveBeenCalled();
      expect(server.connectedClients).toBe(0);
    });
  });
});
