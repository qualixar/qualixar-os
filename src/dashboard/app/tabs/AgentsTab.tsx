/**
 * Qualixar OS Phase 7 -- Agents Tab
 * Agent list with status badges, per-agent cost.
 * Data from GET /api/agents -> { agents: AgentEntry[] }
 * AgentEntry: { id, status, role, model?, costUsd?, task_id? }
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentStatusType(status: string): 'active' | 'completed' | 'error' | 'idle' {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'idle' || status === 'terminated') return 'idle';
  return 'active';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const agentColumns = [
  {
    key: 'id',
    header: 'Agent ID',
    render: (row: Record<string, unknown>) => (row.id as string).slice(0, 12) + '...',
  },
  { key: 'role', header: 'Role' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={agentStatusType(row.status as string)}
        label={row.status as string}
      />
    ),
  },
  {
    key: 'task_id',
    header: 'Task',
    render: (row: Record<string, unknown>) =>
      row.task_id ? (row.task_id as string).slice(0, 8) + '...' : '--',
  },
];

// ---------------------------------------------------------------------------
// Communication event types
// ---------------------------------------------------------------------------

interface CommEvent {
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly time: string;
  readonly fullPayload: string;
}

interface LifecycleEvent {
  readonly type: string;
  readonly agentId: string;
  readonly agentIdShort: string;
  readonly role: string;
  readonly taskId: string;
  readonly time: string;
}

const lifecycleColumns = [
  {
    key: 'type',
    header: 'Event',
    render: (row: Record<string, unknown>) => {
      const t = row.type as string;
      const label = t.replace('agent:', '');
      const status = label === 'completed' ? 'completed' : label === 'failed' ? 'error' : 'active';
      return <StatusBadge status={status} label={label} />;
    },
  },
  { key: 'agentIdShort', header: 'Agent' },
  { key: 'role', header: 'Role' },
  { key: 'taskId', header: 'Task' },
  { key: 'time', header: 'Time' },
];

const commColumns = [
  {
    key: 'type',
    header: 'Type',
    render: (row: Record<string, unknown>) => {
      const t = (row.type as string).replace(':', ' ');
      return <StatusBadge status="active" label={t} />;
    },
  },
  { key: 'from', header: 'From' },
  { key: 'to', header: 'To' },
  { key: 'content', header: 'Content' },
  { key: 'time', header: 'Time' },
];

// ---------------------------------------------------------------------------
// Agent Detail Modal
// ---------------------------------------------------------------------------

function AgentDetailModal({
  agentId,
  onClose,
}: {
  readonly agentId: string;
  readonly onClose: () => void;
}): React.ReactElement {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${agentId}/detail`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { if (!cancelled) setDetail(data as Record<string, unknown>); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [agentId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const agent = detail?.agent as Record<string, unknown> | undefined;
  const calls = (detail?.calls ?? []) as readonly Record<string, unknown>[];

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>x</button>
        {error && <div className="toast-error" style={{ padding: 12 }}>Error: {error}</div>}
        {!detail && !error && <LoadingSpinner message="Loading agent detail..." />}
        {agent && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>
              Agent: {(agent.role as string) ?? 'Unknown'}
            </h2>
            <div className="detail-row">
              <span className="detail-label">ID</span>
              <span className="detail-value">{agent.id as string}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Model</span>
              <span className="detail-value">{(agent.model as string) ?? '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <StatusBadge status={agentStatusType((agent.status as string) ?? 'idle')} label={(agent.status as string) ?? 'idle'} />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Task</span>
              <span className="detail-value">{((agent.task_id as string) ?? '--').slice(0, 12)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Cost</span>
              <span className="detail-value">${((agent.cost_usd as number) ?? 0).toFixed(4)}</span>
            </div>
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h3>Agent Output</h3>
              {agent.output ? (
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', maxHeight: 300, overflow: 'auto' }}>
                  {(agent.output as string).slice(0, 5000)}
                </pre>
              ) : (
                <div className="table-empty">No output recorded (agent may predate Session 7)</div>
              )}
            </div>
            {calls.length > 0 && (
              <div className="detail-section" style={{ marginTop: 12 }}>
                <h3>Model Calls ({calls.length})</h3>
                {calls.map((mc, i) => (
                  <div key={i} className="detail-row">
                    <span className="detail-label">{mc.model as string}</span>
                    <span className="detail-value">
                      {mc.input_tokens as number}in / {mc.output_tokens as number}out — ${((mc.cost_usd as number) ?? 0).toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentsTab(): React.ReactElement {
  const agents = useDashboardStore((s) => s.agents);
  const events = useDashboardStore((s) => s.events);
  const [expandedComm, setExpandedComm] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleLifecycleClick = useCallback((row: Record<string, unknown>) => {
    const id = row.agentId as string;
    if (id && id !== '--') setSelectedAgentId(id);
  }, []);
  const handleCloseAgentModal = useCallback(() => setSelectedAgentId(null), []);

  const summary = useMemo(() => {
    const idle = agents.filter((a) => agentStatusType(a.status) === 'idle').length;
    const active = agents.filter((a) => agentStatusType(a.status) === 'active').length;
    const completed = agents.filter((a) => agentStatusType(a.status) === 'completed').length;
    const failed = agents.filter((a) => agentStatusType(a.status) === 'error').length;
    return { idle, active, completed, failed, total: agents.length };
  }, [agents]);

  // Agent lifecycle events
  const agentLifecycle = useMemo((): LifecycleEvent[] => {
    return (events ?? [])
      .filter((e) => e.type?.startsWith('agent:'))
      .map((e) => {
        let p: Record<string, unknown> = {};
        try { p = JSON.parse(e.payload); } catch { /* empty */ }
        const fullId = (p.agentId as string) ?? '--';
        return {
          type: e.type,
          agentId: fullId,
          agentIdShort: fullId.slice(0, 12),
          role: (p.role as string) ?? '--',
          taskId: ((p.taskId as string) ?? '--').slice(0, 12),
          time: new Date(e.created_at).toLocaleTimeString(),
        };
      });
  }, [events]);

  // Communication events
  const commEvents = useMemo((): CommEvent[] => {
    return (events ?? [])
      .filter((e) =>
        ['message:sent', 'message:received', 'handoff:occurred'].includes(e.type),
      )
      .map((e) => {
        let p: Record<string, unknown> = {};
        try { p = JSON.parse(e.payload); } catch { /* empty */ }
        return {
          type: e.type,
          from: ((p.from as string) ?? '--').slice(0, 12),
          to: ((p.to as string) ?? '--').slice(0, 12),
          content: ((p.content as string) ?? (p.reason as string) ?? '--').slice(0, 100),
          time: new Date(e.created_at).toLocaleTimeString(),
          fullPayload: e.payload,
        };
      });
  }, [events]);

  const handleCommClick = (row: Record<string, unknown>) => {
    const payload = row.fullPayload as string;
    setExpandedComm(expandedComm === payload ? null : payload);
  };

  return (
    <div className="tab-grid">
      <Card title="Agent Summary">
        <div className="stat-grid">
          <div className="stat-item">
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#6b7280' }}>{summary.idle}</span>
            <span className="stat-label">Idle</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#22c55e' }}>{summary.active}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#3b82f6' }}>{summary.completed}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#ef4444' }}>{summary.failed}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>
      </Card>

      <Card title="Agent Registry" subtitle="Click a row to see agent detail" className="span-2">
        <DataTable
          columns={agentColumns}
          data={agents as unknown as Record<string, unknown>[]}
          emptyMessage="No agents registered"
          onRowClick={(row) => {
            const id = row.id as string;
            if (id) setSelectedAgentId(id);
          }}
        />
      </Card>

      <Card title="Agent Lifecycle" subtitle="Click a row to see agent detail" className="span-2">
        <DataTable
          columns={lifecycleColumns}
          data={agentLifecycle as unknown as Record<string, unknown>[]}
          emptyMessage="No agent lifecycle events yet -- submit a task"
          onRowClick={handleLifecycleClick}
        />
      </Card>

      {selectedAgentId && (
        <AgentDetailModal agentId={selectedAgentId} onClose={handleCloseAgentModal} />
      )}

      <Card title="Agent Communication" subtitle="Messages, handoffs between agents" className="span-2">
        <DataTable
          columns={commColumns}
          data={commEvents as unknown as Record<string, unknown>[]}
          emptyMessage="No agent communication events yet"
          onRowClick={handleCommClick}
        />
        {expandedComm && (
          <div className="detail-section" style={{ marginTop: 12 }}>
            <h3>Full Payload</h3>
            <pre style={{ fontSize: '0.75rem', maxHeight: 200, overflow: 'auto' }}>
              {(() => {
                try { return JSON.stringify(JSON.parse(expandedComm), null, 2); }
                catch { return expandedComm; }
              })()}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
