/**
 * Qualixar OS Phase 22 Enterprise — AuditTab
 * Full-page audit log viewer. Filterable, paginated, exportable.
 * Admin-only purge with confirmation dialog.
 * API: GET /api/enterprise/audit (filter + pagination)
 *      GET /api/enterprise/audit/export?format=csv|json
 *      DELETE /api/enterprise/audit (purge, admin only)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { springGentle, springSnappy } from '../lib/motion-presets.js';
import { Card, LoadingSpinner, GlassModal } from '../components/shared.js';
import { AuditLogViewer } from '../components/enterprise/AuditLogViewer.js';
import { PermissionGate } from '../components/enterprise/PermissionGate.js';
import type { AuditEntry } from '../components/enterprise/AuditLogViewer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditFilters {
  readonly eventType: string;
  readonly userId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly resource: string;
}

interface PaginationState {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
}

interface AuditTabProps {
  readonly currentUserRole?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  '', 'login', 'logout', 'create', 'update', 'delete',
  'export', 'purge', 'rotate', 'permission',
] as const;

const PAGE_SIZES = [25, 50, 100] as const;

const EMPTY_FILTERS: AuditFilters = {
  eventType: '',
  userId: '',
  dateFrom: '',
  dateTo: '',
  resource: '',
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function buildQueryString(filters: AuditFilters, pagination: PaginationState): string {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId)    params.set('userId', filters.userId);
  if (filters.dateFrom)  params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo)    params.set('dateTo', filters.dateTo);
  if (filters.resource)  params.set('resource', filters.resource);
  params.set('limit', String(pagination.limit));
  params.set('offset', String(pagination.offset));
  return params.toString();
}

interface AuditResponse {
  readonly entries: readonly AuditEntry[];
  readonly total: number;
}

async function fetchAuditLogs(filters: AuditFilters, pagination: PaginationState): Promise<AuditResponse> {
  const qs = buildQueryString(filters, pagination);
  const res = await fetch(`/api/enterprise/audit?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json() as Promise<AuditResponse>;
}

async function purgeAuditLogs(): Promise<void> {
  const res = await fetch('/api/enterprise/audit', { method: 'DELETE' });
  if (!res.ok) throw new Error('Purge failed');
}

function downloadExport(format: 'csv' | 'json', filters: AuditFilters): void {
  const params = new URLSearchParams({ format });
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.userId)    params.set('userId', filters.userId);
  if (filters.dateFrom)  params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo)    params.set('dateTo', filters.dateTo);
  if (filters.resource)  params.set('resource', filters.resource);
  window.open(`/api/enterprise/audit/export?${params.toString()}`, '_blank');
}

// ---------------------------------------------------------------------------
// Purge confirmation dialog
// ---------------------------------------------------------------------------

interface PurgeDialogProps {
  readonly onConfirm: () => Promise<void>;
  readonly onClose: () => void;
}

function PurgeDialog({ onConfirm, onClose }: PurgeDialogProps): React.ReactElement {
  const [purging, setPurging] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setPurging(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge failed');
    } finally {
      setPurging(false);
    }
  }, [onConfirm, onClose]);

  return (
    <GlassModal isOpen onClose={onClose} maxWidth={420}>
      <div style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 8px', color: '#ef4444' }}>Purge Audit Logs</h3>
        <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          This will permanently delete ALL audit log entries. This action cannot be undone.
        </p>
        {error && (
          <p style={{ fontSize: '0.8rem', color: '#ef4444', marginBottom: '12px' }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={purging}>Cancel</button>
          <button className="btn btn-danger" onClick={() => void handleConfirm()} disabled={purging}>
            {purging ? 'Purging…' : 'Yes, Purge All'}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export function AuditTab({ currentUserRole = 'viewer' }: AuditTabProps): React.ReactElement {
  const [entries, setEntries]   = useState<readonly AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filters, setFilters]   = useState<AuditFilters>(EMPTY_FILTERS);
  const [pagination, setPagination] = useState<PaginationState>({ limit: 25, offset: 0, total: 0 });
  const [showPurge, setShowPurge]   = useState(false);

  const load = useCallback(async (f: AuditFilters, p: PaginationState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLogs(f, p);
      setEntries(res.entries);
      setPagination((prev) => ({ ...prev, total: res.total }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters, pagination);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = useCallback(() => {
    const reset = { ...pagination, offset: 0 };
    setPagination(reset);
    void load(filters, reset);
  }, [filters, pagination, load]);

  const handleClearFilters = useCallback(() => {
    const reset: PaginationState = { limit: 25, offset: 0, total: 0 };
    setFilters(EMPTY_FILTERS);
    setPagination(reset);
    void load(EMPTY_FILTERS, reset);
  }, [load]);

  const handlePage = useCallback((dir: 'prev' | 'next') => {
    const newOffset = dir === 'next'
      ? pagination.offset + pagination.limit
      : Math.max(0, pagination.offset - pagination.limit);
    const next = { ...pagination, offset: newOffset };
    setPagination(next);
    void load(filters, next);
  }, [pagination, filters, load]);

  const handlePurgeConfirm = useCallback(async () => {
    await purgeAuditLogs();
    void load(filters, { ...pagination, offset: 0 });
  }, [filters, pagination, load]);

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="tab-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Audit Log</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {pagination.total.toLocaleString()} total entries
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => downloadExport('csv', filters)}>
            Export CSV
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => downloadExport('json', filters)}>
            Export JSON
          </button>
          <PermissionGate role={currentUserRole} resource="audit" action="purge">
            <button className="btn btn-danger" style={{ fontSize: '0.8rem' }} onClick={() => setShowPurge(true)}>
              Purge Logs
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Filters */}
      <Card title="Filters" className="mb-4">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <select className="glass-input" value={filters.eventType} onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t || 'All events'}</option>)}
          </select>
          <input className="glass-input" placeholder="User ID" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} style={{ minWidth: '140px' }} />
          <input className="glass-input" placeholder="Resource" value={filters.resource} onChange={(e) => setFilters((f) => ({ ...f, resource: e.target.value }))} style={{ minWidth: '130px' }} />
          <input type="date" className="glass-input" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" className="glass-input" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <select className="glass-input" value={pagination.limit} onChange={(e) => setPagination((p) => ({ ...p, limit: Number(e.target.value), offset: 0 }))}>
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={handleApplyFilters}>Apply Filters</button>
          <button className="btn btn-ghost" onClick={handleClearFilters}>Clear</button>
        </div>
      </Card>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springSnappy}
            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Log viewer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springGentle}>
        <AuditLogViewer entries={entries} loading={loading} />
      </motion.div>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springGentle}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}
        >
          <span>
            Showing {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total.toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => handlePage('prev')} disabled={pagination.offset === 0}>
              ← Prev
            </button>
            <span style={{ padding: '0 8px', lineHeight: '30px' }}>Page {currentPage} / {totalPages}</span>
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => handlePage('next')} disabled={pagination.offset + pagination.limit >= pagination.total}>
              Next →
            </button>
          </div>
        </motion.div>
      )}

      {showPurge && (
        <PurgeDialog onConfirm={handlePurgeConfirm} onClose={() => setShowPurge(false)} />
      )}
    </div>
  );
}

export default AuditTab;
