/**
 * Qualixar OS Phase F -- Heartbeat Manager Tests
 * G-13: Long-running task heartbeat detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHeartbeatManager, HEARTBEAT_INTERVAL_MS, DEFAULT_STALE_THRESHOLD_MS } from '../../src/engine/heartbeat.js';
import type { HeartbeatManager } from '../../src/engine/heartbeat.js';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('HeartbeatManager', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let heartbeat: HeartbeatManager;

  beforeEach(() => {
    vi.useFakeTimers();
    db = createDatabase(':memory:');
    db.runMigrations();
    eventBus = createEventBus(db);

    heartbeat = createHeartbeatManager(db, eventBus);

    // Insert a test task
    db.insert('tasks', {
      id: 'task-hb-1',
      type: 'custom',
      prompt: 'test heartbeat',
      status: 'running',
      mode: 'standard',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    heartbeat.stop('task-hb-1');
    db.close();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Core heartbeat lifecycle
  // -------------------------------------------------------------------------

  it('start() writes immediate heartbeat to DB', () => {
    heartbeat.start('task-hb-1');

    const row = db.get<{ last_heartbeat: string }>(
      'SELECT last_heartbeat FROM tasks WHERE id = ?',
      ['task-hb-1'],
    );
    expect(row).toBeDefined();
    expect(row!.last_heartbeat).toBeTruthy();
  });

  it('isAlive() returns true after start, false after stop', () => {
    expect(heartbeat.isAlive('task-hb-1')).toBe(false);

    heartbeat.start('task-hb-1');
    expect(heartbeat.isAlive('task-hb-1')).toBe(true);

    heartbeat.stop('task-hb-1');
    expect(heartbeat.isAlive('task-hb-1')).toBe(false);
  });

  it('stop() is idempotent -- calling twice does not throw', () => {
    heartbeat.start('task-hb-1');
    heartbeat.stop('task-hb-1');
    expect(() => heartbeat.stop('task-hb-1')).not.toThrow();
  });

  it('start() clears existing interval before creating new one', () => {
    heartbeat.start('task-hb-1');
    heartbeat.start('task-hb-1'); // Should not create duplicate
    expect(heartbeat.isAlive('task-hb-1')).toBe(true);
    heartbeat.stop('task-hb-1');
    expect(heartbeat.isAlive('task-hb-1')).toBe(false);
  });

  it('periodic heartbeat updates last_heartbeat after interval', () => {
    heartbeat.start('task-hb-1');

    const first = db.get<{ last_heartbeat: string }>(
      'SELECT last_heartbeat FROM tasks WHERE id = ?',
      ['task-hb-1'],
    );

    // Advance time past heartbeat interval
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + 100);

    const second = db.get<{ last_heartbeat: string }>(
      'SELECT last_heartbeat FROM tasks WHERE id = ?',
      ['task-hb-1'],
    );

    expect(first!.last_heartbeat).toBeTruthy();
    expect(second!.last_heartbeat).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Stale task detection
  // -------------------------------------------------------------------------

  it('getStaleTaskIds() returns tasks with old heartbeats', () => {
    // Set heartbeat to 10 minutes ago
    const oldTime = new Date(Date.now() - 10 * 60_000).toISOString();
    db.update('tasks', { last_heartbeat: oldTime }, { id: 'task-hb-1' });

    const stale = heartbeat.getStaleTaskIds();
    expect(stale).toContain('task-hb-1');
  });

  it('getStaleTaskIds() does not return tasks with recent heartbeats', () => {
    // Set heartbeat to now
    db.update('tasks', { last_heartbeat: new Date().toISOString() }, { id: 'task-hb-1' });

    const stale = heartbeat.getStaleTaskIds();
    expect(stale).not.toContain('task-hb-1');
  });

  it('getStaleTaskIds() respects custom threshold', () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    db.update('tasks', { last_heartbeat: twoMinAgo }, { id: 'task-hb-1' });

    // Default 5-minute threshold: not stale
    const notStale = heartbeat.getStaleTaskIds(5 * 60_000);
    expect(notStale).not.toContain('task-hb-1');

    // 1-minute threshold: IS stale
    const stale = heartbeat.getStaleTaskIds(1 * 60_000);
    expect(stale).toContain('task-hb-1');
  });

  it('getStaleTaskIds() ignores completed tasks', () => {
    const oldTime = new Date(Date.now() - 10 * 60_000).toISOString();
    db.update('tasks', { last_heartbeat: oldTime, status: 'completed' }, { id: 'task-hb-1' });

    const stale = heartbeat.getStaleTaskIds();
    expect(stale).not.toContain('task-hb-1');
  });

  it('getStaleTaskIds() ignores tasks with NULL heartbeat', () => {
    // task-hb-1 has no heartbeat set initially (NULL)
    const stale = heartbeat.getStaleTaskIds();
    expect(stale).not.toContain('task-hb-1');
  });

  // -------------------------------------------------------------------------
  // Session rotation
  // -------------------------------------------------------------------------

  it('shouldRotateSession() returns false for non-tracked task', () => {
    expect(heartbeat.shouldRotateSession('task-hb-1')).toBe(false);
  });

  it('shouldRotateSession() returns false for recently started task', () => {
    heartbeat.start('task-hb-1');
    expect(heartbeat.shouldRotateSession('task-hb-1')).toBe(false);
  });

  it('shouldRotateSession() returns true after 1 hour', () => {
    heartbeat.start('task-hb-1');
    vi.advanceTimersByTime(61 * 60_000); // 61 minutes
    expect(heartbeat.shouldRotateSession('task-hb-1')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Memory pressure
  // -------------------------------------------------------------------------

  it('checkMemoryPressure() returns heap info', () => {
    const result = heartbeat.checkMemoryPressure();
    expect(result.heapUsedMb).toBeGreaterThan(0);
    expect(typeof result.warning).toBe('boolean');
  });

  it('checkMemoryPressure() emits event when threshold exceeded', () => {
    // Use a very low threshold to trigger warning
    const result = heartbeat.checkMemoryPressure(1); // 1MB max
    expect(result.warning).toBe(true);
  });

  it('checkMemoryPressure() does not warn with high threshold', () => {
    const result = heartbeat.checkMemoryPressure(99999); // 99GB max
    expect(result.warning).toBe(false);
  });
});
