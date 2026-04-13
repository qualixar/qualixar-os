/**
 * Qualixar OS Phase 22 -- Audit Logger Tests
 *
 * Tests structured audit entry persistence, filtered queries with pagination,
 * purge with retention policy, and JSON/CSV export.
 *
 * Uses in-memory SQLite with a minimal stub EventBus to avoid touching the
 * events table (which requires the full DB migration chain).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createAuditLogger } from '../../src/enterprise/audit-logger.js';
import type { AuditLogger, EventBus } from '../../src/types/phase22.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const AUDIT_LOG_DDL = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id            TEXT PRIMARY KEY,
    event_type    TEXT NOT NULL,
    user_id       TEXT,
    username      TEXT,
    role          TEXT,
    details       TEXT NOT NULL DEFAULT '',
    ip_address    TEXT,
    user_agent    TEXT,
    resource_type TEXT,
    resource_id   TEXT,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

// ---------------------------------------------------------------------------
// Stub EventBus — satisfies the interface without touching the events table
// ---------------------------------------------------------------------------

function makeStubEventBus(): EventBus {
  return {
    emit: () => { /* no-op */ },
    on: () => { /* no-op */ },
    off: () => { /* no-op */ },
    replay: async () => 0,
    getLastEventId: () => 0,
  } as unknown as EventBus;
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let db: QosDatabase;
let logger: AuditLogger;

function setupDb(): void {
  db = createDatabase(':memory:');
  db.db.exec(AUDIT_LOG_DDL);
  logger = createAuditLogger(db, makeStubEventBus());
}

// ---------------------------------------------------------------------------
// Helper: insert a log entry and return without asserting internals
// ---------------------------------------------------------------------------

function logEntry(overrides: Partial<Parameters<AuditLogger['log']>[0]> = {}): void {
  logger.log({
    eventType: 'user:login',
    userId: 'user-1',
    username: 'alice',
    role: 'developer',
    details: { action: 'login' },
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    resourceType: 'users',
    resourceId: 'user-1',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLogger (Phase 22)', () => {
  beforeEach(() => {
    setupDb();
  });

  afterEach(() => {
    db.close();
  });

  // Test 1
  it('log() writes a structured entry to the audit_log table', () => {
    logEntry({ eventType: 'credential:stored', userId: 'u1', username: 'bob', role: 'admin' });

    const row = db.get<{
      id: string;
      event_type: string;
      user_id: string;
      username: string;
      role: string;
      details: string;
    }>('SELECT * FROM audit_log');

    expect(row).toBeDefined();
    expect(row!.event_type).toBe('credential:stored');
    expect(row!.user_id).toBe('u1');
    expect(row!.username).toBe('bob');
    expect(row!.role).toBe('admin');
    expect(row!.id).toMatch(/^aud_/);
    expect(row!.details).toBeTruthy();
  });

  // Test 2
  it('query() returns entries matching the eventType filter', () => {
    logEntry({ eventType: 'user:login' });
    logEntry({ eventType: 'rbac:access_denied' });
    logEntry({ eventType: 'user:login' });

    const result = logger.query({ eventType: 'user:login' });

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.eventType).toBe('user:login');
    }
  });

  // Test 3
  it('query() respects limit and offset for pagination', () => {
    for (let i = 0; i < 5; i++) {
      logEntry({ eventType: 'user:login', userId: `user-${i}` });
    }

    const page1 = logger.query({ limit: 2, offset: 0 });
    const page2 = logger.query({ limit: 2, offset: 2 });
    const page3 = logger.query({ limit: 2, offset: 4 });

    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    expect(page2.entries).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    expect(page3.entries).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  // Test 4
  it('purge() removes entries older than the retention threshold', () => {
    // Insert a very old entry directly into the DB (timestamp in the past)
    const oldTimestamp = new Date(Date.now() - 40 * 86_400_000).toISOString(); // 40 days ago
    db.db.prepare(`
      INSERT INTO audit_log (id, event_type, details, timestamp)
      VALUES ('old-entry', 'user:login', '{}', ?)
    `).run(oldTimestamp);

    // Insert a recent entry
    logEntry({ eventType: 'user:logout' });

    // Confirm 2 entries exist
    const before = logger.query({});
    expect(before.total).toBe(2);

    // Purge entries older than 30 days
    const deleted = logger.purge(30);

    expect(deleted).toBe(1);
    const after = logger.query({});
    expect(after.total).toBe(1);
    expect(after.entries[0].eventType).toBe('user:logout');
  });

  // Test 5
  it('exportJson() returns a valid JSON string containing all audit entries', () => {
    logEntry({ eventType: 'vault:unlocked', username: 'carol' });
    logEntry({ eventType: 'vault:locked', username: 'carol' });

    const json = logger.exportJson({});
    const parsed = JSON.parse(json) as unknown[];

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    const entries = parsed as Array<{ eventType: string; username: string }>;
    const eventTypes = entries.map((e) => e.eventType);
    expect(eventTypes).toContain('vault:unlocked');
    expect(eventTypes).toContain('vault:locked');
  });

  // Test 6
  it('exportCsv() returns a CSV string with a header row and one data row per entry', () => {
    logEntry({ eventType: 'rbac:access_granted', username: 'dave', role: 'viewer' });
    logEntry({ eventType: 'rbac:access_denied', username: 'eve', role: 'viewer' });

    const csv = logger.exportCsv({});
    const lines = csv.split('\n');

    // First line is the header
    expect(lines[0]).toContain('event_type');
    expect(lines[0]).toContain('username');

    // Two data rows
    expect(lines).toHaveLength(3); // header + 2 entries

    // Content check — usernames must appear in the CSV
    expect(csv).toContain('dave');
    expect(csv).toContain('eve');
  });
});
