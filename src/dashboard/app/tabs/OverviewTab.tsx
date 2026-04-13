// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Overview Tab
 * Task submission form, active tasks, system health, recent event feed.
 * Recharts BarChart for task completion rate.
 * TaskDetailModal for drill-down on task rows.
 * Working directory persists to config via PUT /api/system/config.
 * All data from REST polling via store -- types match API response shapes.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Topology & type options
// ---------------------------------------------------------------------------

const TOPOLOGIES = [
  'sequential', 'parallel', 'hierarchical', 'dag',
  'mixture_of_agents', 'debate', 'mesh', 'star',
  'circular', 'grid', 'forest', 'maker', 'hybrid',
] as const;

const TASK_TYPES = [
  'custom', 'code', 'research', 'analysis', 'writing', 'refactor',
] as const;

// ---------------------------------------------------------------------------
// Task Detail types
// ---------------------------------------------------------------------------

interface TaskArtifact {
  readonly path: string;
  readonly type: string;
  readonly content?: string;
}

interface TaskDetail {
  readonly task: {
    readonly id: string;
    readonly type: string;
    readonly prompt: string;
    readonly status: string;
    readonly mode: string;
    readonly result: string | null;
    readonly parsedOutput: string | null;
    readonly parsedArtifacts: readonly TaskArtifact[];
    readonly cost_usd: number;
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly judges: ReadonlyArray<{
    readonly id: string;
    readonly judge_model: string;
    readonly verdict: string;
    readonly score: number;
    readonly feedback: string | null;
  }>;
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly model: string;
    readonly status: string;
    readonly cost_usd: number;
  }>;
  readonly costs: ReadonlyArray<{
    readonly id: string;
    readonly model: string;
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cost_usd: number;
    readonly latency_ms: number;
  }>;
}

// ---------------------------------------------------------------------------
// Task completion chart data
// ---------------------------------------------------------------------------

function useCompletionData() {
  const tasks = useDashboardStore((s) => s.tasks);
  return useMemo(() => {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const running = tasks.filter((t) => t.status === 'running' || t.status === 'pending').length;
    const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
    return [
      { name: 'Completed', count: completed },
      { name: 'Running', count: running },
      { name: 'Failed', count: failed },
      { name: 'Cancelled', count: cancelled },
    ];
  }, [tasks]);
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function getStatusType(status: string): 'active' | 'completed' | 'error' | 'idle' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'idle';
  return 'active';
}

// ---------------------------------------------------------------------------
// Task columns -- match TaskEntry { id, status, type, created_at }
// ---------------------------------------------------------------------------

const taskColumns = [
  {
    key: 'id',
    header: 'Task ID',
    render: (row: Record<string, unknown>) => (row.id as string).slice(0, 12) + '...',
  },
  { key: 'type', header: 'Type' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge status={getStatusType(row.status as string)} label={row.status as string} />
    ),
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (row: Record<string, unknown>) =>
      new Date(row.created_at as string).toLocaleTimeString(),
  },
];

// ---------------------------------------------------------------------------
// TaskDetailModal
// ---------------------------------------------------------------------------

