// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 — Time Utilities
 * LLD Section 2.10
 *
 * Provides ISO timestamps, elapsed measurement, and human-readable durations.
 * All functions are pure (no side effects beyond reading system clock).
 */

/**
 * Return the current time as an ISO 8601 string.
 * Example: "2026-03-30T12:00:00.000Z"
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Calculate elapsed milliseconds since a performance.now() start mark.
 * Uses performance.now() for sub-millisecond precision.
 *
 * @param startMs - Value from performance.now() captured at start
 * @returns Milliseconds elapsed (may be fractional)
 */
export function elapsed(startMs: number): number {
  return performance.now() - startMs;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * LLD algorithm:
 * - < 1000ms   -> "Xms"
 * - < 60000ms  -> "X.Xs"
 * - < 3600000  -> "Xm Ys"
 * - >= 3600000 -> "Xh Ym"
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function durationToHuman(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3_600_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}
