/**
 * Qualixar OS Phase 2 -- Audit Logger Tests
 * TDD: INSERT logging, EventBus emission, query filtering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import { AuditLoggerImpl } from '../../src/security/audit-logger.js';
import { phase2Migrations } from '../../src/db/migrations/phase2.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let db: QosDatabase;
let eventBus: EventBus;
let auditLogger: AuditLoggerImpl;

function setupDb(): void {
  db = createDatabase(':memory:');
  // Apply phase 2 migrations
  const runner = new MigrationRunner(db.db);
  runner.registerMigrations([...phase2Migrations]);
  runner.applyPending();
  eventBus = createEventBus(db);
  auditLogger = new AuditLoggerImpl(db, eventBus);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLoggerImpl', () => {
  beforeEach(() => {
    setupDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('log()', () => {
    it('inserts a record into security_audit_log', () => {
      auditLogger.log({
        event_type: 'violation',
        severity: 'critical',
        details: '{"test": true}',
        source: 'test-source',
      });

      const rows = db.query<{ id: string; event_type: string; severity: string }>(
        'SELECT id, event_type, severity FROM security_audit_log',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe('violation');
      expect(rows[0].severity).toBe('critical');
      expect(rows[0].id).toBeTruthy();
    });

    it('generates unique IDs for each log entry', () => {
      auditLogger.log({
        event_type: 'event1',
        severity: 'info',
        details: '{}',
        source: 'test',
      });
      auditLogger.log({
        event_type: 'event2',
        severity: 'info',
        details: '{}',
        source: 'test',
      });

      const rows = db.query<{ id: string }>(
        'SELECT id FROM security_audit_log',
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].id).not.toBe(rows[1].id);
    });

    it('stores details as-is (JSON string)', () => {
      const details = JSON.stringify({ action: 'test', key: 'value' });
      auditLogger.log({
        event_type: 'test',
        severity: 'info',
        details,
        source: 'test',
      });

      const row = db.get<{ details: string }>(
        'SELECT details FROM security_audit_log',
      );
      expect(row?.details).toBe(details);
    });

    it('stores created_at timestamp', () => {
      auditLogger.log({
        event_type: 'test',
        severity: 'info',
        details: '{}',
        source: 'test',
      });

      const row = db.get<{ created_at: string }>(
        'SELECT created_at FROM security_audit_log',
      );
      expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('emits security:audit_logged event via EventBus', () => {
      let emitted = false;
      let emittedPayload: Record<string, unknown> = {};

      eventBus.on('security:audit_logged', async (event) => {
        emitted = true;
        emittedPayload = event.payload;
      });

      auditLogger.log({
        event_type: 'violation',
        severity: 'critical',
        details: '{}',
        source: 'test-src',
      });

      // EventBus is fire-and-forget async, but events table should have it
      const events = db.query<{ type: string; payload: string }>(
        "SELECT type, payload FROM events WHERE type = 'security:audit_logged'",
      );
      expect(events).toHaveLength(1);
      const payload = JSON.parse(events[0].payload);
      expect(payload.eventType).toBe('violation');
      expect(payload.severity).toBe('critical');
      expect(payload.source).toBe('test-src');
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      auditLogger.log({ event_type: 'violation', severity: 'critical', details: '{}', source: 'a' });
      auditLogger.log({ event_type: 'policy_evaluated', severity: 'info', details: '{}', source: 'b' });
      auditLogger.log({ event_type: 'violation', severity: 'warning', details: '{}', source: 'c' });
    });

    it('returns all entries when no filters', () => {
      const results = auditLogger.query({});
      expect(results).toHaveLength(3);
    });

    it('filters by eventType', () => {
      const results = auditLogger.query({ eventType: 'violation' });
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.event_type).toBe('violation');
      }
    });

    it('filters by severity', () => {
      const results = auditLogger.query({ severity: 'critical' });
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('critical');
    });

    it('applies limit', () => {
      const results = auditLogger.query({ limit: 1 });
      expect(results).toHaveLength(1);
    });

    it('orders by created_at DESC', () => {
      const results = auditLogger.query({});
      // All have close timestamps, but order should be DESC
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].created_at >= results[i + 1].created_at).toBe(true);
      }
    });

    it('combines eventType and severity filters', () => {
      const results = auditLogger.query({
        eventType: 'violation',
        severity: 'critical',
      });
      expect(results).toHaveLength(1);
    });
  });
});
