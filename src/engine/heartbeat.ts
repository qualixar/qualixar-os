// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase F (G-13) -- Heartbeat Manager
 *
 * Periodic heartbeat writes for long-running tasks.
 * Detects stale/crashed tasks by comparing last_heartbeat timestamps.
 *
 * Hard Rules:
 *   - Heartbeat writes MUST be fire-and-forget (never block pipeline)
 *   - Stop MUST clear interval in finally block
 *   - getStaleTaskIds MUST use parameterized SQL
 */

import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const SESSION_ROTATION_THRESHOLD_MS = 60 * 60_000; // 1 hour
const MEMORY_WARNING_RATIO = 0.8; // 80% of max RAM triggers warning

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface HeartbeatManager {
  /** Start periodic heartbeat writes for a task. */
  start(taskId: string): void;

  /** Stop heartbeat writes for a task (must be called in finally block). */
  stop(taskId: string): void;

  /** Check if a task's heartbeat interval is active. */
  isAlive(taskId: string): boolean;

  /** Find task IDs whose last_heartbeat is older than threshold. */
  getStaleTaskIds(thresholdMs?: number): readonly string[];

  /** Check if a task has exceeded the session rotation threshold. */
  shouldRotateSession(taskId: string): boolean;

  /** Check memory usage and emit warning if high. */
  checkMemoryPressure(maxRamMb?: number): { heapUsedMb: number; warning: boolean };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class HeartbeatManagerImpl implements HeartbeatManager {
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;
  private readonly _intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly _startTimes = new Map<string, number>();

  constructor(db: QosDatabase, eventBus: EventBus) {
    this._db = db;
    this._eventBus = eventBus;
  }

  start(taskId: string): void {
    // Clear any existing heartbeat for this task
    this.stop(taskId);

    this._startTimes.set(taskId, Date.now());

    const tick = (): void => {
      try {
        this._db.update(
          'tasks',
          { last_heartbeat: now() },
          { id: taskId },
        );
      } catch {
        // DB might be busy or task already deleted -- fire-and-forget
      }
    };

    // Immediate first heartbeat
    tick();

    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    this._intervals.set(taskId, interval);
  }

  stop(taskId: string): void {
    const interval = this._intervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      this._intervals.delete(taskId);
    }
    this._startTimes.delete(taskId);
  }

  isAlive(taskId: string): boolean {
    return this._intervals.has(taskId);
  }

  getStaleTaskIds(thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS): readonly string[] {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const rows = this._db.query<{ id: string }>(
      "SELECT id FROM tasks WHERE status = 'running' AND last_heartbeat < ? AND last_heartbeat IS NOT NULL",
      [cutoff],
    );
    return rows.map((r) => r.id);
  }

  shouldRotateSession(taskId: string): boolean {
    const startTime = this._startTimes.get(taskId);
    if (!startTime) return false;
    return (Date.now() - startTime) > SESSION_ROTATION_THRESHOLD_MS;
  }

  checkMemoryPressure(maxRamMb: number = 512): { heapUsedMb: number; warning: boolean } {
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / (1024 * 1024));
    const threshold = maxRamMb * MEMORY_WARNING_RATIO;
    const warning = heapUsedMb > threshold;

    if (warning) {
      this._eventBus.emit({
        type: 'system:error',
        payload: {
          component: 'heartbeat',
          heapUsedMb,
          maxRamMb,
          message: `Memory usage high: ${heapUsedMb}MB / ${maxRamMb}MB`,
        },
        source: 'heartbeat',
      });
    }

    return { heapUsedMb, warning };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHeartbeatManager(
  db: QosDatabase,
  eventBus: EventBus,
): HeartbeatManager {
  return new HeartbeatManagerImpl(db, eventBus);
}

// ---------------------------------------------------------------------------
// Exported constants for testing
// ---------------------------------------------------------------------------

export {
  HEARTBEAT_INTERVAL_MS,
  DEFAULT_STALE_THRESHOLD_MS,
  SESSION_ROTATION_THRESHOLD_MS,
  MEMORY_WARNING_RATIO,
};
