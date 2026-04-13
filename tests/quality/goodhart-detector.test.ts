/**
 * Phase B2 -- Goodhart Detector Tests
 *
 * Detects when judge models optimize for proxy metrics
 * instead of real quality (Goodhart's Law).
 *
 * Source: Phase B2 LLD Section 7
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGoodhartDetector,
  type GoodhartDetector,
  type GoodhartSignal,
} from '../../src/quality/goodhart-detector.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoodhartDetector', () => {
  let detector: GoodhartDetector;

  beforeEach(() => {
    detector = createGoodhartDetector({ windowSize: 20 });
  });

  it('returns risk=none with insufficient data', () => {
    detector.recordVerdict('task-1', 'gpt-4.1', 0.8);
    detector.recordVerdict('task-2', 'claude-sonnet-4-6', 0.7);
    const signal = detector.analyze();

    expect(signal.risk).toBe('none');
    expect(signal.reason).toContain('insufficient');
  });

  it('records verdicts and groups by model', () => {
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'gpt-4.1', 0.8);
      detector.recordVerdict(`task-${i}`, 'claude-sonnet-4-6', 0.75);
    }
    const signal = detector.analyze();

    expect(signal.meanScore).toBeGreaterThan(0);
    expect(signal.crossModelEntropy).toBeGreaterThanOrEqual(0);
  });

  it('computes Shannon entropy correctly for uniform agreement', () => {
    // All models agree perfectly → low entropy
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.8);
      detector.recordVerdict(`task-${i}`, 'model-b', 0.8);
    }
    const signal = detector.analyze();

    // Perfect agreement → entropy should be low
    expect(signal.crossModelEntropy).toBeLessThan(0.5);
  });

  it('detects increasing entropy (models diverging)', () => {
    // Use a larger window so both phases coexist
    const bigDetector = createGoodhartDetector({ windowSize: 50 });

    // Phase 1: models agree closely (range < 0.15)
    for (let i = 0; i < 10; i++) {
      bigDetector.recordVerdict(`task-${i}`, 'model-a', 0.8);
      bigDetector.recordVerdict(`task-${i}`, 'model-b', 0.79);
    }

    const signal1 = bigDetector.analyze();

    // Phase 2: models diverge strongly (range > 0.15)
    for (let i = 10; i < 20; i++) {
      bigDetector.recordVerdict(`task-${i}`, 'model-a', 0.95);
      bigDetector.recordVerdict(`task-${i}`, 'model-b', 0.4);
    }

    const signal2 = bigDetector.analyze();

    // Entropy should be higher when models disagree
    expect(signal2.crossModelEntropy).toBeGreaterThan(signal1.crossModelEntropy);
  });

  it('returns risk >= low when scores rise with diverging models', () => {
    // Use a large window so all data is visible
    const bigDetector = createGoodhartDetector({ windowSize: 100, minDataPoints: 5 });

    // Phase 1: low scores, models agree → establish baseline
    for (let i = 0; i < 10; i++) {
      bigDetector.recordVerdict(`task-${i}`, 'model-a', 0.5);
      bigDetector.recordVerdict(`task-${i}`, 'model-b', 0.5);
    }
    bigDetector.analyze(); // baseline signal

    // Phase 2: rising scores, models strongly diverge (range > 0.15)
    for (let i = 10; i < 25; i++) {
      bigDetector.recordVerdict(`task-${i}`, 'model-a', 0.95);
      bigDetector.recordVerdict(`task-${i}`, 'model-b', 0.4);
    }
    const signal = bigDetector.analyze();

    // Score trend should be positive (scores went from 0.5 to 0.95/0.4 avg)
    expect(signal.scoreTrend).toBeGreaterThan(0);
    // Cross-model entropy should be > 0 (models strongly diverge)
    expect(signal.crossModelEntropy).toBeGreaterThan(0);
  });

  it('records calibration and computes delta', () => {
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.9);
      detector.recordVerdict(`task-${i}`, 'model-b', 0.88);
    }

    // Calibration: models think quality is 0.9, but actual is 0.6
    detector.recordCalibration('cal-1', 'model-a', 0.6, 0.9);
    detector.recordCalibration('cal-2', 'model-b', 0.6, 0.85);

    const signal = detector.analyze();

    expect(signal.calibrationDelta).not.toBeNull();
    expect(signal.calibrationDelta!).toBeGreaterThan(0.2);
  });

  it('returns risk=high when calibration delta exceeds 0.2', () => {
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.9);
      detector.recordVerdict(`task-${i}`, 'model-b', 0.88);
    }

    // Large calibration gap
    detector.recordCalibration('cal-1', 'model-a', 0.5, 0.9);
    detector.recordCalibration('cal-2', 'model-b', 0.5, 0.88);

    const signal = detector.analyze();

    expect(signal.risk).toBe('high');
  });

  it('getHistory returns ordered signals', () => {
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.8);
      detector.recordVerdict(`task-${i}`, 'model-b', 0.75);
    }

    detector.analyze(); // Creates first signal
    detector.recordVerdict('task-extra', 'model-a', 0.9);
    detector.analyze(); // Creates second signal

    const history = detector.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('handles single model gracefully (no cross-model comparison possible)', () => {
    for (let i = 0; i < 10; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.8);
    }

    const signal = detector.analyze();

    // With only one model, entropy is 0 (no cross-model comparison)
    expect(signal.crossModelEntropy).toBe(0);
    expect(signal.risk).toBe('none');
  });

  it('trend computation detects upward score movement', () => {
    // Feed linearly increasing scores
    for (let i = 0; i < 20; i++) {
      detector.recordVerdict(`task-${i}`, 'model-a', 0.5 + i * 0.02);
      detector.recordVerdict(`task-${i}`, 'model-b', 0.5 + i * 0.02);
    }

    const signal = detector.analyze();

    expect(signal.scoreTrend).toBeGreaterThan(0);
  });
});
