// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Steering
 * LLD Section 2.1
 *
 * Real-time pause/resume/redirect/cancel state machine.
 * Tracks per-task steering state and notifies handlers on transitions.
 *
 * Valid state transitions:
 *   running   -> pausing, redirecting, cancelling
 *   pausing   -> paused, cancelling
 *   paused    -> resuming, redirecting, cancelling
 *   resuming  -> running, cancelling
 *   redirecting -> running, cancelling
 *   cancelling -> cancelled
 *   cancelled -> (terminal)
 */

import type { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SteeringState =
  | 'running'
  | 'pausing'
  | 'paused'
  | 'resuming'
  | 'redirecting'
  | 'cancelling'
  | 'cancelled';

export interface SteeringRedirectPayload {
  readonly newPrompt: string;
}

export type SteeringStateChangeHandler = (
  taskId: string,
  state: SteeringState,
) => void;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Steering {
  requestPause(taskId: string): void;
  requestResume(taskId: string): void;
  requestRedirect(taskId: string, newPrompt: string): void;
  requestCancel(taskId: string): void;
  getState(taskId: string): SteeringState;
  getRedirectPayload(taskId: string): SteeringRedirectPayload | null;
  clearRedirectPayload(taskId: string): void;
  onStateChange(handler: SteeringStateChangeHandler): void;
  registerTask(taskId: string): void;
  deregisterTask(taskId: string): void;
}

// ---------------------------------------------------------------------------
// Valid Transitions Map
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SteeringState, readonly SteeringState[]> = {
  running: ['pausing', 'redirecting', 'cancelling'],
  pausing: ['paused', 'cancelling'],
  paused: ['resuming', 'redirecting', 'cancelling'],
  resuming: ['running', 'cancelling'],
  redirecting: ['running', 'cancelling'],
  cancelling: ['cancelled'],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SteeringImpl implements Steering {
  private readonly states = new Map<string, SteeringState>();
  private readonly redirectPayloads = new Map<string, SteeringRedirectPayload>();
  private readonly handlers: SteeringStateChangeHandler[] = [];
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    // H-12 DOCUMENTED: Subscribe to EventBus steering events for external transitions.
    // INTENTIONAL SELF-REFERENCE: requestPause() emits 'steering:paused' which triggers
    // transition('paused') here. This is by design — the emit notifies external listeners
    // (WebSocket, dashboard) while the handler below completes the state machine transition
    // from 'pausing' → 'paused'. The transition() method has a built-in guard that skips
    // if already in the target state, preventing infinite loops.
    this.eventBus.on('steering:paused', async (e) => {
      const taskId = e.payload.taskId as string;
      this.transition(taskId, 'paused');
    });
    this.eventBus.on('steering:resumed', async (e) => {
      const taskId = e.payload.taskId as string;
      this.transition(taskId, 'running');
    });
    this.eventBus.on('steering:redirected', async (e) => {
      const taskId = e.payload.taskId as string;
      this.transition(taskId, 'running');
    });
    this.eventBus.on('steering:cancelled', async (e) => {
      const taskId = e.payload.taskId as string;
      this.transition(taskId, 'cancelled');
    });
  }

  registerTask(taskId: string): void {
    this.states.set(taskId, 'running');
  }

  deregisterTask(taskId: string): void {
    this.states.delete(taskId);
    this.redirectPayloads.delete(taskId);
  }

  requestPause(taskId: string): void {
    const state = this.states.get(taskId);
    if (state === undefined) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (state !== 'running') {
      throw new Error(`Cannot pause task in state: ${state}`);
    }
    this.states.set(taskId, 'pausing');
    this.eventBus.emit({
      type: 'steering:paused',
      payload: { taskId },
      source: 'steering',
      taskId,
    });
    this.notifyHandlers(taskId, 'pausing');
  }

  requestResume(taskId: string): void {
    const state = this.states.get(taskId);
    if (state === undefined) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (state !== 'paused') {
      throw new Error(`Cannot resume task in state: ${state}`);
    }
    this.states.set(taskId, 'resuming');
    this.eventBus.emit({
      type: 'steering:resumed',
      payload: { taskId },
      source: 'steering',
      taskId,
    });
    this.notifyHandlers(taskId, 'resuming');
  }

  requestRedirect(taskId: string, newPrompt: string): void {
    const state = this.states.get(taskId);
    if (state === undefined) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (state !== 'running' && state !== 'paused') {
      throw new Error(`Cannot redirect task in state: ${state}`);
    }
    this.redirectPayloads.set(taskId, { newPrompt });
    this.states.set(taskId, 'redirecting');
    this.eventBus.emit({
      type: 'steering:redirected',
      payload: { taskId, newPrompt },
      source: 'steering',
      taskId,
    });
    this.notifyHandlers(taskId, 'redirecting');
  }

  requestCancel(taskId: string): void {
    const state = this.states.get(taskId);
    if (state === undefined) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (state === 'cancelled') {
      throw new Error(`Cannot cancel task in state: ${state}`);
    }
    this.states.set(taskId, 'cancelling');
    this.eventBus.emit({
      type: 'steering:cancelled',
      payload: { taskId },
      source: 'steering',
      taskId,
    });
    this.notifyHandlers(taskId, 'cancelling');
  }

  getState(taskId: string): SteeringState {
    return this.states.get(taskId) ?? 'running';
  }

  getRedirectPayload(taskId: string): SteeringRedirectPayload | null {
    return this.redirectPayloads.get(taskId) ?? null;
  }

  clearRedirectPayload(taskId: string): void {
    this.redirectPayloads.delete(taskId);
  }

  onStateChange(handler: SteeringStateChangeHandler): void {
    this.handlers.push(handler);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private transition(taskId: string, targetState: SteeringState): void {
    const currentState = this.states.get(taskId);
    if (currentState === undefined) {
      return; // Task not tracked
    }

    // H-12 FIX: Guard against self-referential no-op transitions.
    // If already in the target state, skip to prevent redundant handler notifications.
    if (currentState === targetState) {
      return;
    }

    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed.includes(targetState)) {
      return; // Invalid transition -- silently ignore (events may arrive out of order)
    }

    this.states.set(taskId, targetState);
    this.notifyHandlers(taskId, targetState);
  }

  private notifyHandlers(taskId: string, state: SteeringState): void {
    for (const handler of this.handlers) {
      handler(taskId, state);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSteering(eventBus: EventBus): Steering {
  return new SteeringImpl(eventBus);
}
