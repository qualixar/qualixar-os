// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Rate Limiter
 *
 * In-memory sliding window rate limiter per role.
 * Returns X-RateLimit-Remaining and Retry-After headers via Hono middleware.
 *
 * Limits:
 *   admin:     unlimited (Infinity)
 *   developer: 1000 requests / minute
 *   viewer:    100 requests / minute
 *
 * HR-1: No mutation — window buckets are replaced on update.
 * HR-2: Window is per-identifier (IP or userId), not global.
 */

import type { MiddlewareHandler, Context } from 'hono';
import type { RateLimiter, RateLimitState, Role } from '../types/phase22.js';

// Typed Hono env — matches the variables set by RBAC middleware
type Env = { Variables: { userId: string; userRole: Role } };
type HonoContext = Context<Env>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000; // 1 minute

const ROLE_LIMITS: Readonly<Record<Role, number>> = {
  admin: Infinity,
  developer: 1000,
  viewer: 100,
};

// ---------------------------------------------------------------------------
// Window bucket
// ---------------------------------------------------------------------------

interface WindowBucket {
  count: number;
  windowStart: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class RateLimiterImpl implements RateLimiter {
  private readonly _windows = new Map<string, WindowBucket>();

  private _getOrCreate(identifier: string): WindowBucket {
    const now = Date.now();
    const existing = this._windows.get(identifier);
    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      const fresh: WindowBucket = { count: 0, windowStart: now };
      this._windows.set(identifier, fresh);
      return fresh;
    }
    return existing;
  }

  private _toState(identifier: string, role: Role, bucket: WindowBucket): RateLimitState {
    const limit = ROLE_LIMITS[role];
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - bucket.count);
    const resetAt = bucket.windowStart + WINDOW_MS;
    return { role, identifier, count: bucket.count, windowStart: bucket.windowStart, limit, remaining, resetAt };
  }

  check(identifier: string, role: Role): RateLimitState {
    const bucket = this._getOrCreate(identifier);
    return this._toState(identifier, role, bucket);
  }

  consume(identifier: string, role: Role): RateLimitState {
    const limit = ROLE_LIMITS[role];
    if (limit === Infinity) {
      // No tracking needed for unlimited
      const state: RateLimitState = {
        role, identifier, count: 0, windowStart: Date.now(),
        limit: Infinity, remaining: Infinity, resetAt: Date.now() + WINDOW_MS,
      };
      return state;
    }
    const bucket = this._getOrCreate(identifier);
    const updated: WindowBucket = { count: bucket.count + 1, windowStart: bucket.windowStart };
    this._windows.set(identifier, updated);
    return this._toState(identifier, role, updated);
  }

  reset(identifier: string): void {
    this._windows.delete(identifier);
  }

  getStatus(identifier: string, role: Role): RateLimitState {
    return this.check(identifier, role);
  }
}

// ---------------------------------------------------------------------------
// Hono Middleware
// ---------------------------------------------------------------------------

/**
 * Rate limiter middleware.
 * Reads role from context (set by RBAC middleware upstream).
 * Falls back to 'viewer' limits for unauthenticated requests.
 */
export function createRateLimiterMiddleware(limiter: RateLimiter): MiddlewareHandler<Env> {
  return async (c: HonoContext, next) => {
    const role = (c.get('userRole') as Role | undefined) ?? 'viewer';
    const userId = (c.get('userId') as string | undefined);
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
    const identifier = userId ?? ip;

    const state = limiter.consume(identifier, role);
    if (state.limit !== Infinity && state.count > state.limit) {
      const retryAfterSec = Math.ceil((state.resetAt - Date.now()) / 1000);
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(state.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(state.resetAt),
          'Retry-After': String(retryAfterSec),
        },
      });
    }

    await next();

    // Attach rate limit headers to successful responses
    if (state.limit !== Infinity) {
      c.header('X-RateLimit-Limit', String(state.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, state.remaining - 1)));
      c.header('X-RateLimit-Reset', String(state.resetAt));
    }
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRateLimiter(): RateLimiter {
  return new RateLimiterImpl();
}
