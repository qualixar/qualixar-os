// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 — Retry & Circuit Breaker Utilities
 * LLD Section 2.12
 *
 * Provides two independent resilience primitives:
 * 1. retry() — Exponential backoff with jitter for transient failures
 * 2. CircuitBreaker — Three-state (closed/open/half-open) fail-fast mechanism
 *
 * These are composed by consumers (e.g., model-call.ts wraps retry inside
 * CircuitBreaker.call) but are not internally coupled.
 *
 * Zero external dependencies. ~120 lines of implementation.
 */

// ================================================================
// Types
// ================================================================

export interface RetryOptions {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterPct: number;
  readonly retryableErrors?: (error: unknown) => boolean;
}

export interface CircuitBreakerOptions {
  readonly threshold: number;
  readonly resetTimeoutMs: number;
}

// ================================================================
// Defaults
// ================================================================

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterPct: 0.25,
  retryableErrors: undefined,
};

export const DEFAULT_CB_OPTIONS: CircuitBreakerOptions = {
  threshold: 5,
  resetTimeoutMs: 60_000,
};

// ================================================================
// retry()
// ================================================================

/**
 * Execute an async function with exponential backoff retry on failure.
 *
 * Backoff formula:
 *   baseDelay = min(baseDelayMs * 2^(attempt-1), maxDelayMs)
 *   jitter    = baseDelay * jitterPct * (2 * Math.random() - 1)
 *   delay     = max(0, baseDelay + jitter)
 *
 * @param fn - Async function to execute
 * @param options - Partial retry options (merged with defaults)
 * @returns The result of fn() on success
 * @throws The last error if all retries are exhausted, or immediately for non-retryable errors
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      // Guard 1: retries exhausted
      if (attempt > opts.maxRetries) {
        throw error;
      }

      // Guard 2: non-retryable error (filter returns false)
      if (opts.retryableErrors && !opts.retryableErrors(error)) {
        throw error;
      }

      // Calculate exponential backoff with jitter
      const baseDelay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs,
      );
      const jitter = baseDelay * opts.jitterPct * (2 * Math.random() - 1);
      const delay = Math.max(0, baseDelay + jitter);

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ================================================================
// CircuitBreaker
// ================================================================

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Three-state circuit breaker following Michael Nygard's "Release It!" pattern.
 *
 * State machine:
 *   CLOSED  --[failures >= threshold]--> OPEN
 *   OPEN    --[timeout elapsed]--------> HALF-OPEN
 *   HALF-OPEN --[success]--------------> CLOSED
 *   HALF-OPEN --[failure]--------------> OPEN (re-trip)
 *
 * In CLOSED state: all requests pass through. Failures are counted.
 *   Success resets the failure counter.
 *
 * In OPEN state: all requests are immediately rejected with
 *   Error('Circuit breaker is open'). After resetTimeoutMs, transitions
 *   to HALF-OPEN on the next call().
 *
 * In HALF-OPEN state: one probe request is allowed.
 *   Success -> CLOSED (counters reset).
 *   Failure -> OPEN (re-trip).
 */
export class CircuitBreaker {
  private _state: CircuitState = 'closed';
  private _failureCount = 0;
  private _lastFailureTime = 0;
  private readonly _threshold: number;
  private readonly _resetTimeoutMs: number;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    const opts = { ...DEFAULT_CB_OPTIONS, ...options };
    this._threshold = opts.threshold;
    this._resetTimeoutMs = opts.resetTimeoutMs;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @param fn - Async function to execute
   * @returns The result of fn() on success
   * @throws Error('Circuit breaker is open') when in open state
   * @throws The original error from fn() on failure
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // State check: OPEN -> maybe HALF-OPEN, or reject
    if (this._state === 'open') {
      if (Date.now() - this._lastFailureTime >= this._resetTimeoutMs) {
        this._state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      // Success path: half-open probe succeeds -> close circuit
      if (this._state === 'half-open') {
        this._state = 'closed';
      }
      this._failureCount = 0;
      return result;
    } catch (error) {
      // Failure path
      this._failureCount++;
      this._lastFailureTime = Date.now();

      if (this._state === 'half-open') {
        // Probe failed -> re-open
        this._state = 'open';
      } else if (this._failureCount >= this._threshold) {
        // Threshold breached -> trip
        this._state = 'open';
      }

      throw error;
    }
  }

  /**
   * Get the current circuit state (read-only observation).
   *
   * NOTE: getState() does NOT mutate internal state. If the circuit is
   * technically in 'open' but the reset timeout has elapsed, it reports
   * 'half-open' as an observation. The actual state transition only
   * happens inside call().
   */
  getState(): CircuitState {
    if (
      this._state === 'open' &&
      Date.now() - this._lastFailureTime >= this._resetTimeoutMs
    ) {
      return 'half-open';
    }
    return this._state;
  }

  /**
   * Force the circuit back to closed state and reset all counters.
   */
  reset(): void {
    this._state = 'closed';
    this._failureCount = 0;
  }
}
