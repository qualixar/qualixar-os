// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 -- EventBus
 * LLD Section 2.8
 *
 * Synchronous event persistence to SQLite + async fire-and-forget handler
 * notification. Supports wildcard '*' subscriptions and ordered replay.
 *
 * Hard Rule #3: all SQL uses parameterized ? placeholders.
 * Hard Rule #6: handler type is (event: QosEvent) => Promise<void>.
 * Hard Rule #7: no global state.
 * Hard Rule #10: ESM .js extensions on imports.
 */

import type { QosDatabase } from '../db/database.js';
import type { QosEvent } from '../types/common.js';
import type { QosEventType } from '../types/events.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'EventBus' });

// ---------------------------------------------------------------------------
// Handler type alias
// ---------------------------------------------------------------------------

type EventHandler = (event: QosEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface EventBus {
  /** Persist event synchronously, notify handlers async (fire-and-forget). */
  emit(event: Omit<QosEvent, 'id' | 'timestamp'>): void;

  /** Subscribe a handler for a specific event type or '*' for all. */
  on(type: QosEventType | '*', handler: EventHandler): void;

  /** Unsubscribe a handler for a specific event type or '*'. */
  off(type: QosEventType | '*', handler: EventHandler): void;

  /** Replay persisted events with id > fromId, in order. Returns count. */
  replay(fromId: number, handler: EventHandler): Promise<number>;

  /** Return the highest persisted event id, or 0 if no events exist. */
  getLastEventId(): number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class EventBusImpl implements EventBus {
  private readonly _db: QosDatabase;
  private readonly _handlers: Map<string, Set<EventHandler>>;

  constructor(db: QosDatabase) {
    this._db = db;
    this._handlers = new Map();
  }

  emit(event: Omit<QosEvent, 'id' | 'timestamp'>): void {
    // 1. Generate timestamp
    const timestamp = new Date().toISOString();

    // 2. Serialize payload
    const serializedPayload = JSON.stringify(event.payload);

    // 3. Persist synchronously via prepared statement
    const result = this._db.db
      .prepare(
        'INSERT INTO events (type, payload, source, task_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        event.type,
        serializedPayload,
        event.source,
        event.taskId ?? null,
        timestamp,
      );

    // 4. Get inserted id
    const insertedId = Number(result.lastInsertRowid);

    // 5. Construct full event object (immutable)
    const fullEvent: QosEvent = {
      id: insertedId,
      type: event.type,
      payload: event.payload,
      source: event.source,
      taskId: event.taskId,
      timestamp,
    };

    // 6. Get type-specific handlers
    const typeHandlers = this._handlers.get(event.type) ?? new Set<EventHandler>();

    // 7. Get wildcard handlers
    const wildcardHandlers = this._handlers.get('*') ?? new Set<EventHandler>();

    // 8-9. Fire-and-forget: invoke all handlers with try/catch per handler
    for (const handler of typeHandlers) {
      this._invokeHandler(handler, fullEvent);
    }
    for (const handler of wildcardHandlers) {
      this._invokeHandler(handler, fullEvent);
    }
  }

  on(type: QosEventType | '*', handler: EventHandler): void {
    let handlerSet = this._handlers.get(type);
    if (!handlerSet) {
      handlerSet = new Set();
      this._handlers.set(type, handlerSet);
    }
    handlerSet.add(handler);
  }

  off(type: QosEventType | '*', handler: EventHandler): void {
    const handlerSet = this._handlers.get(type);
    if (!handlerSet) {
      return;
    }
    handlerSet.delete(handler);
    if (handlerSet.size === 0) {
      this._handlers.delete(type);
    }
  }

  async replay(
    fromId: number,
    handler: EventHandler,
  ): Promise<number> {
    // 1. Query events with id > fromId, ordered ascending
    const rows = this._db.query<{
      id: number;
      type: QosEventType;
      payload: string;
      source: string;
      task_id: string | null;
      created_at: string;
    }>(
      'SELECT id, type, payload, source, task_id, created_at FROM events WHERE id > ? ORDER BY id ASC',
      [fromId],
    );

    // 2-4. Replay each event sequentially
    let count = 0;
    for (const row of rows) {
      const event: QosEvent = {
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        source: row.source,
        taskId: row.task_id ?? undefined,
        timestamp: row.created_at,
      };
      await handler(event);
      count++;
    }

    return count;
  }

  getLastEventId(): number {
    const result = this._db.get<{ maxId: number | null }>(
      'SELECT MAX(id) as maxId FROM events',
    );

    if (!result || result.maxId === null) {
      return 0;
    }

    return result.maxId;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Fire-and-forget handler invocation with per-handler error isolation. */
  private _invokeHandler(handler: EventHandler, event: QosEvent): void {
    // Do NOT await -- fire-and-forget. Errors caught and logged.
    handler(event).catch((err: unknown) => {
      logger.error({ err }, 'handler error');
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new EventBus instance backed by the given database.
 * @param db - QosDatabase (events table must already exist).
 */
export function createEventBus(db: QosDatabase): EventBus {
  return new EventBusImpl(db);
}