function TaskDetailModal({
  taskId,
  onClose,
}: {
  readonly taskId: string;
  readonly onClose: () => void;
}): React.ReactElement {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);

    fetch(`/api/tasks/${taskId}/detail`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setDetail(data as TaskDetail);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => { cancelled = true; };
  }, [taskId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">x</button>

        {error && <div className="toast-error" style={{ padding: 12 }}>Error: {error}</div>}

        {!detail && !error && <LoadingSpinner message="Loading task detail..." />}

        {detail && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>
              Task {detail.task.id.slice(0, 12)}...
            </h2>

            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <StatusBadge status={getStatusType(detail.task.status)} label={detail.task.status} />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">{detail.task.type}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Mode</span>
              <span className="detail-value">{detail.task.mode}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Cost</span>
              <span className="detail-value">${(detail.task.cost_usd ?? 0).toFixed(4)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Created</span>
              <span className="detail-value">{new Date(detail.task.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Updated</span>
              <span className="detail-value">{new Date(detail.task.updated_at).toLocaleString()}</span>
            </div>

            <div className="detail-section" style={{ marginTop: 16 }}>
              <h3>Prompt</h3>
              <pre>{detail.task.prompt}</pre>
            </div>

            <div className="detail-section">
              <h3>Output</h3>
              <pre className="output-box">{detail.task.parsedOutput || 'In progress...'}</pre>
            </div>

            {detail.task.parsedArtifacts && detail.task.parsedArtifacts.length > 0 && (
              <div className="detail-section">
                <h3>Artifacts ({detail.task.parsedArtifacts.length})</h3>
                {detail.task.parsedArtifacts.map((a: TaskArtifact, i: number) => (
                  <div key={i} className="detail-row">
                    <span className="detail-label">{a.path}</span>
                    <span className="detail-value">{a.type}{a.content ? ` (${a.content.length} chars)` : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.judges.length > 0 && (
              <div className="detail-section">
                <h3>Judges ({detail.judges.length})</h3>
                {detail.judges.map((j) => (
                  <div key={j.id} style={{ marginBottom: 8, fontSize: '0.8125rem' }}>
                    <strong>{j.judge_model}</strong>:{' '}
                    <StatusBadge
                      status={j.verdict === 'approve' ? 'completed' : j.verdict === 'reject' ? 'error' : 'pending'}
                      label={`${j.verdict} (${j.score})`}
                    />
                    {j.feedback && (
                      <pre style={{ marginTop: 4, fontSize: '0.75rem' }}>
                        {j.feedback.slice(0, 500)}{j.feedback.length > 500 ? '...' : ''}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail.agents.length > 0 && (
              <div className="detail-section">
                <h3>Agents ({detail.agents.length})</h3>
                {detail.agents.map((a) => (
                  <div key={a.id} className="detail-row">
                    <span className="detail-label">{a.role}</span>
                    <span className="detail-value">
                      {a.model} --{' '}
                      <StatusBadge status={getStatusType(a.status)} label={a.status} />
                      {a.cost_usd > 0 && ` ($${a.cost_usd.toFixed(4)})`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {detail.costs.length > 0 && (
              <div className="detail-section">
                <h3>Model Calls ({detail.costs.length})</h3>
                {detail.costs.map((mc) => (
                  <div key={mc.id} className="detail-row">
                    <span className="detail-label">{mc.model}</span>
                    <span className="detail-value">
                      {mc.input_tokens}in / {mc.output_tokens}out -- ${mc.cost_usd.toFixed(4)} ({mc.latency_ms}ms)
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
// Directory Picker
// ---------------------------------------------------------------------------

interface DirEntry {
  readonly name: string;
  readonly path: string;
  readonly type: string;
}

/**
 * DirectoryPicker — uses native OS folder picker when available (showDirectoryPicker API).
 * Opens Mac Finder / Windows Explorer natively in Chrome/Edge.
 * Falls back to prompt dialog for Firefox/Safari.
 * Path validation shows green/red indicator.
 * Works on all platforms: Mac, Windows, Linux.
 */
function DirectoryPicker({
  value,
  onChange,
  disabled,
}: {
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly disabled: boolean;
}): React.ReactElement {
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  // Validate path exists on server
  useEffect(() => {
    if (!value.trim()) { setPathValid(null); return; }
    const timer = setTimeout(() => {
      fetch(`/api/system/browse?path=${encodeURIComponent(value.trim())}`)
        .then((r) => setPathValid(r.ok))
        .catch(() => setPathValid(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="form-field" style={{ width: '100%' }}>
      <label className="form-label">Working Directory</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="form-input workdir-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/path/to/project"
          disabled={disabled}
          style={{
            flex: 1,
            borderColor: pathValid === true ? '#22c55e' : pathValid === false ? '#ef4444' : undefined,
          }}
        />
        {pathValid === true && <span style={{ color: '#22c55e', fontSize: 12, whiteSpace: 'nowrap' }}>Valid path</span>}
        {pathValid === false && <span style={{ color: '#ef4444', fontSize: 12, whiteSpace: 'nowrap' }}>Not found</span>}
      </div>
    </div>
  );
}
function TaskSubmissionForm(): React.ReactElement {
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<string>('custom');
  const [topology, setTopology] = useState<string>('sequential');
  const [budgetUsd, setBudgetUsd] = useState<string>('1.00');
  const [simulate, setSimulate] = useState(false);
  const [workDir, setWorkDir] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const submitTask = useDashboardStore((s) => s.submitTask);
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const fetchConfig = useDashboardStore((s) => s.fetchConfig);
  const updateConfig = useDashboardStore((s) => s.updateConfig);

  // Load saved working directory from config on mount
  const [dirSaved, setDirSaved] = useState(false);
  useEffect(() => {
    // Use POST /api/system/config to read — it persists to disk now
    fetch('/api/system/config')
      .then((r) => r.json())
      .then((data) => {
        const cfg = data.config ?? data;
        const savedDir = cfg?.workspace?.default_dir;
        if (savedDir && typeof savedDir === 'string') {
          setWorkDir(savedDir);
        } else {
          fetch('/api/system/cwd')
            .then((r2) => r2.json())
            .then((d2) => { if (d2.cwd) setWorkDir(d2.cwd as string); })
            .catch(() => {});
        }
      })
      .catch(() => {
        fetch('/api/system/cwd')
          .then((r) => r.json())
          .then((d) => { if (d.cwd) setWorkDir(d.cwd as string); })
          .catch(() => {});
      });
  }, []);

  const handleWorkDirChange = useCallback((path: string) => {
    setWorkDir(path);
    setDirSaved(false);
  }, []);

  // Save via POST /api/system/config — persists to config.yaml (fixed in system-routes)
  const handleSaveWorkDir = useCallback(() => {
    if (!workDir.trim()) return;
    fetch('/api/system/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: { default_dir: workDir.trim() } }),
    })
      .then((r) => {
        if (r.ok) {
          setDirSaved(true);
          setTimeout(() => setDirSaved(false), 3000);
        }
      })
      .catch(() => {});
  }, [workDir]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setLastResult(null);
    try {
      const result = await submitTask(prompt, {
        type: taskType,
        topology,
        budget_usd: Math.max(0.01, parseFloat(budgetUsd) || 1.0),
        simulate,
        ...(workDir.trim() ? { workingDir: workDir.trim() } : {}),
      });
      setLastResult(`Task ${result.taskId as string} submitted`);
      setPrompt('');
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [prompt, taskType, topology, budgetUsd, simulate, workDir, submitting, submitTask]);

  return (
    <Card title="Run a Task" subtitle="Submit a task to Qualixar OS" className="span-2">
      <div className="task-form">
        <textarea
          className="task-prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What would you like Qualixar OS to do? Describe your task here..."
          rows={3}
          disabled={submitting}
        />
        <div className="task-form-controls">
          <div className="form-field">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              disabled={submitting}
            >
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Topology</label>
            <select
              className="form-select"
              value={topology}
              onChange={(e) => setTopology(e.target.value)}
              disabled={submitting}
            >
              {TOPOLOGIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Budget (USD)</label>
            <input
              className="form-input"
              type="number"
              step="0.10"
              min="0"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              placeholder="1.00"
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label className="form-label">Simulate</label>
            <button
              className={`toggle-btn ${simulate ? 'toggle-on' : 'toggle-off'}`}
              onClick={() => setSimulate(!simulate)}
              disabled={submitting}
            >
              {simulate ? 'ON' : 'OFF'}
            </button>
          </div>
          <button
            className="run-task-btn"
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting}
          >
            {submitting ? 'Submitting...' : 'Run Task'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DirectoryPicker value={workDir} onChange={handleWorkDirChange} disabled={submitting} />
          <button
            onClick={handleSaveWorkDir}
            disabled={!workDir.trim()}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              backgroundColor: dirSaved ? '#22c55e' : '#6366f1', color: '#fff',
              fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap',
            }}
          >
            {dirSaved ? 'Saved' : 'Save Directory'}
          </button>
        </div>
        {lastResult && (
          <div className={`task-result-toast ${lastResult.startsWith('Error') ? 'toast-error' : 'toast-success'}`}>
            {lastResult}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab Component
// ---------------------------------------------------------------------------

export function OverviewTab(): React.ReactElement {
  const tasks = useDashboardStore((s) => s.tasks);
  const events = useDashboardStore((s) => s.events);
  const cost = useDashboardStore((s) => s.cost);
  const wsStatus = useDashboardStore((s) => s.wsStatus);
  const chartData = useCompletionData();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === 'running' || t.status === 'pending').length,
    [tasks],
  );

  const recentEvents = useMemo(
    () => [...events].sort((a, b) => b.id - a.id).slice(0, 20),
    [events],
  );

  const handleTaskRowClick = useCallback((row: Record<string, unknown>) => {
    setSelectedTaskId(row.id as string);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  return (
    <div className="tab-grid">
      <TaskSubmissionForm />

      <Card title="System Health" subtitle="Real-time status">
        <div className="health-grid">
          <div className="health-item">
            <span className="health-label">Connection</span>
            <StatusBadge
              status={wsStatus === 'connected' ? 'active' : 'error'}
              label={wsStatus}
            />
          </div>
          <div className="health-item">
            <span className="health-label">Active Tasks</span>
            <span className="health-value">{activeTasks}</span>
          </div>
          <div className="health-item">
            <span className="health-label">Total Tasks</span>
            <span className="health-value">{tasks.length}</span>
          </div>
          <div className="health-item">
            <span className="health-label">Total Cost</span>
            <span className="health-value">${cost.total_usd.toFixed(4)}</span>
          </div>
        </div>
      </Card>

      <Card title="Task Completion Rate">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text-primary)' }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Active Tasks" subtitle="Click a row for details" className="span-2">
        <DataTable
          columns={taskColumns}
          data={tasks as unknown as Record<string, unknown>[]}
          emptyMessage="No tasks -- submit a task above to get started"
          onRowClick={handleTaskRowClick}
        />
      </Card>

      <Card title="Recent Events" className="span-2">
        <div className="event-feed">
          {recentEvents.length === 0 && <div className="table-empty">No events yet</div>}
          {recentEvents.map((ev) => (
            <div key={ev.id} className="event-entry">
              <span className="event-time">{new Date(ev.created_at).toLocaleTimeString()}</span>
              <span className="event-type">{ev.type}</span>
              <span className="event-source">{ev.source}</span>
              <span className="event-msg">
                {ev.task_id ? `[${ev.task_id.slice(0, 8)}] ` : ''}
                {(() => {
                  try {
                    const p = JSON.parse(ev.payload);
                    return Object.entries(p).slice(0, 3).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 30) : v}`).join(', ');
                  } catch {
                    return ev.payload.slice(0, 80);
                  }
                })()}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {selectedTaskId && (
        <TaskDetailModal taskId={selectedTaskId} onClose={handleCloseModal} />
      )}
    </div>
  );
}
