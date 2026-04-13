/**
 * Qualixar OS Phase 13 -- Session Manager Tests
 * Tests save/restore/getActiveTaskIds with temp files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  SessionManagerImpl,
  createSessionManager,
} from '../../src/engine/session-manager.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionManagerImpl', () => {
  let tempDir: string;
  let sessionFile: string;
  let manager: SessionManagerImpl;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'qos-session-test-'));
    sessionFile = join(tempDir, 'session.json');
    manager = new SessionManagerImpl(sessionFile);
  });

  // No afterEach cleanup needed — OS cleans tmpdir

  // -----------------------------------------------------------------------
  // save()
  // -----------------------------------------------------------------------

  it('save creates session file', () => {
    manager.save('sess-1', ['task-1', 'task-2'], null);
    expect(existsSync(sessionFile)).toBe(true);
  });

  it('save writes valid JSON', () => {
    manager.save('sess-1', ['task-1'], 'cp-123');
    const raw = readFileSync(sessionFile, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.sessionId).toBe('sess-1');
    expect(parsed.activeTasks).toEqual(['task-1']);
    expect(parsed.lastCheckpoint).toBe('cp-123');
    expect(parsed.startedAt).toBeTruthy();
  });

  it('save creates parent directory if missing', () => {
    const nested = join(tempDir, 'deep', 'nested', 'session.json');
    const nestedManager = new SessionManagerImpl(nested);
    nestedManager.save('sess-1', [], null);
    expect(existsSync(nested)).toBe(true);
  });

  it('save overwrites previous session', () => {
    manager.save('sess-1', ['task-1'], null);
    manager.save('sess-2', ['task-2', 'task-3'], 'cp-456');

    const state = manager.restore();
    expect(state!.sessionId).toBe('sess-2');
    expect(state!.activeTasks).toEqual(['task-2', 'task-3']);
  });

  // -----------------------------------------------------------------------
  // restore()
  // -----------------------------------------------------------------------

  it('restore returns null when no file exists', () => {
    expect(manager.restore()).toBeNull();
  });

  it('restore returns saved state', () => {
    manager.save('sess-1', ['task-1', 'task-2'], 'cp-789');
    const state = manager.restore();

    expect(state).not.toBeNull();
    expect(state!.sessionId).toBe('sess-1');
    expect(state!.activeTasks).toEqual(['task-1', 'task-2']);
    expect(state!.lastCheckpoint).toBe('cp-789');
    expect(state!.startedAt).toBeTruthy();
  });

  it('restore returns null for invalid JSON', () => {
    const { writeFileSync } = require('node:fs');
    writeFileSync(sessionFile, 'NOT_JSON{{{', 'utf-8');
    expect(manager.restore()).toBeNull();
  });

  it('restore returns null for missing required fields', () => {
    const { writeFileSync } = require('node:fs');
    writeFileSync(sessionFile, JSON.stringify({ foo: 'bar' }), 'utf-8');
    expect(manager.restore()).toBeNull();
  });

  it('restore handles null lastCheckpoint', () => {
    manager.save('sess-1', ['task-1'], null);
    const state = manager.restore();
    expect(state!.lastCheckpoint).toBeNull();
  });

  // -----------------------------------------------------------------------
  // getActiveTaskIds()
  // -----------------------------------------------------------------------

  it('getActiveTaskIds returns empty when no session exists', () => {
    expect(manager.getActiveTaskIds()).toEqual([]);
  });

  it('getActiveTaskIds returns task IDs from saved session', () => {
    manager.save('sess-1', ['task-a', 'task-b', 'task-c'], null);
    expect(manager.getActiveTaskIds()).toEqual(['task-a', 'task-b', 'task-c']);
  });

  // -----------------------------------------------------------------------
  // clear()
  // -----------------------------------------------------------------------

  it('clear nullifies session file', () => {
    manager.save('sess-1', ['task-1'], null);
    manager.clear();
    expect(manager.restore()).toBeNull();
  });

  it('clear is safe when no file exists', () => {
    expect(() => manager.clear()).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles empty activeTasks array', () => {
    manager.save('sess-1', [], null);
    const state = manager.restore();
    expect(state!.activeTasks).toEqual([]);
    expect(manager.getActiveTaskIds()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createSessionManager', () => {
  it('creates with custom path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'qos-sm-factory-'));
    const manager = createSessionManager(join(tempDir, 'session.json'));
    expect(manager).toBeDefined();
    expect(manager.restore()).toBeNull();
  });

  it('creates with default path when no argument given', () => {
    const manager = createSessionManager();
    expect(manager).toBeDefined();
  });
});
