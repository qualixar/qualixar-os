// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- MsgHub
 * In-memory pub/sub message queue with broadcast and history.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.2
 * Interface: REWRITE-SPEC Section 6 Phase 4 (MsgHub)
 */

import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface AgentMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly type: 'task' | 'result' | 'feedback' | 'handoff' | 'broadcast';
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface MsgHub {
  send(from: string, to: string | 'broadcast', message: AgentMessage): void;
  subscribe(agentId: string, handler: (msg: AgentMessage) => void): void;
  unsubscribe(agentId: string): void;
  getHistory(agentId?: string): readonly AgentMessage[];
  clear(): void;
  getMessageCount(): number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class MsgHubImpl implements MsgHub {
  private readonly _subscribers: Map<string, Array<(msg: AgentMessage) => void>>;
  private readonly _history: AgentMessage[];
  private readonly _eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this._subscribers = new Map();
    this._history = [];
    this._eventBus = eventBus;
  }

  send(from: string, to: string | 'broadcast', message: AgentMessage): void {
    if (message.from !== from) {
      throw new Error(
        `Message sender mismatch: expected '${from}', got '${message.from}'`,
      );
    }

    const finalMessage: AgentMessage = {
      ...message,
      id: message.id || generateId(),
      timestamp: message.timestamp || now(),
    };

    this._history.push(finalMessage);

    if (to === 'broadcast') {
      for (const [agentId, handlers] of this._subscribers.entries()) {
        if (agentId !== from) {
          for (const handler of handlers) {
            handler(finalMessage);
          }
        }
      }
      this._eventBus.emit({
        type: 'message:sent',
        payload: { from, to: 'broadcast', messageId: finalMessage.id },
        source: 'msghub',
      });
    } else {
      const handlers = this._subscribers.get(to);
      if (handlers) {
        for (const handler of handlers) {
          handler(finalMessage);
        }
      }
      this._eventBus.emit({
        type: 'message:sent',
        payload: { from, to, messageId: finalMessage.id },
        source: 'msghub',
      });
    }
  }

  subscribe(agentId: string, handler: (msg: AgentMessage) => void): void {
    if (!this._subscribers.has(agentId)) {
      this._subscribers.set(agentId, []);
    }
    this._subscribers.get(agentId)!.push(handler);
  }

  unsubscribe(agentId: string): void {
    this._subscribers.delete(agentId);
  }

  getHistory(agentId?: string): readonly AgentMessage[] {
    if (agentId === undefined) {
      return [...this._history];
    }
    return this._history.filter(
      (m) => m.from === agentId || m.to === agentId || m.to === 'broadcast',
    );
  }

  clear(): void {
    this._subscribers.clear();
    this._history.length = 0;
  }

  getMessageCount(): number {
    return this._history.length;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMsgHub(eventBus: EventBus): MsgHub {
  return new MsgHubImpl(eventBus);
}
