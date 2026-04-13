/**
 * Qualixar OS Phase 18 -- Cron Scheduler Tests
 * LLD Section 10.7: 8 tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseCron, getNextRun, getNext5Runs, createCronScheduler } from '../../src/deploy/cron-scheduler.js';

describe('parseCron', () => {
  it('parses "0 */6 * * *" correctly', () => {
    const cron = parseCron('0 */6 * * *');
    expect(cron.minute.values).toContain(0);
    expect(cron.minute.values.size).toBe(1);
    expect(cron.hour.values).toContain(0);
    expect(cron.hour.values).toContain(6);
    expect(cron.hour.values).toContain(12);
    expect(cron.hour.values).toContain(18);
    expect(cron.hour.values.size).toBe(4);
  });

  it('rejects invalid expressions (wrong field count)', () => {
    expect(() => parseCron('0 0 *')).toThrow('expected 5 fields, got 3');
    expect(() => parseCron('0 0 * * * *')).toThrow('expected 5 fields, got 6');
  });

  it('rejects out-of-range values (minute > 59)', () => {
    expect(() => parseCron('60 * * * *')).toThrow('Invalid cron value: 60');
    expect(() => parseCron('* 25 * * *')).toThrow('Invalid cron value: 25');
  });
});

describe('getNextRun', () => {
  it('returns correct next execution time', () => {
    const after = new Date('2026-04-03T10:30:00Z');
    const next = getNextRun('0 * * * *', after);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });
});

describe('getNext5Runs', () => {
  it('returns 5 future timestamps', () => {
    const runs = getNext5Runs('0 */6 * * *');
    expect(runs.length).toBe(5);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
    }
  });
});

describe('CronScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedule() calls callback at the right time', () => {
    vi.useFakeTimers();
    const scheduler = createCronScheduler();
    const callback = vi.fn();
    const now = new Date('2026-04-03T12:00:00Z');
    vi.setSystemTime(now);

    scheduler.schedule('dep_1', '* * * * *', callback);

    // Advance 60 seconds to trigger the interval check
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalled();

    scheduler.cancelAll();
  });

  it('cancel() stops scheduled execution', () => {
    vi.useFakeTimers();
    const scheduler = createCronScheduler();
    const callback = vi.fn();
    vi.setSystemTime(new Date('2026-04-03T12:00:00Z'));

    scheduler.schedule('dep_2', '* * * * *', callback);
    expect(scheduler.activeCount).toBe(1);

    scheduler.cancel('dep_2');
    expect(scheduler.activeCount).toBe(0);

    vi.advanceTimersByTime(60_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('schedule() replaces existing schedule for same deploymentId', () => {
    const scheduler = createCronScheduler();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    scheduler.schedule('dep_3', '0 * * * *', callback1);
    expect(scheduler.activeCount).toBe(1);

    scheduler.schedule('dep_3', '30 * * * *', callback2);
    expect(scheduler.activeCount).toBe(1);

    scheduler.cancelAll();
  });
});
