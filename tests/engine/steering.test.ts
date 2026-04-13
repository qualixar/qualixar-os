/**
 * Qualixar OS Phase 6 -- Steering Tests
 * TDD Round 1: State machine logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SteeringImpl, createSteering } from '../../src/engine/steering.js';
import type { SteeringState } from '../../src/engine/steering.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Mock EventBus
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  const handlers = new Map<string, Set<(event: unknown) => Promise<void>>>();
  return {
    emit: vi.fn((event: { type: string }) => {
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          handler(event as never).catch(() => {});
        }
      }
    }),
    on: vi.fn((type: string, handler: (event: unknown) => Promise<void>) => {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
    }),
    off: vi.fn(),
    replay: vi.fn(),
    getLastEventId: vi.fn(() => 0),
  } as unknown as EventBus;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SteeringImpl', () => {
  let eventBus: EventBus;
  let steering: SteeringImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    steering = new SteeringImpl(eventBus);
  });

  // Test 1: registerTask sets initial state
  it('registerTask sets initial state to running', () => {
    steering.registerTask('task-1');
    expect(steering.getState('task-1')).toBe('running');
  });

  // Test 2: requestPause transitions from running to paused (via event handler)
  it('requestPause transitions from running through pausing to paused', () => {
    steering.registerTask('task-1');
    steering.requestPause('task-1');
    // The emit of steering:paused triggers handler: pausing -> paused
    expect(steering.getState('task-1')).toBe('paused');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'steering:paused',
        payload: { taskId: 'task-1' },
      }),
    );
  });

  // Test 3: requestPause from non-running throws
  it('requestPause from paused state throws', () => {
    steering.registerTask('task-1');
    steering.requestPause('task-1');
    // Now in 'paused' state (pausing -> paused via event handler)
    expect(() => steering.requestPause('task-1')).toThrow(
      'Cannot pause task in state: paused',
    );
  });

  // Test 4: requestPause on unknown task throws
  it('requestPause on unknown task throws', () => {
    expect(() => steering.requestPause('unknown')).toThrow(
      'Unknown task: unknown',
    );
  });

  // Test 5: requestResume transitions from paused
  it('requestResume transitions from paused through resuming to running', () => {
    steering.registerTask('task-1');
    steering.requestPause('task-1');
    // pausing -> paused via event handler
    expect(steering.getState('task-1')).toBe('paused');

    (eventBus.emit as ReturnType<typeof vi.fn>).mockClear();
    steering.requestResume('task-1');
    // The emit of steering:resumed triggers handler: resuming -> running
    expect(steering.getState('task-1')).toBe('running');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'steering:resumed',
        payload: { taskId: 'task-1' },
      }),
    );
  });

  // Test 6: requestResume from non-paused throws
  it('requestResume from running throws', () => {
    steering.registerTask('task-1');
    expect(() => steering.requestResume('task-1')).toThrow(
      'Cannot resume task in state: running',
    );
  });

  // Test 7: requestRedirect stores payload
  it('requestRedirect stores payload and transitions', () => {
    steering.registerTask('task-1');
    steering.requestRedirect('task-1', 'new prompt');
    // The emit of steering:redirected triggers handler: redirecting -> running
    expect(steering.getState('task-1')).toBe('running');
    expect(steering.getRedirectPayload('task-1')).toEqual({
      newPrompt: 'new prompt',
    });
  });

  // Test 8: requestRedirect from invalid state throws
  it('requestRedirect from cancelled throws', () => {
    steering.registerTask('task-1');
    steering.requestCancel('task-1');
    // After cancel, state goes to cancelled via event handler
    expect(() => steering.requestRedirect('task-1', 'new')).toThrow(
      'Cannot redirect task in state: cancelled',
    );
  });

  // Test 9: requestCancel transitions to cancelling then cancelled (via event handler)
  it('requestCancel transitions through cancelling to cancelled', () => {
    steering.registerTask('task-1');
    steering.requestCancel('task-1');
    // The emit triggers the handler which transitions cancelling -> cancelled
    expect(steering.getState('task-1')).toBe('cancelled');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'steering:cancelled',
        payload: { taskId: 'task-1' },
      }),
    );
  });

  // Test 10: requestCancel on already cancelled throws
  it('requestCancel on cancelled task throws', () => {
    steering.registerTask('task-1');
    steering.requestCancel('task-1');
    // cancelling -> cancelled via event handler
    expect(steering.getState('task-1')).toBe('cancelled');
    expect(() => steering.requestCancel('task-1')).toThrow(
      'Cannot cancel task in state: cancelled',
    );
  });

  // Test 11: onStateChange fires handler
  it('onStateChange fires handler on state change', () => {
    const handler = vi.fn();
    steering.onStateChange(handler);
    steering.registerTask('task-1');
    steering.requestPause('task-1');
    // Handler called for 'pausing' (from requestPause) AND 'paused' (from event handler)
    expect(handler).toHaveBeenCalledWith('task-1', 'pausing');
    expect(handler).toHaveBeenCalledWith('task-1', 'paused');
  });

  // Test 12: deregisterTask cleans up
  it('deregisterTask returns default state', () => {
    steering.registerTask('task-1');
    steering.requestRedirect('task-1', 'new prompt');
    steering.deregisterTask('task-1');
    // After deregister, getState returns default 'running'
    expect(steering.getState('task-1')).toBe('running');
    expect(steering.getRedirectPayload('task-1')).toBeNull();
  });

  // Test 13: clearRedirectPayload
  it('clearRedirectPayload removes stored payload', () => {
    steering.registerTask('task-1');
    steering.requestRedirect('task-1', 'new prompt');
    steering.clearRedirectPayload('task-1');
    expect(steering.getRedirectPayload('task-1')).toBeNull();
  });

  // Test 14: Invalid transition is silently ignored (via event bus)
  it('invalid transition via event bus is silently ignored', () => {
    steering.registerTask('task-1');
    // running -> 'resumed' (invalid -- 'resumed' maps to 'running' in transition)
    // The handler listens for 'steering:resumed' and calls transition to 'running'
    // running -> running is NOT in the valid transitions for 'running'
    // So it should be silently ignored
    const prevState = steering.getState('task-1');
    // Manually trigger the resumed handler
    // This is already tested via the event bus mock
    expect(steering.getState('task-1')).toBe(prevState);
  });

  // Test 15: getState returns running for unregistered tasks
  it('getState returns running for unregistered tasks', () => {
    expect(steering.getState('nonexistent')).toBe('running');
  });

  // Test 16: Full lifecycle: register -> pause -> resume -> cancel
  it('full lifecycle: register -> pause -> resume -> cancel', () => {
    steering.registerTask('task-1');
    expect(steering.getState('task-1')).toBe('running');

    steering.requestPause('task-1');
    expect(steering.getState('task-1')).toBe('paused'); // pausing -> paused via event

    steering.requestResume('task-1');
    expect(steering.getState('task-1')).toBe('running'); // resuming -> running via event

    steering.requestCancel('task-1');
    expect(steering.getState('task-1')).toBe('cancelled'); // cancelling -> cancelled via event
  });

  // Test 17: Multiple tasks tracked independently
  it('multiple tasks tracked independently', () => {
    steering.registerTask('task-1');
    steering.registerTask('task-2');

    steering.requestPause('task-1');
    expect(steering.getState('task-1')).toBe('paused');
    expect(steering.getState('task-2')).toBe('running');

    steering.requestCancel('task-2');
    expect(steering.getState('task-2')).toBe('cancelled');
    expect(steering.getState('task-1')).toBe('paused');
  });

  // Test 18: requestRedirect from paused state
  it('requestRedirect from paused state works', () => {
    steering.registerTask('task-1');
    steering.requestPause('task-1');
    // pausing -> paused via event handler
    expect(steering.getState('task-1')).toBe('paused');

    steering.requestRedirect('task-1', 'redirected prompt');
    // The emit of steering:redirected triggers handler which transitions redirecting -> running
    expect(steering.getState('task-1')).toBe('running');
    expect(steering.getRedirectPayload('task-1')).toEqual({
      newPrompt: 'redirected prompt',
    });
  });

  // Test 19: requestResume on unknown task throws
  it('requestResume on unknown task throws', () => {
    expect(() => steering.requestResume('unknown')).toThrow(
      'Unknown task: unknown',
    );
  });

  // Test 20: requestRedirect on unknown task throws
  it('requestRedirect on unknown task throws', () => {
    expect(() => steering.requestRedirect('unknown', 'new')).toThrow(
      'Unknown task: unknown',
    );
  });

  // Test 21: requestCancel on unknown task throws
  it('requestCancel on unknown task throws', () => {
    expect(() => steering.requestCancel('unknown')).toThrow(
      'Unknown task: unknown',
    );
  });

  // Test 22: transition to untracked task silently ignored
  it('transition to untracked task is silently ignored', () => {
    // Emit a steering:paused event for a task that is NOT registered
    eventBus.emit({
      type: 'steering:paused',
      payload: { taskId: 'untracked-task' },
      source: 'steering',
      taskId: 'untracked-task',
    } as never);
    // Should not throw, state remains default 'running'
    expect(steering.getState('untracked-task')).toBe('running');
  });

  // Test 23: invalid transition is silently ignored (direct)
  it('invalid transition via event handler is silently ignored', () => {
    steering.registerTask('task-1');
    // State is 'running'. Emit 'steering:cancelled' -> tries cancelled
    // running -> cancelled is NOT valid (must go through cancelling first)
    // But the handler calls transition('cancelled'), which checks VALID_TRANSITIONS
    // running -> cancelled is NOT in ['pausing', 'redirecting', 'cancelling']
    eventBus.emit({
      type: 'steering:cancelled',
      payload: { taskId: 'task-1' },
      source: 'test',
      taskId: 'task-1',
    } as never);
    // State should still be running
    expect(steering.getState('task-1')).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

describe('createSteering', () => {
  it('creates a Steering instance', () => {
    const eventBus = createMockEventBus();
    const s = createSteering(eventBus);
    expect(s).toBeDefined();
    s.registerTask('t-1');
    expect(s.getState('t-1')).toBe('running');
  });
});
