/**
 * Qualixar OS V2 -- EventBus Tests
 *
 * LLD Section 6, Step 6 (tests #37-49).
 * Tests: emit, on, off, wildcard, persistence, replay, getLastEventId.
 * All tests use :memory: database via beforeEach.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import type { QosEvent } from '../../src/types/common.js';
import type { QosEventType } from '../../src/types/events.js';

// ---------------------------------------------------------------------------
// Test Setup -- fresh :memory: database + EventBus for each test
// ---------------------------------------------------------------------------

let db: QosDatabase;
let bus: EventBus;

beforeEach(() => {
  db = createDatabase(':memory:');
  bus = createEventBus(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed in some tests
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait briefly for fire-and-forget async handler invocations to settle. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('EventBus', () => {
  // -------------------------------------------------------------------------
  // #37: emit fires registered handler for matching type
  // -------------------------------------------------------------------------

  it('#37 emit fires registered handler for matching type', async () => {
    const received: QosEvent[] = [];
    const handler = async (event: QosEvent): Promise<void> => {
      received.push(event);
    };

    bus.on('task:created', handler);
    bus.emit({
      type: 'task:created',
      payload: { prompt: 'hello' },
      source: 'test',
    });

    await tick();

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('task:created');
  });

  // -------------------------------------------------------------------------
  // #38: handler receives correct event payload
  // -------------------------------------------------------------------------

  it('#38 handler receives correct event payload', async () => {
    let capturedEvent: QosEvent | null = null;
    const handler = async (event: QosEvent): Promise<void> => {
      capturedEvent = event;
    };

    bus.on('task:started', handler);
    bus.emit({
      type: 'task:started',
      payload: { taskId: 't-001', mode: 'companion' },
      source: 'orchestrator',
    });

    await tick();

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.type).toBe('task:started');
    expect(capturedEvent!.payload).toEqual({ taskId: 't-001', mode: 'companion' });
    expect(capturedEvent!.source).toBe('orchestrator');
    expect(capturedEvent!.id).toBeGreaterThan(0);
    expect(capturedEvent!.timestamp).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // #39: off removes handler
  // -------------------------------------------------------------------------

  it('#39 off removes handler', async () => {
    const received: QosEvent[] = [];
    const handler = async (event: QosEvent): Promise<void> => {
      received.push(event);
    };

    bus.on('task:created', handler);
    bus.off('task:created', handler);

    bus.emit({
      type: 'task:created',
      payload: {},
      source: 'test',
    });

    await tick();

    expect(received).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // #40: wildcard * handler receives all event types
  // -------------------------------------------------------------------------

  it('#40 wildcard * handler receives all event types', async () => {
    const received: QosEvent[] = [];
    const handler = async (event: QosEvent): Promise<void> => {
      received.push(event);
    };

    bus.on('*', handler);

    bus.emit({ type: 'task:created', payload: {}, source: 'a' });
    bus.emit({ type: 'system:started', payload: {}, source: 'b' });
    bus.emit({ type: 'cost:recorded', payload: {}, source: 'c' });

    await tick();

    expect(received).toHaveLength(3);
    const types = received.map((e) => e.type);
    expect(types).toContain('task:created');
    expect(types).toContain('system:started');
    expect(types).toContain('cost:recorded');
  });

  // -------------------------------------------------------------------------
  // #41: emit persists event to events table
  // -------------------------------------------------------------------------

  it('#41 emit persists event to events table', () => {
    bus.emit({
      type: 'system:started',
      payload: { version: '2.0.0' },
      source: 'bootstrap',
    });

    const rows = db.query<{ id: number; type: string }>(
      'SELECT * FROM events',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('system:started');
  });

  // -------------------------------------------------------------------------
  // #42: persisted event has correct type, payload, source
  // -------------------------------------------------------------------------

  it('#42 persisted event has correct type, payload, source', () => {
    bus.emit({
      type: 'task:completed',
      payload: { result: 'success', duration: 1500 },
      source: 'worker-agent',
      taskId: 'task-xyz',
    });

    const row = db.get<{
      id: number;
      type: string;
      payload: string;
      source: string;
      task_id: string | null;
      created_at: string;
    }>('SELECT * FROM events WHERE id = 1');

    expect(row).toBeDefined();
    expect(row!.type).toBe('task:completed');
    expect(JSON.parse(row!.payload)).toEqual({ result: 'success', duration: 1500 });
    expect(row!.source).toBe('worker-agent');
    expect(row!.task_id).toBe('task-xyz');
    expect(row!.created_at).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // #43: replay replays events from offset in correct order
  // -------------------------------------------------------------------------

  it('#43 replay replays events from offset in correct order', async () => {
    // Emit 3 events
    bus.emit({ type: 'task:created', payload: { n: 1 }, source: 'test' });
    bus.emit({ type: 'task:started', payload: { n: 2 }, source: 'test' });
    bus.emit({ type: 'task:completed', payload: { n: 3 }, source: 'test' });

    const replayed: QosEvent[] = [];
    const handler = async (event: QosEvent): Promise<void> => {
      replayed.push(event);
    };

    // Replay from id 1 -- should get events 2 and 3
    const count = await bus.replay(1, handler);

    expect(count).toBe(2);
    expect(replayed).toHaveLength(2);
    expect(replayed[0].payload).toEqual({ n: 2 });
    expect(replayed[1].payload).toEqual({ n: 3 });
  });

  // -------------------------------------------------------------------------
  // #44: replay skips events at or below fromId
  // -------------------------------------------------------------------------

  it('#44 replay skips events at or below fromId', async () => {
    bus.emit({ type: 'task:created', payload: { n: 1 }, source: 'test' });
    bus.emit({ type: 'task:started', payload: { n: 2 }, source: 'test' });
    bus.emit({ type: 'task:completed', payload: { n: 3 }, source: 'test' });

    const replayed: QosEvent[] = [];
    const handler = async (event: QosEvent): Promise<void> => {
      replayed.push(event);
    };

    // Replay from id 2 -- should only get event 3
    const count = await bus.replay(2, handler);

    expect(count).toBe(1);
    expect(replayed).toHaveLength(1);
    expect(replayed[0].id).toBe(3);
    expect(replayed[0].payload).toEqual({ n: 3 });
  });

  // -------------------------------------------------------------------------
  // #45: replay returns count of replayed events
  // -------------------------------------------------------------------------

  it('#45 replay returns count of replayed events', async () => {
    bus.emit({ type: 'task:created', payload: {}, source: 'test' });
    bus.emit({ type: 'task:started', payload: {}, source: 'test' });
    bus.emit({ type: 'task:completed', payload: {}, source: 'test' });
    bus.emit({ type: 'task:failed', payload: {}, source: 'test' });

    const handler = async (_event: QosEvent): Promise<void> => {};

    // Replay from 0 -- all 4 events
    const count = await bus.replay(0, handler);
    expect(count).toBe(4);
  });

  // -------------------------------------------------------------------------
  // #46: getLastEventId returns 0 for empty table
  // -------------------------------------------------------------------------

  it('#46 getLastEventId returns 0 for empty table', () => {
    const lastId = bus.getLastEventId();
    expect(lastId).toBe(0);
  });

  // -------------------------------------------------------------------------
  // #47: getLastEventId returns correct id after emits
  // -------------------------------------------------------------------------

  it('#47 getLastEventId returns correct id after emits', () => {
    bus.emit({ type: 'task:created', payload: {}, source: 'test' });
    bus.emit({ type: 'task:started', payload: {}, source: 'test' });
    bus.emit({ type: 'task:completed', payload: {}, source: 'test' });

    const lastId = bus.getLastEventId();
    expect(lastId).toBe(3);
  });

  // -------------------------------------------------------------------------
  // #48: multiple handlers on same event type all fire
  // -------------------------------------------------------------------------

  it('#48 multiple handlers on same event type all fire', async () => {
    const results: string[] = [];

    const handlerA = async (_event: QosEvent): Promise<void> => {
      results.push('A');
    };
    const handlerB = async (_event: QosEvent): Promise<void> => {
      results.push('B');
    };

    bus.on('task:created', handlerA);
    bus.on('task:created', handlerB);

    bus.emit({ type: 'task:created', payload: {}, source: 'test' });

    await tick();

    expect(results).toHaveLength(2);
    expect(results).toContain('A');
    expect(results).toContain('B');
  });

  // -------------------------------------------------------------------------
  // #49: handler error does not prevent other handlers
  // -------------------------------------------------------------------------

  it('#49 handler error does not prevent other handlers', async () => {
    // DEF-027: EventBus now uses pino logger instead of console.error
    // Spy on console.error as fallback and suppress pino output
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results: string[] = [];

    const throwingHandler = async (_event: QosEvent): Promise<void> => {
      throw new Error('Handler exploded');
    };
    const safeHandler = async (_event: QosEvent): Promise<void> => {
      results.push('safe');
    };

    bus.on('task:created', throwingHandler);
    bus.on('task:created', safeHandler);

    bus.emit({ type: 'task:created', payload: {}, source: 'test' });

    await tick();

    // The safe handler should still fire despite the throwing handler
    expect(results).toContain('safe');

    // Error was logged via pino logger (which writes to stdout/stderr).
    // The key assertion is that the safe handler still ran despite the error.

    consoleErrorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Coverage: off() on unregistered type does not throw
  // -------------------------------------------------------------------------

  it('off() on unregistered type is a no-op', () => {
    const handler = async (_event: QosEvent): Promise<void> => {};
    // Calling off() for a type that was never registered should not throw
    expect(() => bus.off('system:error', handler)).not.toThrow();
  });
});
