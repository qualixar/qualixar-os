/**
 * Qualixar OS Phase 0 — Utility Tests
 * TDD RED phase: All 15 tests written before implementation.
 *
 * Covers: generateId, time utilities, createLogger, retry, CircuitBreaker
 * LLD refs: Sections 2.9, 2.10, 2.11, 2.12
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Imports from implementation files (don't exist yet — RED) ---
import { generateId } from '../../src/utils/id.js';
import { now, elapsed, durationToHuman } from '../../src/utils/time.js';
import { createLogger } from '../../src/utils/logger.js';
import {
  retry,
  CircuitBreaker,
  DEFAULT_RETRY_OPTIONS,
  DEFAULT_CB_OPTIONS,
  type RetryOptions,
  type CircuitBreakerOptions,
} from '../../src/utils/retry.js';

// ================================================================
// 1. generateId (LLD Section 2.9)
// ================================================================

describe('generateId', () => {
  it('returns valid UUID v4 format', () => {
    const id = generateId();
    // UUID v4: 8-4-4-4-12 hex, version nibble = 4, variant bits = 8/9/a/b
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidV4Regex);
  });

  it('returns unique values', () => {
    const ids = Array.from({ length: 100 }, () => generateId());
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });
});

// ================================================================
// 2. Time Utilities (LLD Section 2.10)
// ================================================================

describe('time utilities', () => {
  it('now() returns ISO 8601 string', () => {
    const timestamp = now();
    // ISO 8601: YYYY-MM-DDTHH:MM:SS (may include .sssZ)
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('elapsed() returns positive number', () => {
    const start = performance.now();
    // Small busy-wait to ensure measurable elapsed time
    let sum = 0;
    for (let i = 0; i < 100_000; i++) sum += i;
    const ms = elapsed(start);
    expect(ms).toBeGreaterThan(0);
    expect(typeof ms).toBe('number');
  });

  it('durationToHuman formats correctly', () => {
    // LLD algorithm:
    // < 1000ms  -> "Xms"
    // < 60000ms -> "X.Xs"
    // < 3600000 -> "Xm Ys"
    // >= 3600000 -> "Xh Ym"
    expect(durationToHuman(500)).toBe('500ms');
    expect(durationToHuman(1500)).toBe('1.5s');
    expect(durationToHuman(65000)).toBe('1m 5s');
    expect(durationToHuman(3661000)).toBe('1h 1m');
  });
});

// ================================================================
// 3. createLogger (LLD Section 2.11)
// ================================================================

describe('createLogger', () => {
  it('returns pino instance with correct level', () => {
    const logger = createLogger('debug');
    // Pino logger exposes a .level property matching the configured level
    expect(logger.level).toBe('debug');
  });

  it('child logger includes context fields', () => {
    const logger = createLogger('info');
    const child = logger.child({ taskId: 'test-123', component: 'TestComponent' });
    // Pino child.bindings() returns the bindings object passed at creation
    const bindings = child.bindings();
    expect(bindings).toHaveProperty('taskId', 'test-123');
    expect(bindings).toHaveProperty('component', 'TestComponent');
  });

  it('production mode creates logger without pino-pretty transport', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const logger = createLogger('warn');
      expect(logger.level).toBe('warn');
      // In production mode, pino is created without transport option,
      // so there is no .transport property on the logger instance
      expect((logger as Record<string, unknown>).transport).toBeUndefined();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

// ================================================================
// 4. retry (LLD Section 2.12)
// ================================================================

describe('retry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on second try after transient failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');

    // Use zero delays for test speed
    const result = await retry(fn, { baseDelayMs: 0, maxDelayMs: 0 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts maxRetries and throws last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));

    await expect(
      retry(fn, { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow('persistent');
    // 1 initial call + 2 retries = 3 total
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('backoff delays increase exponentially', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', (fn: () => void, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0); // execute immediately for test speed
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(
      retry(fn, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 30000, jitterPct: 0 }),
    ).rejects.toThrow('fail');

    vi.unstubAllGlobals();

    // With zero jitter: delays should be 100, 200, 400 (baseDelay * 2^attempt)
    expect(delays.length).toBe(3);
    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
  });

  it('jitter stays within +/-25% of base delay', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', (fn: () => void, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0);
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(
      retry(fn, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitterPct: 0.25 }),
    ).rejects.toThrow('fail');

    vi.unstubAllGlobals();

    // Each delay should be within [base*(1-0.25), base*(1+0.25)] where base = 1000*2^attempt
    for (let i = 0; i < delays.length; i++) {
      const base = 1000 * Math.pow(2, i);
      expect(delays[i]).toBeGreaterThanOrEqual(base * 0.75);
      expect(delays[i]).toBeLessThanOrEqual(base * 1.25);
    }
  });

  it('non-retryable error throws immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('auth-failure'));

    // retryableErrors returns false for auth errors -> no retry
    await expect(
      retry(fn, {
        maxRetries: 3,
        baseDelayMs: 0,
        retryableErrors: (err: unknown) => {
          if (err instanceof Error) return !err.message.includes('auth');
          return true;
        },
      }),
    ).rejects.toThrow('auth-failure');
    // Called only once — non-retryable short-circuits
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ================================================================
// 5. CircuitBreaker (LLD Section 2.12)
// ================================================================

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker({ threshold: 5, resetTimeoutMs: 60_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    expect(cb.getState()).toBe('closed');
  });

  it('opens after threshold consecutive failures', async () => {
    const failing = () => Promise.reject(new Error('down'));

    // 5 failures to trip the breaker
    for (let i = 0; i < 5; i++) {
      await expect(cb.call(failing)).rejects.toThrow('down');
    }
    expect(cb.getState()).toBe('open');
  });

  it('rejects when open', async () => {
    const failing = () => Promise.reject(new Error('down'));

    // Trip the breaker
    for (let i = 0; i < 5; i++) {
      await expect(cb.call(failing)).rejects.toThrow('down');
    }

    // Now circuit is open — should reject immediately
    await expect(
      cb.call(() => Promise.resolve('should-not-reach')),
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('closes on successful half-open probe', async () => {
    const failing = () => Promise.reject(new Error('down'));

    // Trip the breaker
    for (let i = 0; i < 5; i++) {
      await expect(cb.call(failing)).rejects.toThrow('down');
    }
    expect(cb.getState()).toBe('open');

    // Advance past resetTimeout -> should allow half-open probe
    vi.advanceTimersByTime(60_001);

    // getState() should report half-open (observation without mutation)
    expect(cb.getState()).toBe('half-open');

    // Successful probe -> circuit closes
    const result = await cb.call(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens on failed half-open probe', async () => {
    const failing = () => Promise.reject(new Error('down'));

    // Trip the breaker
    for (let i = 0; i < 5; i++) {
      await expect(cb.call(failing)).rejects.toThrow('down');
    }
    expect(cb.getState()).toBe('open');

    // Advance past resetTimeout -> half-open
    vi.advanceTimersByTime(60_001);
    expect(cb.getState()).toBe('half-open');

    // Failed probe -> back to open
    await expect(cb.call(failing)).rejects.toThrow('down');
    expect(cb.getState()).toBe('open');
  });

  it('manual reset() returns to closed', async () => {
    const failing = () => Promise.reject(new Error('down'));

    // Trip the breaker
    for (let i = 0; i < 5; i++) {
      await expect(cb.call(failing)).rejects.toThrow('down');
    }
    expect(cb.getState()).toBe('open');

    // Manual reset
    cb.reset();
    expect(cb.getState()).toBe('closed');

    // Next call should execute normally
    const result = await cb.call(() => Promise.resolve('works'));
    expect(result).toBe('works');
  });
});
