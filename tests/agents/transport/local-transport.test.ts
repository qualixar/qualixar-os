/**
 * Phase 10b -- LocalTransport Tests
 *
 * Tests in-memory transport that wraps MsgHub with A2ATaskMessage format.
 * Validates send/subscribe/unsubscribe, the H-2 NO-OP unsubscribe fix,
 * and proper event emissions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLocalTransport } from '../../../src/agents/transport/local-transport.js';
import { MessageConverter } from '../../../src/agents/transport/message-converter.js';
import type { MsgHub, AgentMessage } from '../../../src/agents/msghub.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type { A2ATaskMessage } from '../../../src/agents/transport/types.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockMsgHub(): MsgHub {
  return {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getHistory: vi.fn(() => []),
    clear: vi.fn(),
    getMessageCount: vi.fn(() => 0),
  };
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn(async () => 0),
    getLastEventId: vi.fn(() => 0),
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

describe('LocalTransport', () => {
  let msgHub: MsgHub;
  let eventBus: EventBus;
  let converter: MessageConverter;

  beforeEach(() => {
    msgHub = createMockMsgHub();
    eventBus = createMockEventBus();
    converter = new MessageConverter();
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe('createLocalTransport', () => {
    it('returns an AgentTransport', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      expect(transport).toBeDefined();
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.subscribe).toBe('function');
      expect(typeof transport.getLatency).toBe('function');
      expect(typeof transport.getType).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // getType / getLatency
  // -----------------------------------------------------------------------

  describe('getType', () => {
    it('returns "local"', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      expect(transport.getType()).toBe('local');
    });
  });

  describe('getLatency', () => {
    it('returns 0 for in-memory transport', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      expect(transport.getLatency()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // send
  // -----------------------------------------------------------------------

  describe('send', () => {
    it('converts A2ATaskMessage and delegates to MsgHub.send', async () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const message = makeA2AMessage();

      const result = await transport.send(message);

      expect(result.messageId).toBe('msg-1');
      expect(result.delivered).toBe(true);
      expect(result.transport).toBe('local');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      expect(msgHub.send).toHaveBeenCalledOnce();
      const [from, to, agentMsg] = (msgHub.send as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(from).toBe('agent-a');
      expect(to).toBe('agent-b');
      expect(agentMsg.from).toBe('agent-a');
      expect(agentMsg.to).toBe('agent-b');
      expect(agentMsg.content).toBe('hello');
    });

    it('emits transport:message_sent on success', async () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      await transport.send(makeA2AMessage());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:message_sent',
          source: 'local-transport',
        }),
      );
    });

    it('returns delivered=false when MsgHub.send throws', async () => {
      (msgHub.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('MsgHub failure');
      });

      const transport = createLocalTransport(msgHub, converter, eventBus);
      const result = await transport.send(makeA2AMessage());

      expect(result.delivered).toBe(false);
      expect(result.transport).toBe('local');
    });

    it('emits transport:send_failed when MsgHub.send throws', async () => {
      (msgHub.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('MsgHub failure');
      });

      const transport = createLocalTransport(msgHub, converter, eventBus);
      await transport.send(makeA2AMessage());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:send_failed',
          source: 'local-transport',
        }),
      );
    });

    it('preserves from field for MsgHub sender validation (H-1)', async () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const message = makeA2AMessage({ from: 'special-agent' });

      await transport.send(message);

      const [from] = (msgHub.send as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(from).toBe('special-agent');
    });
  });

  // -----------------------------------------------------------------------
  // subscribe / unsubscribe
  // -----------------------------------------------------------------------

  describe('subscribe', () => {
    it('registers handler on MsgHub', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const handler = vi.fn();

      transport.subscribe('agent-x', handler);

      expect(msgHub.subscribe).toHaveBeenCalledWith('agent-x', expect.any(Function));
    });

    it('converts AgentMessage to A2ATaskMessage in handler', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const handler = vi.fn();

      transport.subscribe('agent-x', handler);

      // Capture the wrapper registered on MsgHub
      const wrappedHandler = (msgHub.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1];

      // Simulate MsgHub delivering an AgentMessage
      const agentMsg: AgentMessage = {
        id: 'am-1', from: 'sender', to: 'agent-x',
        content: 'test', type: 'task', timestamp: '2026-04-02T00:00:00Z',
      };
      wrappedHandler(agentMsg);

      expect(handler).toHaveBeenCalledOnce();
      const received = handler.mock.calls[0][0] as A2ATaskMessage;
      expect(received.type).toBe('task');
      expect(received.payload.content).toBe('test');
      expect(received.from).toBe('sender');
    });

    it('unsubscribe is NO-OP on MsgHub (H-2 fix)', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const handler = vi.fn();

      const unsub = transport.subscribe('agent-x', handler);

      // Unsubscribe via returned function
      unsub();

      // MsgHub.unsubscribe should NOT have been called
      expect(msgHub.unsubscribe).not.toHaveBeenCalled();
    });

    it('tracks multiple handlers per agent', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.subscribe('agent-x', handler1);
      transport.subscribe('agent-x', handler2);

      expect(msgHub.subscribe).toHaveBeenCalledTimes(2);
    });

    it('unsubscribe only removes the specific handler from tracking', () => {
      const transport = createLocalTransport(msgHub, converter, eventBus);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = transport.subscribe('agent-x', handler1);
      transport.subscribe('agent-x', handler2);

      unsub1();

      // No MsgHub.unsubscribe calls (H-2)
      expect(msgHub.unsubscribe).not.toHaveBeenCalled();
    });
  });
});
