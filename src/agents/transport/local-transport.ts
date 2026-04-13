// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- LocalTransport
 *
 * In-memory transport wrapping MsgHub. External callers speak A2ATaskMessage;
 * internally routes through MsgHub for backward compatibility with Phase 4 topologies.
 *
 * Source: Phase 10b LLD Section 2.3
 *
 * CRITICAL (H-2 audit fix): Unsubscribe is a NO-OP on MsgHub layer.
 * LocalTransport manages its own handler map. Does NOT call msgHub.unsubscribe()
 * because that removes ALL handlers for the agentId (including SwarmEngine's).
 */

import type { MsgHub, AgentMessage } from '../msghub.js';
import type { MessageConverter } from './message-converter.js';
import type { EventBus } from '../../events/event-bus.js';
import type {
  AgentTransport,
  A2ATaskMessage,
  TransportSendResult,
  TransportType,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class LocalTransportImpl implements AgentTransport {
  private readonly _msgHub: MsgHub;
  private readonly _converter: MessageConverter;
  private readonly _eventBus: EventBus;

  /** Internal handler tracking (H-2 fix: never call msgHub.unsubscribe) */
  private readonly _a2aHandlers: Map<string, Set<(msg: A2ATaskMessage) => void>>;

  constructor(msgHub: MsgHub, converter: MessageConverter, eventBus: EventBus) {
    this._msgHub = msgHub;
    this._converter = converter;
    this._eventBus = eventBus;
    this._a2aHandlers = new Map();
  }

  async send(message: A2ATaskMessage): Promise<TransportSendResult> {
    const startMs = performance.now();

    try {
      // Convert A2ATaskMessage -> AgentMessage for MsgHub
      const agentMessage: AgentMessage = this._converter.fromA2A(message);

      // H-1 compliance: MsgHub validates message.from === from param
      this._msgHub.send(message.from, message.to, agentMessage);

      const latencyMs = performance.now() - startMs;

      this._eventBus.emit({
        type: 'transport:message_sent',
        payload: {
          from: message.from,
          to: message.to,
          transport: 'local',
          latencyMs,
        },
        source: 'local-transport',
      });

      return Object.freeze({
        messageId: message.id,
        delivered: true,
        latencyMs,
        transport: 'local' as TransportType,
      });
    } catch (error: unknown) {
      const latencyMs = performance.now() - startMs;

      this._eventBus.emit({
        type: 'transport:send_failed',
        payload: {
          from: message.from,
          to: message.to,
          transport: 'local',
          error: error instanceof Error ? error.message : String(error),
        },
        source: 'local-transport',
      });

      return Object.freeze({
        messageId: message.id,
        delivered: false,
        latencyMs,
        transport: 'local' as TransportType,
      });
    }
  }

  subscribe(
    agentId: string,
    handler: (msg: A2ATaskMessage) => void,
  ): () => void {
    // Wrap: convert incoming AgentMessage -> A2ATaskMessage for caller
    const wrappedHandler = (agentMsg: AgentMessage): void => {
      handler(this._converter.toA2A(agentMsg));
    };

    // Register on MsgHub for actual message delivery
    this._msgHub.subscribe(agentId, wrappedHandler);

    // Track in our own map for bookkeeping
    if (!this._a2aHandlers.has(agentId)) {
      this._a2aHandlers.set(agentId, new Set());
    }
    this._a2aHandlers.get(agentId)!.add(handler);

    // H-2 fix: unsubscribe is NO-OP on MsgHub layer
    // SwarmEngine handles MsgHub cleanup; we only clean our own tracking
    return () => {
      this._a2aHandlers.get(agentId)?.delete(handler);
    };
  }

  getLatency(): number {
    return 0; // In-memory: negligible latency
  }

  getType(): TransportType {
    return 'local';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalTransport(
  msgHub: MsgHub,
  converter: MessageConverter,
  eventBus: EventBus,
): AgentTransport {
  return new LocalTransportImpl(msgHub, converter, eventBus);
}
