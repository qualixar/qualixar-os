/**
 * Qualixar OS Phase 22 -- Rate Limiter Tests
 *
 * Sliding-window in-memory rate limiter. Tests unlimited admin access,
 * role-specific limits, 429 enforcement at the limit boundary, and
 * window reset behaviour after 60 seconds.
 *
 * No DB dependency — RateLimiter is purely in-memory.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRateLimiter } from '../../src/enterprise/rate-limiter.js';
import type { RateLimiter } from '../../src/types/phase22.js';

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let limiter: RateLimiter;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RateLimiter (Phase 22)', () => {
  beforeEach(() => {
    limiter = createRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: Admin is unlimited
  it('admin consume() always returns Infinity remaining (never rate-limited)', () => {
    const ITERATIONS = 2000;
    for (let i = 0; i < ITERATIONS; i++) {
      const state = limiter.consume('admin-user', 'admin');
      expect(state.limit).toBe(Infinity);
      expect(state.remaining).toBe(Infinity);
    }
  });

  // Test 2: Developer gets 1000/min limit
  it('developer has a limit of 1000 requests per minute', () => {
    const state = limiter.consume('dev-user', 'developer');
    expect(state.limit).toBe(1000);
    expect(state.role).toBe('developer');
    expect(state.count).toBe(1);
    expect(state.remaining).toBe(999);
  });

  // Test 3: Viewer gets 100/min limit
  it('viewer has a limit of 100 requests per minute', () => {
    const state = limiter.consume('viewer-user', 'viewer');
    expect(state.limit).toBe(100);
    expect(state.role).toBe('viewer');
    expect(state.count).toBe(1);
    expect(state.remaining).toBe(99);
  });

  // Test 4: Exceeding limit — remaining hits 0 and count exceeds limit
  it('viewer remaining drops to 0 after exhausting the 100-request quota', () => {
    // Consume all 100 allowed slots
    for (let i = 0; i < 100; i++) {
      limiter.consume('throttled-viewer', 'viewer');
    }

    // The 101st request — count exceeds limit, remaining is 0
    const over = limiter.consume('throttled-viewer', 'viewer');
    expect(over.count).toBe(101);
    expect(over.remaining).toBe(0);
    // The middleware would return 429 when count > limit; verify the signal is present
    expect(over.count > over.limit).toBe(true);
  });

  // Test 5: Window resets after 60 seconds
  it('count resets to 0 after the 60-second window expires', () => {
    // Consume all 100 viewer slots
    for (let i = 0; i < 100; i++) {
      limiter.consume('window-viewer', 'viewer');
    }

    const beforeReset = limiter.check('window-viewer', 'viewer');
    expect(beforeReset.count).toBe(100);

    // Advance time by 61 seconds (past the 60s window)
    vi.advanceTimersByTime(61_000);

    // Next consume opens a fresh window
    const afterReset = limiter.consume('window-viewer', 'viewer');
    expect(afterReset.count).toBe(1);
    expect(afterReset.remaining).toBe(99);
  });
});
