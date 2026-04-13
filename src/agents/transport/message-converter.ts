// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- Message Converter
 *
 * Bidirectional conversion between legacy AgentMessage (Phase 4)
 * and A2ATaskMessage (Phase 10b universal format).
 *
 * Source: Phase 10b LLD Section 2.2
 */

import type { AgentMessage } from '../msghub.js';
import type { A2ATaskMessage } from './types.js';
import { generateId } from '../../utils/id.js';
import { now } from '../../utils/time.js';

// ---------------------------------------------------------------------------
// Type Mapping Constants
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<AgentMessage['type'], A2ATaskMessage['type']> = {
  task: 'task',
  result: 'artifact',
  feedback: 'status',
  handoff: 'task',
  broadcast: 'task',
} as const;

const REVERSE_TYPE_MAP: Record<A2ATaskMessage['type'], AgentMessage['type']> = {
  task: 'task',
  artifact: 'result',
  status: 'feedback',
  cancel: 'task',
} as const;

// ---------------------------------------------------------------------------
// Message Converter
// ---------------------------------------------------------------------------

export class MessageConverter {
  /**
   * Convert internal AgentMessage to A2A v1.0 format.
   */
  toA2A(msg: AgentMessage, conversationId?: string): A2ATaskMessage {
    const metadata: Record<string, unknown> = {};
    if (msg.type === 'handoff') metadata.handoff = true;
    if (msg.type === 'broadcast') metadata.broadcast = true;

    return Object.freeze({
      id: msg.id,
      type: TYPE_MAP[msg.type],
      from: msg.from,
      to: msg.to,
      payload: {
        content: msg.content,
        contentType: 'text/plain',
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
      timestamp: msg.timestamp,
      ...(conversationId ? { conversationId } : {}),
    });
  }

  /**
   * Convert A2A v1.0 format back to internal AgentMessage.
   */
  fromA2A(msg: A2ATaskMessage): AgentMessage {
    let type: AgentMessage['type'] = REVERSE_TYPE_MAP[msg.type] ?? 'task';

    // Restore handoff/broadcast from metadata
    if (msg.type === 'task' && msg.payload.metadata?.handoff) {
      type = 'handoff';
    } else if (msg.type === 'task' && msg.payload.metadata?.broadcast) {
      type = 'broadcast';
    }

    let content = msg.payload.content;
    if (msg.type === 'cancel') {
      content = `[CANCELLED] ${content}`;
    }

    return Object.freeze({
      id: msg.id,
      from: msg.from,
      to: msg.to,
      content,
      type,
      timestamp: msg.timestamp,
    });
  }

  /**
   * Create a new A2ATaskMessage from scratch.
   */
  createA2AMessage(params: {
    readonly from: string;
    readonly to: string;
    readonly content: string;
    readonly type?: A2ATaskMessage['type'];
    readonly contentType?: string;
    readonly metadata?: Record<string, unknown>;
    readonly conversationId?: string;
  }): A2ATaskMessage {
    return Object.freeze({
      id: generateId(),
      type: params.type ?? 'task',
      from: params.from,
      to: params.to,
      payload: {
        content: params.content,
        contentType: params.contentType ?? 'text/plain',
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
      timestamp: now(),
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    });
  }

  /**
   * Normalize internal lowercase type to A2A v1.0 SCREAMING_SNAKE_CASE for wire.
   */
  toWireType(type: A2ATaskMessage['type']): string {
    return type.toUpperCase();
  }

  /**
   * Normalize A2A v1.0 SCREAMING_SNAKE_CASE from wire to internal lowercase.
   */
  fromWireType(wireType: string): A2ATaskMessage['type'] {
    return wireType.toLowerCase() as A2ATaskMessage['type'];
  }
}
