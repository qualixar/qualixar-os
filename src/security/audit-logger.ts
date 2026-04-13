// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Audit Logger
 * LLD Section 2.8
 *
 * Immutable append-only security event recording to SQLite.
 * Emits 'security:audit_logged' event via EventBus.
 */

import { randomUUID } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { AuditEvent } from '../types/common.js';

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

export interface AuditQueryOptions {
  readonly eventType?: string;
  readonly severity?: string;
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Audit Log Row (returned from query)
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  readonly id: string;
  readonly event_type: string;
  readonly severity: string;
  readonly details: string;
  readonly source: string;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AuditLoggerImpl {
  constructor(
    private readonly db: QosDatabase,
    private readonly eventBus: EventBus,
  ) {}

  log(event: AuditEvent): void {
    const id = randomUUID();
    const created_at = new Date().toISOString();

    // INSERT via prepared statement
    this.db.insert('security_audit_log', {
      id,
      event_type: event.event_type,
      severity: event.severity,
      details: event.details,
      source: event.source,
      created_at,
    });

    // Emit event
    this.eventBus.emit({
      type: 'security:audit_logged',
      payload: {
        id,
        eventType: event.event_type,
        severity: event.severity,
        source: event.source,
        timestamp: created_at,
      },
      source: 'audit-logger',
    });
  }

  query(options: AuditQueryOptions): AuditLogRow[] {
    let sql = 'SELECT * FROM security_audit_log WHERE 1=1';
    const params: unknown[] = [];

    if (options.eventType !== undefined) {
      sql += ' AND event_type = ?';
      params.push(options.eventType);
    }

    if (options.severity !== undefined) {
      sql += ' AND severity = ?';
      params.push(options.severity);
    }

    sql += ' ORDER BY created_at DESC';

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.query<AuditLogRow>(sql, params);
  }
}
