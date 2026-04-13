/**
 * Qualixar OS Phase 22 Enterprise — AuditLogViewer
 * Reusable sortable audit log table with row expansion for full details
 * and color-coded event types. Used by AuditTab.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { springGentle, springSnappy } from '../../lib/motion-presets.js';
import { LoadingSpinner } from '../shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly eventType: string;
  readonly userId: string | null;
  readonly role: string | null;
  readonly resource?: string;
  readonly resourceType?: string;
  readonly resourceId?: string | null;
  readonly details: string | Record<string, unknown>;
  readonly ip?: string;
  readonly ipAddress?: string | null;
  readonly metadata?: Record<string, unknown>;
}

interface AuditLogViewerProps {
  readonly entries: readonly AuditEntry[];
  readonly loading: boolean;
}

type SortField = 'timestamp' | 'eventType' | 'userId' | 'resource';

/** Safely stringify details — could be string or object */
function formatDetails(details: string | Record<string, unknown> | null | undefined): string {
  if (details == null) return '';
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
}

/** Resolve resource field — could be `resource` or `resourceType` */
function resolveResource(entry: AuditEntry): string {
  return entry.resource ?? entry.resourceType ?? '';
}

/** Resolve IP field — could be `ip` or `ipAddress` */
function resolveIp(entry: AuditEntry): string {
  return entry.ip ?? entry.ipAddress ?? '';
}
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Event type color map
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<string, { bg: string; fg: string }> = {
  login:         { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e' },
  logout:        { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' },
  create:        { bg: 'rgba(59,130,246,0.15)',  fg: '#3b82f6' },
  update:        { bg: 'rgba(245,158,11,0.15)',  fg: '#f59e0b' },
  delete:        { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444' },
  export:        { bg: 'rgba(139,92,246,0.15)',  fg: '#8b5cf6' },
  purge:         { bg: 'rgba(239,68,68,0.25)',   fg: '#ef4444' },
  rotate:        { bg: 'rgba(20,184,166,0.15)',  fg: '#14b8a6' },
  permission:    { bg: 'rgba(249,115,22,0.15)',  fg: '#f97316' },
};

const DEFAULT_EVENT_COLOR = { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' };

function eventColor(type: string) {
  const key = type.toLowerCase().split('_')[0] ?? '';
  return EVENT_COLORS[key] ?? DEFAULT_EVENT_COLOR;
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

function getSortValue(entry: AuditEntry, field: SortField): string {
  if (field === 'resource') return resolveResource(entry);
  return String(entry[field] ?? '');
}

function sortEntries(
  entries: readonly AuditEntry[],
  field: SortField,
  dir: SortDir,
): readonly AuditEntry[] {
  return [...entries].sort((a, b) => {
    const av = getSortValue(a, field);
    const bv = getSortValue(b, field);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// SortHeader sub-component
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  readonly label: string;
  readonly field: SortField;
  readonly current: SortField;
  readonly dir: SortDir;
  readonly onClick: (f: SortField) => void;
}

function SortHeader({ label, field, current, dir, onClick }: SortHeaderProps): React.ReactElement {
  const isActive = field === current;
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onClick(field)}
    >
      {label}
      {isActive && (
        <span style={{ marginLeft: '4px', fontSize: '0.7rem', opacity: 0.8 }}>
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AuditLogViewer({ entries, loading }: AuditLogViewerProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) return <LoadingSpinner message="Loading audit entries…" />;

  if (entries.length === 0) {
    return (
      <motion.div
        className="table-empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springGentle}
      >
        No audit entries found.
      </motion.div>
    );
  }

  const sorted = sortEntries(entries, sortField, sortDir);

  return (
    <div className="table-wrapper">
      <table className="data-table" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <SortHeader label="Timestamp" field="timestamp" current={sortField} dir={sortDir} onClick={handleSort} />
            <SortHeader label="Event"     field="eventType" current={sortField} dir={sortDir} onClick={handleSort} />
            <SortHeader label="User"      field="userId"    current={sortField} dir={sortDir} onClick={handleSort} />
            <th>Role</th>
            <SortHeader label="Resource"  field="resource"  current={sortField} dir={sortDir} onClick={handleSort} />
            <th>IP</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, idx) => {
            const ec = eventColor(entry.eventType);
            const isExpanded = expandedId === entry.id;
            return (
              <React.Fragment key={entry.id}>
                <motion.tr
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleExpand(entry.id)}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springGentle, delay: Math.min(idx * 0.02, 0.25) }}
                  title="Click to expand"
                >
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: ec.bg,
                      color: ec.fg,
                    }}>
                      {entry.eventType}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{entry.userId ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{entry.role ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{resolveResource(entry)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{resolveIp(entry)}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatDetails(entry.details)}
                  </td>
                </motion.tr>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.tr
                      key={`${entry.id}-expanded`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={springSnappy}
                    >
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div className="glass" style={{ padding: '12px', borderRadius: '8px', fontSize: '0.8rem' }}>
                          <div style={{ marginBottom: '6px' }}><strong>Full Details:</strong> {formatDetails(entry.details)}</div>
                          {entry.metadata && (
                            <pre style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', overflowX: 'auto' }}>
                              {JSON.stringify(entry.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
