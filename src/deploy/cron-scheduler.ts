// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Lightweight Cron Scheduler
 * LLD Section 3.1 Component #8, Algorithm 8.5
 *
 * Minimal 5-field cron parser + interval-based scheduler.
 * No external dependencies. Supports: minute, hour, day-of-month, month, day-of-week.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CronField {
  readonly values: ReadonlySet<number>;
}

interface ParsedCron {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

interface ScheduledJob {
  readonly deploymentId: string;
  readonly timer: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// Cron Parser
// ---------------------------------------------------------------------------

const FIELD_RANGES: readonly [number, number][] = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // day of month
  [1, 12],   // month
  [0, 6],    // day of week (0=Sun)
];

function parseField(field: string, min: number, max: number): CronField {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    const range = stepMatch ? stepMatch[1] : part;

    if (range === '*') {
      for (let i = min; i <= max; i += step) {
        values.add(i);
      }
    } else if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) {
        throw new Error(`Invalid cron range: ${range} (valid: ${min}-${max})`);
      }
      for (let i = lo; i <= hi; i += step) {
        values.add(i);
      }
    } else {
      const val = parseInt(range, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Invalid cron value: ${range} (valid: ${min}-${max})`);
      }
      values.add(val);
    }
  }

  return { values };
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  return {
    minute: parseField(fields[0], FIELD_RANGES[0][0], FIELD_RANGES[0][1]),
    hour: parseField(fields[1], FIELD_RANGES[1][0], FIELD_RANGES[1][1]),
    dayOfMonth: parseField(fields[2], FIELD_RANGES[2][0], FIELD_RANGES[2][1]),
    month: parseField(fields[3], FIELD_RANGES[3][0], FIELD_RANGES[3][1]),
    dayOfWeek: parseField(fields[4], FIELD_RANGES[4][0], FIELD_RANGES[4][1]),
  };
}

function matchesCron(date: Date, cron: ParsedCron): boolean {
  return (
    cron.minute.values.has(date.getMinutes()) &&
    cron.hour.values.has(date.getHours()) &&
    cron.dayOfMonth.values.has(date.getDate()) &&
    cron.month.values.has(date.getMonth() + 1) &&
    cron.dayOfWeek.values.has(date.getDay())
  );
}

/**
 * Get the next execution time after `after` for the given cron expression.
 */
export function getNextRun(expression: string, after: Date = new Date()): Date {
  const cron = parseCron(expression);
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 2 years ahead (enough for any valid cron)
  const maxIterations = 525960; // ~365 * 24 * 60
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(next, cron)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error('Could not find next run within 1 year');
}

/**
 * Get the next N execution times for a cron expression.
 */
export function getNext5Runs(expression: string, count = 5): readonly Date[] {
  const runs: Date[] = [];
  let after = new Date();
  for (let i = 0; i < count; i++) {
    const next = getNextRun(expression, after);
    runs.push(next);
    after = next;
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Scheduler (interval-based, checks every 60s)
// ---------------------------------------------------------------------------

export interface CronScheduler {
  schedule(deploymentId: string, expression: string, callback: () => void): void;
  cancel(deploymentId: string): boolean;
  cancelAll(): void;
  readonly activeCount: number;
}

export function createCronScheduler(): CronScheduler {
  return new CronSchedulerImpl();
}

class CronSchedulerImpl implements CronScheduler {
  private readonly _jobs: Map<string, ScheduledJob> = new Map();

  schedule(deploymentId: string, expression: string, callback: () => void): void {
    // Validate expression eagerly
    const cron = parseCron(expression);

    // Cancel existing schedule for this deployment
    this.cancel(deploymentId);

    const timer = setInterval(() => {
      const now = new Date();
      if (matchesCron(now, cron)) {
        callback();
      }
    }, 60_000);

    // Don't keep the process alive just for cron
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    this._jobs.set(deploymentId, { deploymentId, timer });
  }

  cancel(deploymentId: string): boolean {
    const job = this._jobs.get(deploymentId);
    if (!job) return false;
    clearInterval(job.timer);
    this._jobs.delete(deploymentId);
    return true;
  }

  cancelAll(): void {
    for (const job of this._jobs.values()) {
      clearInterval(job.timer);
    }
    this._jobs.clear();
  }

  get activeCount(): number {
    return this._jobs.size;
  }
}
