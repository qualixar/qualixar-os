/**
 * Goodhart Wiring Tests -- Wire GoodhartDetector to EventBus
 *
 * Verifies that judge events (verdict, approved, rejected) are
 * automatically fed to the GoodhartDetector, and that elevated
 * risk triggers a goodhart:risk_elevated event.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import {
  createGoodhartDetector,
  type GoodhartDetector,
} from '../../src/quality/goodhart-detector.js';
import { wireGoodhartToEventBus } from '../../src/quality/goodhart-wiring.js';
import type { QosEvent } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: QosDatabase;
let bus: EventBus;
let detector: GoodhartDetector;

/** Wait for fire-and-forget async handlers to settle. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  db = createDatabase(':memory:');
  bus = createEventBus(db);
  detector = createGoodhartDetector({ windowSize: 20, minDataPoints: 3 });
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireGoodhartToEventBus', () => {
  it('subscribes to judge:verdict and calls recordVerdict', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'gpt-4.1', score: 0.85 },
      source: 'test',
      taskId: 'task-1',
    });

    await tick();

    expect(spy).toHaveBeenCalledWith('task-1', 'gpt-4.1', 0.85);
  });

  it('subscribes to judge:approved and calls recordVerdict', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    bus.emit({
      type: 'judge:approved',
      payload: { judgeModel: 'claude-sonnet-4-6', score: 0.9 },
      source: 'test',
      taskId: 'task-2',
    });

    await tick();

    expect(spy).toHaveBeenCalledWith('task-2', 'claude-sonnet-4-6', 0.9);
  });

  it('subscribes to judge:rejected and calls recordVerdict', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    bus.emit({
      type: 'judge:rejected',
      payload: { judgeModel: 'gpt-4.1', score: 0.3 },
      source: 'test',
      taskId: 'task-3',
    });

    await tick();

    expect(spy).toHaveBeenCalledWith('task-3', 'gpt-4.1', 0.3);
  });

  it('does NOT call recordVerdict when score is missing', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'gpt-4.1' },
      source: 'test',
      taskId: 'task-4',
    });

    await tick();

    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT call recordVerdict when judgeModel is missing', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    bus.emit({
      type: 'judge:verdict',
      payload: { score: 0.8 },
      source: 'test',
      taskId: 'task-5',
    });

    await tick();

    expect(spy).not.toHaveBeenCalled();
  });

  it('uses taskId from event, falls back to payload.taskId, then "unknown"', async () => {
    const spy = vi.spyOn(detector, 'recordVerdict');
    wireGoodhartToEventBus(detector, bus);

    // Case 1: event.taskId present
    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'model-a', score: 0.7, taskId: 'payload-task' },
      source: 'test',
      taskId: 'event-task',
    });

    await tick();
    expect(spy).toHaveBeenCalledWith('event-task', 'model-a', 0.7);

    spy.mockClear();

    // Case 2: no event.taskId, payload.taskId present
    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'model-b', score: 0.6, taskId: 'payload-task' },
      source: 'test',
    });

    await tick();
    expect(spy).toHaveBeenCalledWith('payload-task', 'model-b', 0.6);

    spy.mockClear();

    // Case 3: no taskId anywhere
    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'model-c', score: 0.5 },
      source: 'test',
    });

    await tick();
    expect(spy).toHaveBeenCalledWith('unknown', 'model-c', 0.5);
  });

  it('auto-analyzes after each verdict and emits goodhart:risk_elevated on medium/high', async () => {
    wireGoodhartToEventBus(detector, bus);

    const elevated: QosEvent[] = [];
    bus.on('goodhart:risk_elevated', async (event) => {
      elevated.push(event);
    });

    // Stub analyze to return high risk on the 4th call
    let callCount = 0;
    vi.spyOn(detector, 'analyze').mockImplementation(() => {
      callCount++;
      if (callCount >= 4) {
        return {
          risk: 'high',
          crossModelEntropy: 0.9,
          entropyTrend: 0.05,
          meanScore: 0.92,
          scoreTrend: 0.01,
          calibrationDelta: 0.3,
          reason: 'calibration gap 0.300',
        };
      }
      return {
        risk: 'none',
        crossModelEntropy: 0,
        entropyTrend: 0,
        meanScore: 0.5,
        scoreTrend: 0,
        calibrationDelta: null,
        reason: 'no Goodhart indicators detected',
      };
    });

    // Emit 4 verdicts
    for (let i = 0; i < 4; i++) {
      bus.emit({
        type: 'judge:verdict',
        payload: { judgeModel: 'gpt-4.1', score: 0.9 },
        source: 'test',
        taskId: `task-${i}`,
      });
    }

    await tick();

    // Should have emitted exactly 1 elevated event (from the 4th verdict)
    expect(elevated.length).toBe(1);
    expect(elevated[0].type).toBe('goodhart:risk_elevated');
    expect((elevated[0].payload as Record<string, unknown>).risk).toBe('high');
    expect((elevated[0].payload as Record<string, unknown>).reason).toBe('calibration gap 0.300');
    expect(elevated[0].source).toBe('goodhart-detector');
  });

  it('does NOT emit goodhart:risk_elevated when risk is none or low', async () => {
    wireGoodhartToEventBus(detector, bus);

    const elevated: QosEvent[] = [];
    bus.on('goodhart:risk_elevated', async (event) => {
      elevated.push(event);
    });

    vi.spyOn(detector, 'analyze').mockReturnValue({
      risk: 'low',
      crossModelEntropy: 0.2,
      entropyTrend: 0.006,
      meanScore: 0.6,
      scoreTrend: 0.001,
      calibrationDelta: null,
      reason: 'cross-model divergence increasing',
    });

    bus.emit({
      type: 'judge:verdict',
      payload: { judgeModel: 'gpt-4.1', score: 0.8 },
      source: 'test',
      taskId: 'task-1',
    });

    await tick();

    expect(elevated.length).toBe(0);
  });

  it('multiple verdicts all trigger recordVerdict and analysis', async () => {
    const recordSpy = vi.spyOn(detector, 'recordVerdict');
    const analyzeSpy = vi.spyOn(detector, 'analyze');
    wireGoodhartToEventBus(detector, bus);

    for (let i = 0; i < 5; i++) {
      bus.emit({
        type: 'judge:verdict',
        payload: { judgeModel: 'gpt-4.1', score: 0.7 + i * 0.05 },
        source: 'test',
        taskId: `task-${i}`,
      });
    }

    await tick();

    expect(recordSpy).toHaveBeenCalledTimes(5);
    expect(analyzeSpy).toHaveBeenCalledTimes(5);
  });
});
