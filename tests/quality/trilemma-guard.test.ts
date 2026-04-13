/**
 * Phase C2 -- Trilemma Guard Tests
 *
 * Wang et al. impossibility: self-evolution + isolation + safety
 * are mutually exclusive. Guard monitors escape hatches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTrilemmaGuard, type TrilemmaGuard } from '../../src/quality/trilemma-guard.js';
import type { EventBus } from '../../src/events/event-bus.js';

function createMockEventBus(): EventBus {
  return { emit: vi.fn(), on: vi.fn().mockReturnValue(() => {}), off: vi.fn() } as unknown as EventBus;
}

describe('TrilemmaGuard', () => {
  let guard: TrilemmaGuard;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createMockEventBus();
    guard = createTrilemmaGuard(eventBus);
  });

  it('reports safe when no self-evolution active', () => {
    const status = guard.getStatus();
    expect(status.selfEvolution).toBe(false);
    expect(status.safetyLevel).toBe('safe');
  });

  it('reports safe when self-evolution + 2+ escape hatches', () => {
    guard.recordRedesignCycle();
    guard.recordDifferentModelJudge();
    guard.recordDriftCheck(true);

    const status = guard.getStatus();
    expect(status.selfEvolution).toBe(true);
    expect(status.activeEscapeHatches).toBeGreaterThanOrEqual(2);
    expect(status.safetyLevel).toBe('safe');
  });

  it('reports degraded when self-evolution + only 1 escape hatch', () => {
    guard.recordRedesignCycle();
    guard.recordDifferentModelJudge();

    const status = guard.getStatus();
    expect(status.safetyLevel).toBe('degraded');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trilemma:degraded' }),
    );
  });

  it('reports unsafe when self-evolution + 0 escape hatches', () => {
    guard.recordRedesignCycle();

    const status = guard.getStatus();
    expect(status.safetyLevel).toBe('unsafe');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trilemma:unsafe' }),
    );
  });

  it('counts all 4 escape hatches correctly', () => {
    guard.recordRedesignCycle();
    guard.recordDifferentModelJudge();
    guard.recordHumanGate();
    guard.recordDriftCheck(true);
    guard.recordCalibration();

    const status = guard.getStatus();
    expect(status.activeEscapeHatches).toBe(4);
    expect(status.externalGrounding.differentModelJudges).toBe(true);
    expect(status.externalGrounding.humanGatesActive).toBe(true);
    expect(status.externalGrounding.driftBoundsActive).toBe(true);
    expect(status.externalGrounding.calibrationActive).toBe(true);
  });

  it('drift bounds inactive when majority of checks are out of bounds', () => {
    guard.recordRedesignCycle();
    guard.recordDriftCheck(false);
    guard.recordDriftCheck(false);
    guard.recordDriftCheck(true);

    const status = guard.getStatus();
    expect(status.externalGrounding.driftBoundsActive).toBe(false);
  });
});
