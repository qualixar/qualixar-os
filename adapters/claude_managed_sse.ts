// Copyright (c) 2026 Varun Pratap Bhardwaj | Qualixar OS | FSL-1.1-ALv2
/**
 * SSE (Server-Sent Events) parser for Claude Managed Agents streaming.
 * Extracted from claude_managed_adapter.ts to stay under 800-line cap.
 *
 * Parses raw SSE lines into ClaudeManagedEvent objects following the W3C SSE
 * specification with Anthropic-specific event type handling.
 *
 * All event formats are [ASSUMED -- R-2] and may change after research verification.
 */

import type { ClaudeManagedEvent, ClaudeManagedEventType } from './claude_managed_types.js';

// ---------------------------------------------------------------------------
// Valid event types (used for safe fallback)
// ---------------------------------------------------------------------------

const VALID_EVENT_TYPES = new Set<ClaudeManagedEventType>([
  'message_start', 'content_block_start', 'content_block_delta',
  'content_block_stop', 'message_delta', 'message_stop', 'error', 'ping',
]);

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

export class SSEParser {
  private eventType = '';
  private dataBuffer: string[] = [];
  private eventId: string | undefined;

  /**
   * Parse a single SSE line and return a complete event or null.
   * Empty lines signal event completion per the W3C SSE spec.
   */
  parseLine(line: string): ClaudeManagedEvent | null {
    const trimmed = line.replace(/\r?\n$/, '');

    // Empty line = event boundary
    if (trimmed === '') {
      return this.dispatch();
    }

    // Comment lines (start with ':') are ignored per SSE spec
    if (trimmed.startsWith(':')) {
      return null;
    }

    // Parse field:value
    const colonIdx = trimmed.indexOf(':');
    let field: string;
    let value: string;
    if (colonIdx >= 0) {
      field = trimmed.slice(0, colonIdx);
      value = trimmed.slice(colonIdx + 1);
      // SSE spec: strip single leading space from value
      if (value.startsWith(' ')) value = value.slice(1);
    } else {
      field = trimmed;
      value = '';
    }

    if (field === 'event') this.eventType = value;
    else if (field === 'data') this.dataBuffer.push(value);
    else if (field === 'id') this.eventId = value;
    // "retry" and unknown fields are ignored

    return null;
  }

  private dispatch(): ClaudeManagedEvent | null {
    if (this.dataBuffer.length === 0) {
      this.reset();
      return null;
    }

    const rawData = this.dataBuffer.join('\n');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      this.reset();
      return null;
    }

    const resolvedType = (data.type as string) ?? this.eventType ?? 'ping';
    const eventType: ClaudeManagedEventType = VALID_EVENT_TYPES.has(resolvedType as ClaudeManagedEventType)
      ? (resolvedType as ClaudeManagedEventType)
      : 'ping'; // Safe fallback for unknown types

    const event: ClaudeManagedEvent = {
      type: eventType,
      data,
      eventId: this.eventId,
      timestampMs: Date.now(),
    };

    this.reset();
    return event;
  }

  private reset(): void {
    this.eventType = '';
    this.dataBuffer = [];
    this.eventId = undefined;
  }
}
