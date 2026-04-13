/**
 * Qualixar OS Phase 18 -- Workflow Deployment UI
 * LLD Section 7.1: Deployment list, deploy wizard, undeploy, history
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from './shared.js';

interface Deployment {
  readonly id: string;
  readonly blueprintId: string;
  readonly blueprintName: string;
  readonly status: string;
  readonly triggerType: string;
  readonly cronExpression: string | null;
  readonly triggerEvent: string | null;
  readonly lastRunAt: string | null;
  readonly lastRunStatus: string | null;
  readonly runCount: number;
  readonly createdAt: string;
}

interface RunHistory {
  readonly taskId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly costUsd: number;
}

const TRIGGER_BADGES: Record<string, string> = {
  once: '▶ Once',
  cron: '🔄 Cron',
  event: '⚡ Event',
};

export function WorkflowDeploy(): React.ReactElement {
  const [deployments, setDeployments] = useState<readonly Deployment[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardBlueprintId, setWizardBlueprintId] = useState('');
  const [wizardTrigger, setWizardTrigger] = useState<'once' | 'cron' | 'event'>('once');
  const [wizardCron, setWizardCron] = useState('0 */6 * * *');
  const [wizardEvent, setWizardEvent] = useState('task:completed');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly RunHistory[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deploying, setDeploying] = useState(false);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch('/api/deployments');
      const data = await res.json() as { deployments: Deployment[] };
      setDeployments(data.deployments);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchDeployments(); }, [fetchDeployments]);

  const handleDeploy = useCallback(async () => {
    if (!wizardBlueprintId) {
      setToast({ msg: 'Select a blueprint', ok: false });
      return;
    }
    setDeploying(true);
    try {
      const body: Record<string, unknown> = {
        blueprintId: wizardBlueprintId,
        triggerType: wizardTrigger,
      };
      if (wizardTrigger === 'cron') body.cronExpression = wizardCron;
      if (wizardTrigger === 'event') body.triggerEvent = wizardEvent;

      const res = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowWizard(false);
        await fetchDeployments();
        setToast({ msg: 'Deployment created', ok: true });
      } else {
        const err = await res.json() as { error: string };
        setToast({ msg: err.error, ok: false });
      }
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Failed', ok: false });
    } finally {
      setDeploying(false);
    }
  }, [wizardBlueprintId, wizardTrigger, wizardCron, wizardEvent, fetchDeployments]);

  const handleUndeploy = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDeployments();
        setToast({ msg: 'Deployment cancelled', ok: true });
      }
    } catch { /* ignore */ }
  }, [fetchDeployments]);

  const handleShowHistory = useCallback(async (id: string) => {
    if (expandedHistory === id) {
      setExpandedHistory(null);
      return;
    }
    try {
      const res = await fetch(`/api/deployments/${id}/history`);
      const data = await res.json() as { runs: RunHistory[] };
      setHistory(data.runs);
      setExpandedHistory(id);
    } catch { /* ignore */ }
  }, [expandedHistory]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ color: 'var(--text-primary)' }}>Workflow Deployments</h3>
        <button className="save-settings-btn" onClick={() => setShowWizard(true)}>+ Deploy</button>
      </div>

      {toast && (
        <div className={`task-result-toast ${toast.ok ? 'toast-success' : 'toast-error'}`}
          onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      {/* Deploy Wizard Modal */}
      {showWizard && (
        <Card>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>New Deployment</h4>
          <div className="settings-row">
            <label className="settings-label">Blueprint ID</label>
            <input className="settings-input" value={wizardBlueprintId}
              onChange={(e) => setWizardBlueprintId(e.target.value)}
              placeholder="bp_..." />
          </div>
          <div className="settings-row">
            <label className="settings-label">Trigger Type</label>
            <select className="settings-input" value={wizardTrigger}
              onChange={(e) => setWizardTrigger(e.target.value as 'once' | 'cron' | 'event')}>
              <option value="once">Run Once</option>
              <option value="cron">Cron Schedule</option>
              <option value="event">Event Trigger</option>
            </select>
          </div>
          {wizardTrigger === 'cron' && (
            <div className="settings-row">
              <label className="settings-label">Cron Expression</label>
              <input className="settings-input" value={wizardCron}
                onChange={(e) => setWizardCron(e.target.value)}
                placeholder="0 */6 * * *" />
            </div>
          )}
          {wizardTrigger === 'event' && (
            <div className="settings-row">
              <label className="settings-label">Event Type</label>
              <input className="settings-input" value={wizardEvent}
                onChange={(e) => setWizardEvent(e.target.value)}
                placeholder="task:completed" />
            </div>
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button className="save-settings-btn" onClick={() => void handleDeploy()} disabled={deploying}>
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>
            <button className="settings-sm-btn" onClick={() => setShowWizard(false)}>Cancel</button>
          </div>
        </Card>
      )}

      {/* Deployment List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        {deployments.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
            No deployments yet. Click "+ Deploy" to create one.
          </div>
        )}
        {deployments.map((dep) => (
          <Card key={dep.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dep.blueprintName}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span>{TRIGGER_BADGES[dep.triggerType] ?? dep.triggerType}</span>
                  {dep.cronExpression && <span style={{ fontFamily: 'monospace' }}>{dep.cronExpression}</span>}
                  <span>Runs: {dep.runCount}</span>
                  {dep.lastRunAt && <span>Last: {new Date(dep.lastRunAt).toLocaleString()}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge
                  status={dep.status === 'active' ? 'active' : dep.status === 'cancelled' ? 'error' : dep.status === 'completed' ? 'completed' : 'pending'}
                  label={dep.status}
                />
                <button className="settings-sm-btn" onClick={() => void handleShowHistory(dep.id)}>History</button>
                {['active', 'running', 'paused'].includes(dep.status) && (
                  <button className="settings-danger-btn" onClick={() => void handleUndeploy(dep.id)}>Undeploy</button>
                )}
              </div>
            </div>

            {expandedHistory === dep.id && (
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                {history.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No run history</div>
                ) : (
                  <table style={{ width: '100%', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <thead>
                      <tr><th>Task</th><th>Status</th><th>Started</th><th>Cost</th></tr>
                    </thead>
                    <tbody>
                      {history.map((run) => (
                        <tr key={run.taskId}>
                          <td style={{ fontFamily: 'monospace' }}>{run.taskId.slice(0, 12)}</td>
                          <td>{run.status}</td>
                          <td>{new Date(run.startedAt).toLocaleString()}</td>
                          <td>${run.costUsd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
