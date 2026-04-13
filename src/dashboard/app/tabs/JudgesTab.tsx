/**
 * Qualixar OS Phase 7 -- Judges Tab
 * Verdict timeline (Recharts LineChart), per-judge metrics, consensus results.
 * Data from GET /api/judges/results -> { results: JudgeResult[] }
 * JudgeResult: { judgeModel, verdict, score, feedback?, issues?, durationMs? }
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboardStore } from '../store.js';
import type { JudgeResult } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictStatus(verdict: string): 'active' | 'completed' | 'error' {
  if (verdict === 'approve') return 'completed';
  if (verdict === 'reject') return 'error';
  return 'active'; // revise
}

// ---------------------------------------------------------------------------
// Feedback expander
// ---------------------------------------------------------------------------

function FeedbackCell({ result }: { readonly result: JudgeResult }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const feedback = result.feedback ?? '';
  const preview = feedback.slice(0, 80);
  const hasMore = feedback.length > 80;

  return (
    <div className="feedback-cell">
      <span>{expanded ? feedback : preview}{hasMore && !expanded ? '...' : ''}</span>
      {hasMore && (
        <button className="feedback-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict Detail Modal
// ---------------------------------------------------------------------------

function VerdictDetailModal({
  result,
  onClose,
}: {
  readonly result: JudgeResult;
  readonly onClose: () => void;
}): React.ReactElement {
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
        <button className="modal-close" onClick={onClose}>x</button>

        <h2 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>
          Judge Verdict Detail
        </h2>

        <div className="detail-row">
          <span className="detail-label">Model</span>
          <span className="detail-value">{result.judgeModel}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Verdict</span>
          <span className="detail-value">
            <StatusBadge status={verdictStatus(result.verdict)} label={result.verdict} />
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Score</span>
          <span className="detail-value">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 100, height: 8, borderRadius: 4,
                backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${result.score * 100}%`, height: '100%',
                  backgroundColor: result.score >= 0.7 ? '#22c55e' : result.score >= 0.4 ? '#f59e0b' : '#ef4444',
                  borderRadius: 4,
                }} />
              </div>
              <span>{result.score.toFixed(2)}</span>
            </div>
          </span>
        </div>
        {result.durationMs !== undefined && (
          <div className="detail-row">
            <span className="detail-label">Duration</span>
            <span className="detail-value">{(result.durationMs / 1000).toFixed(1)}s</span>
          </div>
        )}

        {result.feedback && (
          <div className="detail-section" style={{ marginTop: 16 }}>
            <h3>Full Feedback</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem' }}>
              {result.feedback}
            </pre>
          </div>
        )}

        {result.issues && result.issues.length > 0 && (
          <div className="detail-section" style={{ marginTop: 16 }}>
            <h3>Issues ({result.issues.length})</h3>
            {result.issues.map((issue, idx) => (
              <div key={idx} style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <span className={`issue-severity severity-${issue.severity}`}>{issue.severity}</span>
                  <span className="issue-category">[{issue.category}]</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)' }}>{issue.description}</div>
                {issue.suggestedFix && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Fix: {issue.suggestedFix}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const judgeColumns = [
  { key: 'judgeModel', header: 'Judge Model' },
  {
    key: 'verdict',
    header: 'Verdict',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={verdictStatus(row.verdict as string)}
        label={row.verdict as string}
      />
    ),
  },
  {
    key: 'score',
    header: 'Score',
    render: (row: Record<string, unknown>) => (row.score as number).toFixed(2),
  },
  {
    key: 'durationMs',
    header: 'Duration',
    render: (row: Record<string, unknown>) =>
      row.durationMs ? `${((row.durationMs as number) / 1000).toFixed(1)}s` : '--',
  },
];

// ---------------------------------------------------------------------------
// Judge Configuration (strictness + custom prompt)
// ---------------------------------------------------------------------------

function JudgeConfiguration(): React.ReactElement {
  const updateConfig = useDashboardStore((s) => s.updateConfig);
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const fetchConfig = useDashboardStore((s) => s.fetchConfig);

  const quality = (systemConfig as Record<string, unknown>).quality as Record<string, unknown> | undefined;
  const [strictness, setStrictness] = useState<string>((quality?.judge_strictness as string) ?? 'balanced');
  const [customPrompt, setCustomPrompt] = useState<string>((quality?.custom_judge_prompt as string) ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchConfig().then(() => {
      const state = useDashboardStore.getState();
      const q = (state.systemConfig as Record<string, unknown>).quality as Record<string, unknown> | undefined;
      if (q?.judge_strictness) setStrictness(q.judge_strictness as string);
      if (q?.custom_judge_prompt) setCustomPrompt(q.custom_judge_prompt as string);
    }).catch(() => {});
  }, [fetchConfig]);

  const handleSave = useCallback(() => {
    updateConfig({
      quality: {
        judge_strictness: strictness,
        ...(customPrompt.trim() ? { custom_judge_prompt: customPrompt.trim() } : {}),
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [strictness, customPrompt, updateConfig]);

  return (
    <Card title="Judge Configuration" subtitle="Customize how judges evaluate agent output">
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Strictness Level
          </label>
          <select
            value={strictness}
            onChange={(e) => setStrictness(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)', fontSize: '0.875rem',
            }}
          >
            <option value="strict">Strict — Reject on any quality issue</option>
            <option value="balanced">Balanced — Allow minor issues, reject significant ones</option>
            <option value="lenient">Lenient — Approve with minor/moderate issues</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Custom Judge Prompt (optional — overrides default evaluation criteria)
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="E.g.: Focus on code correctness and security. Ignore styling issues. Require 80% test coverage..."
            rows={4}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)', fontSize: '0.875rem',
              resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleSave} className="btn-primary" style={{ padding: '8px 24px' }}>
            Save Judge Settings
          </button>
          {saved && <span style={{ color: '#22c55e', fontSize: '0.8125rem' }}>Saved</span>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JudgesTab(): React.ReactElement {
  const judgeResults = useDashboardStore((s) => s.judgeResults);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const handleRowClick = useCallback((_row: Record<string, unknown>, index: number) => {
    setSelectedIdx(index);
  }, []);
  const handleCloseModal = useCallback(() => setSelectedIdx(null), []);

  const chartData = useMemo(
    () =>
      judgeResults.map((j, idx) => ({
        index: idx + 1,
        score: j.score,
        model: j.judgeModel,
      })),
    [judgeResults],
  );

  const summary = useMemo(() => {
    const approved = judgeResults.filter((j) => j.verdict === 'approve').length;
    const rejected = judgeResults.filter((j) => j.verdict === 'reject').length;
    const revised = judgeResults.filter((j) => j.verdict === 'revise').length;
    const avgScore = judgeResults.length > 0
      ? judgeResults.reduce((s, j) => s + j.score, 0) / judgeResults.length
      : 0;
    return { approved, rejected, revised, avgScore, total: judgeResults.length };
  }, [judgeResults]);

  return (
    <div className="tab-grid">
      <JudgeConfiguration />

      <Card title="Judge Summary">
        <div className="stat-grid">
          <div className="stat-item">
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">Total Verdicts</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#22c55e' }}>{summary.approved}</span>
            <span className="stat-label">Approved</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#ef4444' }}>{summary.rejected}</span>
            <span className="stat-label">Rejected</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#f59e0b' }}>{summary.revised}</span>
            <span className="stat-label">Revise</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{summary.avgScore.toFixed(2)}</span>
            <span className="stat-label">Avg Score</span>
          </div>
        </div>
      </Card>

      <Card title="Score Timeline">
        {chartData.length === 0 ? (
          <div className="table-empty">No verdicts yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <XAxis dataKey="index" stroke="#71717a" fontSize={12} />
              <YAxis domain={[0, 1]} stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value: number, name: string) => [value.toFixed(2), name]}
              />
              <Legend />
              <Line
                type="monotone" dataKey="score" stroke="#6366f1"
                strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Verdict History" subtitle="Click a row for full detail" className="span-2">
        <DataTable
          columns={judgeColumns}
          data={judgeResults as unknown as Record<string, unknown>[]}
          emptyMessage="No verdicts yet"
          onRowClick={handleRowClick}
        />
      </Card>

      {selectedIdx !== null && judgeResults[selectedIdx] && (
        <VerdictDetailModal result={judgeResults[selectedIdx]} onClose={handleCloseModal} />
      )}

      {judgeResults.some((j) => j.feedback) && (
        <Card title="Judge Feedback" className="span-2">
          <div className="feedback-list">
            {judgeResults.filter((j) => j.feedback).map((j, idx) => (
              <div key={idx} className="feedback-entry">
                <div className="feedback-header">
                  <StatusBadge status={verdictStatus(j.verdict)} label={j.verdict} />
                  <span className="feedback-model">{j.judgeModel}</span>
                  <span className="feedback-score">Score: {j.score.toFixed(2)}</span>
                </div>
                <FeedbackCell result={j} />
                {j.issues && j.issues.length > 0 && (
                  <div className="feedback-issues">
                    {j.issues.map((issue, iIdx) => (
                      <div key={iIdx} className="issue-item">
                        <span className={`issue-severity severity-${issue.severity}`}>{issue.severity}</span>
                        <span className="issue-category">[{issue.category}]</span>
                        <span className="issue-desc">{issue.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
