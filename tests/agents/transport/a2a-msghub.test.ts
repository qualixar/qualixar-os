/**
 * Phase A2 -- A2AMsgHub Tests
 *
 * Verifies that the A2AMsgHub adapter wraps all MsgHub messages
 * in A2A format transparently, so topologies don't need changes.
 *
 * Source: Phase A2 LLD Section 7.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createA2AMsgHub } from '../../../src/agents/transport/a2a-msghub.js';
import type { MsgHub, AgentMessage } from '../../../src/agents/msghub.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type { ProtocolRouter, AgentTransport, TransportSendResult } from '../../../src/agents/transport/types.js';
import { MessageConverter } from '../../../src/agents/transport/message-converter.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockMsgHub(): MsgHub {
  return {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
    getMessageCount: vi.fn().mockReturnValue(0),
  };
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
  } as unknown as EventBus;
}

function createMockTransport(type: 'local' | 'a2a' = 'local'): AgentTransport {
  return {
    send: vi.fn().mockResolvedValue({
      messageId: 'msg-001',
      delivered: true,
      latencyMs: 1,
      transport: type,
    } satisfies TransportSendResult),
    subscribe: vi.fn().mockReturnValue(() => {}),
    getLatency: vi.fn().mockReturnValue(0),
    getType: vi.fn().mockReturnValue(type),
  };
}

function createMockProtocolRouter(transport?: AgentTransport): ProtocolRouter {
  return {
    selectTransport: vi.fn().mockReturnValue(transport ?? createMockTransport('local')),
    selectTransportForTeam: vi.fn(),
    recordMetric: vi.fn(),
    getRecommendation: vi.fn(),
    pruneOldMetrics: vi.fn(),
  };
}

function makeMessage(from: string, to: string, content: string): AgentMessage {
  return {
    id: 'msg-001',
    from,
    to,
    content,
    type: 'task',
    timestamp: '2026-04-07T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A2AMsgHub', () => {
  let baseMsgHub: MsgHub;
  let eventBus: EventBus;
  let converter: MessageConverter;

  beforeEach(() => {
    baseMsgHub = createMockMsgHub();
    eventBus = createMockEventBus();
    converter = new MessageConverter();
  });

  it('implements MsgHub interface (has all required methods)', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    expect(hub.send).toBeTypeOf('function');
    expect(hub.subscribe).toBeTypeOf('function');
    expect(hub.unsubscribe).toBeTypeOf('function');
    expect(hub.getHistory).toBeTypeOf('function');
    expect(hub.clear).toBeTypeOf('function');
    expect(hub.getMessageCount).toBeTypeOf('function');
  });

  it('send() delegates to underlying msgHub for local agents', () => {
    const localTransport = createMockTransport('local');
    const router = createMockProtocolRouter(localTransport);
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const msg = makeMessage('agent-a', 'agent-b', 'hello');

    hub.send('agent-a', 'agent-b', msg);

    expect(baseMsgHub.send).toHaveBeenCalledWith('agent-a', 'agent-b', msg);
  });

  it('send() emits a2a:message_wrapped event', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const msg = makeMessage('agent-a', 'agent-b', 'hello');

    hub.send('agent-a', 'agent-b', msg);

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'a2a:message_wrapped',
        payload: expect.objectContaining({
          from: 'agent-a',
          to: 'agent-b',
          messageId: 'msg-001',
        }),
      }),
    );
  });

  it('send() routes through a2a transport for remote agents', () => {
    const a2aTransport = createMockTransport('a2a');
    const router = createMockProtocolRouter(a2aTransport);
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const msg = makeMessage('agent-a', 'remote-agent', 'hello');

    hub.send('agent-a', 'remote-agent', msg);

    // Should call transport.send() with A2A format
    expect(a2aTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'agent-a',
        to: 'remote-agent',
        type: 'task',
        payload: expect.objectContaining({ content: 'hello' }),
      }),
    );

    // H-03 fix: local delivery only on fallback, NOT unconditionally
    // baseMsgHub.send is NOT called for remote agents (only on failure)
    expect(baseMsgHub.send).not.toHaveBeenCalled();
  });

  it('send() with broadcast delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const msg = makeMessage('agent-a', 'broadcast', 'hello all');

    hub.send('agent-a', 'broadcast', msg);

    expect(baseMsgHub.send).toHaveBeenCalledWith('agent-a', 'broadcast', msg);
  });

  it('subscribe() delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const handler = vi.fn();

    hub.subscribe('agent-a', handler);

    expect(baseMsgHub.subscribe).toHaveBeenCalledWith('agent-a', handler);
  });

  it('unsubscribe() delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    hub.unsubscribe('agent-a');

    expect(baseMsgHub.unsubscribe).toHaveBeenCalledWith('agent-a');
  });

  it('getHistory() delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    hub.getHistory('agent-a');

    expect(baseMsgHub.getHistory).toHaveBeenCalledWith('agent-a');
  });

  it('clear() delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    hub.clear();

    expect(baseMsgHub.clear).toHaveBeenCalled();
  });

  it('getMessageCount() delegates to underlying msgHub', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    hub.getMessageCount();

    expect(baseMsgHub.getMessageCount).toHaveBeenCalled();
  });

  it('remote transport failure falls back to local delivery', async () => {
    const failTransport = createMockTransport('a2a');
    (failTransport.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network timeout'));
    const router = createMockProtocolRouter(failTransport);
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });
    const msg = makeMessage('agent-a', 'remote-agent', 'hello');

    // Should NOT throw — should fall back to local
    hub.send('agent-a', 'remote-agent', msg);

    // Wait for async failure + fallback
    await new Promise((resolve) => setTimeout(resolve, 10));

    // H-03: Local delivery happens ONLY as fallback after remote failure
    expect(baseMsgHub.send).toHaveBeenCalledWith('agent-a', 'remote-agent', msg);
  });

  it('topology integration: transparent A2A wrapping via MsgHub interface', () => {
    const router = createMockProtocolRouter();
    const hub = createA2AMsgHub({ msgHub: baseMsgHub, converter, protocolRouter: router, eventBus });

    // Simulate what a topology does — call msgHub.send() directly
    const msg = makeMessage('worker-1', 'manager', 'task complete');
    hub.send('worker-1', 'manager', msg);

    // Verify underlying msgHub got the call (topology behavior unchanged)
    expect(baseMsgHub.send).toHaveBeenCalledWith('worker-1', 'manager', msg);

    // Verify A2A wrapping event was emitted (new behavior)
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'a2a:message_wrapped' }),
    );
  });
});
