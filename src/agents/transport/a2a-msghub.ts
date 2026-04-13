// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase A2 -- A2A-Unified MsgHub Adapter
 *
 * Wraps the existing MsgHub with A2A envelope semantics.
 * Topologies call msgHub.send() as before — this adapter transparently:
 * 1. Wraps every message in A2ATaskMessage format
 * 2. Routes through ProtocolRouter-selected transport for remote agents
 * 3. Emits 'a2a:message_wrapped' events for observability
 * 4. Falls back to local MsgHub delivery if remote transport fails
 *
 * Source: Phase A2 LLD Section 3.2, Section 4.1
 */

import type { MsgHub, AgentMessage } from '../msghub.js';
import type { MessageConverter } from './message-converter.js';
import type { ProtocolRouter } from './types.js';
import type { EventBus } from '../../events/event-bus.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface A2AMsgHubOptions {
  readonly msgHub: MsgHub;
  readonly converter: MessageConverter;
  readonly protocolRouter: ProtocolRouter;
  readonly eventBus: EventBus;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class A2AMsgHubImpl implements MsgHub {
  private readonly _inner: MsgHub;
  private readonly _converter: MessageConverter;
  private readonly _router: ProtocolRouter;
  private readonly _eventBus: EventBus;

  constructor(options: A2AMsgHubOptions) {
    this._inner = options.msgHub;
    this._converter = options.converter;
    this._router = options.protocolRouter;
    this._eventBus = options.eventBus;
  }

  send(from: string, to: string | 'broadcast', message: AgentMessage): void {
    // Step 1: Convert to A2A format for envelope tracking
    const a2aMsg = this._converter.toA2A(message);

    // Step 2: Select transport ONCE (H-01 fix: avoid double selectTransport)
    const selectedTransport = to === 'broadcast'
      ? null
      : this._router.selectTransport(to);
    const transportType = selectedTransport?.getType() ?? 'local';

    // Step 3: Emit wrapping event for observability
    this._eventBus.emit({
      type: 'a2a:message_wrapped',
      payload: {
        from,
        to,
        messageId: message.id,
        transport: transportType,
        a2aType: a2aMsg.type,
      },
      source: 'a2a-msghub',
    });

    // Step 4: Route based on transport selection
    if (to === 'broadcast' || transportType === 'local') {
      // Local delivery — delegate to underlying MsgHub (unchanged behavior)
      this._inner.send(from, to, message);
      return;
    }

    // Step 5: Non-local transport — send via A2A + local fallback on failure only
    selectedTransport!.send(a2aMsg).then(() => {
      // H-02 fix: emit success event
      this._eventBus.emit({
        type: 'a2a:remote_delivery',
        payload: { from, to, messageId: message.id, success: true },
        source: 'a2a-msghub',
      });
    }).catch((error: unknown) => {
      // Remote failed — emit failure event + fallback to local (H-03)
      this._eventBus.emit({
        type: 'a2a:remote_delivery',
        payload: {
          from,
          to,
          messageId: message.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        source: 'a2a-msghub',
      });
      // H-03 fix: deliver locally ONLY as fallback after remote failure
      this._inner.send(from, to, message);
    });

    // H-03 fix: local delivery moved to catch block — no duplicate delivery
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): void {
    this._inner.subscribe(agentId, handler);
  }

  unsubscribe(agentId: string): void {
    this._inner.unsubscribe(agentId);
  }

  getHistory(agentId?: string): readonly AgentMessage[] {
    return this._inner.getHistory(agentId);
  }

  clear(): void {
    this._inner.clear();
  }

  getMessageCount(): number {
    return this._inner.getMessageCount();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an A2A-unified MsgHub adapter.
 * Drop-in replacement for MsgHub — topologies don't know the difference.
 */
export function createA2AMsgHub(options: A2AMsgHubOptions): MsgHub {
  return new A2AMsgHubImpl(options);
}
