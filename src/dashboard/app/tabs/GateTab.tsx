/**
 * Qualixar OS — GateTab
 * Human review workflow dashboard. Pending/approved/rejected items with
 * detail modal, feedback, and priority-based sorting.
 * Store: reviewItems, fetchReviewItems(), updateReviewItem(id, status, feedback?)
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewItem {
  readonly id: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly content: string;
  readonly status: 'pending' | 'approved' | 'rejected' | 'revised';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly feedback?: string;
}

type StatusFilter = 'all' | ReviewItem['status'];
type SortField = 'priority' | 'createdAt';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<ReviewItem['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<ReviewItem['priority'], { bg: string; fg: string }> = {
  critical: { bg: 'var(--danger)', fg: '#fff' },
  high: { bg: 'var(--warning)', fg: '#fff' },
  medium: { bg: 'var(--warning)', fg: '#000' },
  low: { bg: 'var(--text-muted)', fg: '#fff' },
};

const STATUS_MAP: Record<ReviewItem['status'], 'active' | 'completed' | 'error' | 'pending'> = {
  pending: 'pending',
  approved: 'completed',
  rejected: 'error',
  revised: 'active',
};

// ---------------------------------------------------------------------------
// PriorityBadge
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { readonly priority: ReviewItem['priority'] }): React.ReactElement {
  const colors = PRIORITY_COLORS[priority];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        backgroundColor: colors.bg,
        color: colors.fg,
      }}
    >
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ReviewStats
// ---------------------------------------------------------------------------

function ReviewStats({ items }: { readonly items: readonly ReviewItem[] }): React.ReactElement {
  const stats = useMemo(() => {
    const pending = items.filter((i) => i.status === 'pending').length;
    const approved = items.filter((i) => i.status === 'approved').length;
    const rejected = items.filter((i) => i.status === 'rejected').length;

    const reviewed = items.filter((i) => i.reviewedAt && i.createdAt);
    const avgMs = reviewed.length > 0
      ? reviewed.reduce((sum, i) => sum + (new Date(i.reviewedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / reviewed.length
      : 0;
    const avgHours = Math.round(avgMs / 3600000 * 10) / 10;

    return { pending, approved, rejected, avgHours };
  }, [items]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      <Card>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Pending Reviews</span>
          <span style={{ ...statValueStyle, color: 'var(--warning)' }}>{stats.pending}</span>
        </div>
      </Card>
      <Card>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Approved</span>
          <span style={{ ...statValueStyle, color: 'var(--success)' }}>{stats.approved}</span>
        </div>
      </Card>
      <Card>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Rejected</span>
          <span style={{ ...statValueStyle, color: 'var(--danger)' }}>{stats.rejected}</span>
        </div>
      </Card>
      <Card>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Avg Review Time</span>
          <span style={statValueStyle}>{stats.avgHours}h</span>
        </div>
      </Card>
    </div>
  );
}

const statCardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0',
};
const statLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px',
};
const statValueStyle: React.CSSProperties = {
  fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)',
};

// ---------------------------------------------------------------------------
// ReviewQueue
// ---------------------------------------------------------------------------

function ReviewQueue({
  items,
  onSelect,
  statusFilter,
  onFilterChange,
  sortField,
  sortDir,
  onSortChange,
}: {
  readonly items: readonly ReviewItem[];
  readonly onSelect: (item: ReviewItem) => void;
  readonly statusFilter: StatusFilter;
  readonly onFilterChange: (f: StatusFilter) => void;
  readonly sortField: SortField;
  readonly sortDir: SortDir;
  readonly onSortChange: (field: SortField) => void;
}): React.ReactElement {
  const filtered = useMemo(() => {
    const base = statusFilter === 'all' ? [...items] : items.filter((i) => i.status === statusFilter);

    return base.sort((a, b) => {
      if (sortField === 'priority') {
        const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return sortDir === 'asc' ? diff : -diff;
      }
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [items, statusFilter, sortField, sortDir]);

  const sortIndicator = (field: SortField): string => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const columns = [
    {
      key: 'priority' as const,
      label: `Priority${sortIndicator('priority')}`,
      render: (item: ReviewItem) => <PriorityBadge priority={item.priority} />,
      onClick: () => onSortChange('priority'),
      style: { cursor: 'pointer', userSelect: 'none' as const },
    },
    { key: 'taskId' as const, label: 'Task ID', render: (item: ReviewItem) => <code style={{ color: 'var(--info)' }}>{item.taskId}</code> },
    { key: 'agentId' as const, label: 'Agent', render: (item: ReviewItem) => <span style={{ color: 'var(--accent)' }}>{item.agentId}</span> },
    { key: 'status' as const, label: 'Status', render: (item: ReviewItem) => <StatusBadge status={STATUS_MAP[item.status]} label={item.status} /> },
    {
      key: 'createdAt' as const,
      label: `Created${sortIndicator('createdAt')}`,
      render: (item: ReviewItem) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{formatRelative(item.createdAt)}</span>,
      onClick: () => onSortChange('createdAt'),
      style: { cursor: 'pointer', userSelect: 'none' as const },
    },
    {
      key: 'actions' as const,
      label: 'Actions',
      render: (item: ReviewItem) => (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(item); }}
          style={reviewBtnStyle}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Review Queue</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['all', 'pending', 'approved', 'rejected', 'revised'] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                backgroundColor: statusFilter === f ? 'var(--info)' : 'var(--border-glass)',
                color: statusFilter === f ? '#fff' : 'var(--text-secondary)',
                transition: 'background-color 0.15s',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.onClick}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    ...col.style,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No review items match the current filter.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--bg-tertiary)',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const reviewBtnStyle: React.CSSProperties = {
  padding: '4px 14px',
  borderRadius: '6px',
  border: '1px solid var(--info)',
  backgroundColor: 'transparent',
  color: 'var(--info)',
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

// ---------------------------------------------------------------------------
// ReviewDetailPanel (modal)
// ---------------------------------------------------------------------------

function ReviewDetailPanel({
  item,
  onClose,
  onAction,
}: {
  readonly item: ReviewItem;
  readonly onClose: () => void;
  readonly onAction: (id: string, status: 'approved' | 'rejected' | 'revised', feedback?: string) => void;
}): React.ReactElement {
  const [feedback, setFeedback] = useState(item.feedback ?? '');
  const [confirming, setConfirming] = useState<'approved' | 'rejected' | 'revised' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirming) { setConfirming(null); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, confirming]);

  const handleConfirm = useCallback(() => {
    if (!confirming) return;
    onAction(item.id, confirming, feedback.trim() || undefined);
    onClose();
  }, [confirming, feedback, item.id, onAction, onClose]);

  const actionButtons: readonly { status: 'approved' | 'rejected' | 'revised'; label: string; color: string; hoverColor: string }[] = [
    { status: 'approved', label: 'Approve', color: 'var(--success)', hoverColor: 'var(--success)' },
    { status: 'rejected', label: 'Reject', color: 'var(--danger)', hoverColor: 'var(--danger)' },
    { status: 'revised', label: 'Request Revision', color: 'var(--warning)', hoverColor: 'var(--warning)' },
  ];

  return ReactDOM.createPortal(
    <div
      style={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.125rem', color: 'var(--text-primary)' }}>Review Detail</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <PriorityBadge priority={item.priority} />
              <StatusBadge status={STATUS_MAP[item.status]} label={item.status} />
            </div>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>&#x2715;</button>
        </div>

        {/* Context */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <DetailField label="Task ID" value={item.taskId} />
          <DetailField label="Agent" value={item.agentId} />
          <DetailField label="Created" value={formatTimestamp(item.createdAt)} />
          {item.reviewedAt && <DetailField label="Reviewed" value={formatTimestamp(item.reviewedAt)} />}
          {item.reviewer && <DetailField label="Reviewer" value={item.reviewer} />}
        </div>

        {/* Agent Output */}
        <div style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Agent Output
          </span>
          <div style={{
            padding: '14px',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '1px solid var(--bg-tertiary)',
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            lineHeight: 1.6,
            maxHeight: '200px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {item.content}
          </div>
        </div>

        {/* Feedback */}
        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="gate-feedback"
            style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}
          >
            Feedback
          </label>
          <textarea
            id="gate-feedback"
            ref={textareaRef}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback for the agent..."
            rows={3}
            style={textareaStyle}
          />
        </div>

        {/* Confirmation bar */}
        {confirming !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', marginBottom: '16px', borderRadius: '8px',
            backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)',
          }}>
            <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
              Confirm <strong>{confirming === 'revised' ? 'request revision' : confirming.replace('ed', '')}</strong>?
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirming(null)} style={{ ...confirmCancelStyle }}>Cancel</button>
              <button onClick={handleConfirm} style={{ ...confirmOkStyle }}>Confirm</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          {actionButtons.map((btn) => (
            <button
              key={btn.status}
              onClick={() => setConfirming(btn.status)}
              disabled={confirming !== null}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: confirming !== null ? 'not-allowed' : 'pointer',
                backgroundColor: btn.color,
                color: '#fff',
                opacity: confirming !== null ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!confirming) (e.currentTarget as HTMLElement).style.backgroundColor = btn.hoverColor; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = btn.color; }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// DetailField helper
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <div>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '2px' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Shared modal styles
// ---------------------------------------------------------------------------

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: '100%', maxWidth: '640px',
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border-glass)',
  borderRadius: '12px',
  padding: '28px',
  maxHeight: '85vh',
  overflowY: 'auto',
  boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: '1.25rem',
  cursor: 'pointer', padding: '4px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-glass)',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  resize: 'vertical',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const confirmCancelStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '6px',
  border: '1px solid var(--border-glass)', backgroundColor: 'transparent',
  color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer',
};

const confirmOkStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '6px',
  border: 'none', backgroundColor: 'var(--info)',
  color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
};

// ---------------------------------------------------------------------------
// GateTab (main export)
// ---------------------------------------------------------------------------

export default function GateTab(): React.ReactElement {
  const reviewItems = useDashboardStore((s) => s.reviewItems) ?? [];
  const fetchReviewItems = useDashboardStore((s) => s.fetchReviewItems);
  const updateReviewItem = useDashboardStore((s) => s.updateReviewItem);

  const [loading, setLoading] = useState(true);
  const [localItems, setLocalItems] = useState<readonly ReviewItem[]>([]);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Fetch or generate mock data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await fetchReviewItems();
      } catch {
        // store fetch failed — will fallback to mock
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [fetchReviewItems]);

  // Sync store items or fallback to mock
  useEffect(() => {
    if (!loading) {
      // H-22: No mock data — show real data or empty state
      setLocalItems(Array.isArray(reviewItems) ? reviewItems : []);
    }
  }, [loading, reviewItems]);

  // Sort toggle handler
  const handleSortChange = useCallback((field: SortField) => {
    setSortDir((prev) => (sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortField(field);
  }, [sortField]);

  // Review action handler
  const handleAction = useCallback(async (id: string, status: 'approved' | 'rejected' | 'revised', feedback?: string) => {
    // Optimistic local update
    const now = new Date().toISOString();
    setLocalItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status, feedback: feedback ?? item.feedback, reviewedAt: now, reviewer: 'varun' }
          : item,
      ),
    );

    // Persist to store
    try {
      await updateReviewItem(id, status, feedback);
    } catch {
      // Optimistic update stays — store sync will reconcile
    }
  }, [updateReviewItem]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700 }}>
          Human Review Gate
        </h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Review and approve agent outputs before they execute. Every critical action requires human sign-off.
        </p>
      </div>

      <ReviewStats items={localItems} />
      <ReviewQueue
        items={localItems}
        onSelect={setSelected}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={handleSortChange}
      />

      {selected && (
        <ReviewDetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
