// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Audit Logger
 *
 * Writes structured audit entries to the audit_log table.
 * Supports paginated query, CSV/JSON export, and purge with retention policy.
 * Emits events on the EventBus for real-time observability.
 *
 * HR-1: All DB operations via parameterized prepared statements.
 * HR-2: No mutation — query returns immutable arrays.
 */

import { randomBytes } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type {
  AuditLogger,
  AuditEntry,
  AuditLogQuery,
  AuditLogResult,
  AuditEventType,
  ResourceGroup,
  Role,
} from '../types/phase22.js';

// ---------------------------------------------------------------------------
// DB Row type
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  event_type: string;
  user_id: string | null;
  username: string | null;
  role: string | null;
  details: string;
  ip_address: string | null;
  user_agent: string | null;
  resource_type: string | null;
  resource_id: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newId(): string {
  return `aud_${randomBytes(12).toString('hex')}`;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    eventType: row.event_type as AuditEventType,
    userId: row.user_id,
    username: row.username,
    role: row.role as Role | null,
    details: (() => {
      try { return JSON.parse(row.details) as Record<string, unknown>; }
      catch { return {}; }
    })(),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    resourceType: row.resource_type as ResourceGroup | null,
    resourceId: row.resource_id,
    timestamp: row.timestamp,
  };
}

function buildWhereClause(filters: AuditLogQuery): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.eventType) {
    conditions.push('event_type = ?');
    params.push(filters.eventType);
  }
  if (filters.userId) {
    conditions.push('user_id = ?');
    params.push(filters.userId);
  }
  if (filters.username) {
    conditions.push('username = ?');
    params.push(filters.username);
  }
  if (filters.resourceType) {
    conditions.push('resource_type = ?');
    params.push(filters.resourceType);
  }
  if (filters.fromTimestamp) {
    conditions.push('timestamp >= ?');
    params.push(filters.fromTimestamp);
  }
  if (filters.toTimestamp) {
    conditions.push('timestamp <= ?');
    params.push(filters.toTimestamp);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class AuditLoggerImpl implements AuditLogger {
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;

  constructor(db: QosDatabase, eventBus: EventBus) {
    this._db = db;
    this._eventBus = eventBus;
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const id = newId();
    const timestamp = new Date().toISOString();
    this._db.insert('audit_log', {
      id,
      event_type: entry.eventType,
      user_id: entry.userId ?? null,
      username: entry.username ?? null,
      role: entry.role ?? null,
      details: JSON.stringify(entry.details),
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      timestamp,
    });

    // Fire-and-forget event for real-time observers
    this._eventBus.emit({
      type: 'security:audit_logged',
      payload: { auditId: id, eventType: entry.eventType },
      source: 'audit-logger',
    });
  }

  query(filters: AuditLogQuery): AuditLogResult {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const { clause, params } = buildWhereClause(filters);

    const countRow = this._db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM audit_log ${clause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    const rows = this._db.query<AuditRow>(
      `SELECT * FROM audit_log ${clause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      entries: rows.map(rowToEntry),
      total,
      hasMore: offset + rows.length < total,
    };
  }

  exportJson(filters: AuditLogQuery): string {
    const { entries } = this.query({ ...filters, limit: 100_000, offset: 0 });
    return JSON.stringify(entries, null, 2);
  }

  exportCsv(filters: AuditLogQuery): string {
    const { entries } = this.query({ ...filters, limit: 100_000, offset: 0 });
    const header = 'id,event_type,user_id,username,role,resource_type,resource_id,ip_address,timestamp';
    const rows = entries.map((e) =>
      [
        e.id,
        e.eventType,
        e.userId ?? '',
        e.username ?? '',
        e.role ?? '',
        e.resourceType ?? '',
        e.resourceId ?? '',
        e.ipAddress ?? '',
        e.timestamp,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...rows].join('\n');
  }

  purge(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
    const countRow = this._db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM audit_log WHERE timestamp < ?',
      [cutoff],
    );
    const count = countRow?.count ?? 0;
    if (count > 0) {
      this._db.db.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoff);
      this._eventBus.emit({
        type: 'audit:purged',
        payload: { deletedCount: count, cutoff },
        source: 'audit-logger',
      });
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAuditLogger(db: QosDatabase, eventBus: EventBus): AuditLogger {
  return new AuditLoggerImpl(db, eventBus);
}
