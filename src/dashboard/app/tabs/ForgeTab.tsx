// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Forge Tab
 * Design library table (topology, agents, success rate), redesign history.
 * Forge Settings card for model selection.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const forgeColumns = [
  { key: 'designId', header: 'Design ID' },
  { key: 'topology', header: 'Topology' },
  { key: 'taskId', header: 'Task ID' },
  {
    key: 'isRedesign',
    header: 'Type',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={row.isRedesign ? 'pending' : 'completed'}
        label={row.isRedesign ? 'Redesign' : 'Original'}
      />
    ),
  },
];

// ---------------------------------------------------------------------------
// ForgeSettings — model selection for the forge engine
// ---------------------------------------------------------------------------

function ForgeSettings(): React.ReactElement {
  const models = useDashboardStore((s) => s.models);
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const fetchModels = useDashboardStore((s) => s.fetchModels);
  const fetchConfig = useDashboardStore((s) => s.fetchConfig);
  const updateConfig = useDashboardStore((s) => s.updateConfig);

  const [forgeModel, setForgeModel] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Load models and config on mount
  useEffect(() => {
    fetchModels();
    fetchConfig();
  }, [fetchModels, fetchConfig]);

  // Sync local state from config when it loads
  useEffect(() => {
    const modelsConfig = systemConfig.models as Record<string, unknown> | undefined;
    if (modelsConfig?.forge && typeof modelsConfig.forge === 'string') {
      setForgeModel(modelsConfig.forge);
    }
  }, [systemConfig]);

  const availableModels = useMemo(
    () => models.filter((m) => m.available),
    [models],
  );

  const handleModelChange = useCallback(async (model: string) => {
    setForgeModel(model);
    setSaving(true);
    setFeedback('');
    try {
      await updateConfig({ models: { forge: model } });
      setFeedback('Saved');
      setTimeout(() => setFeedback(''), 2000);
    } catch {
      setFeedback('Save failed');
      setTimeout(() => setFeedback(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [updateConfig]);

  const currentModel = availableModels.find((m) => m.name === forgeModel);

  return (
    <Card title="Forge Settings" subtitle="Configure the model powering design generation">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={{
            display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem',
            marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Forge Model
          </label>
          <select
            value={forgeModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={saving}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '0.5rem',
              border: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Select a model...</option>
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.provider}) — {m.maxTokens.toLocaleString()} tokens
              </option>
            ))}
          </select>
        </div>

        {currentModel && (
          <div style={{
            display: 'flex', gap: '1.5rem', padding: '8px 0',
            fontSize: '0.8rem', color: 'var(--text-secondary)',
          }}>
            <span>Provider: <strong style={{ color: 'var(--text-primary)' }}>{currentModel.provider}</strong></span>
            <span>Quality: <strong style={{ color: 'var(--success)' }}>{currentModel.qualityScore}/100</strong></span>
            <span>Cost: <strong style={{ color: 'var(--warning)' }}>${currentModel.costPerInputToken.toFixed(6)}/in</strong></span>
          </div>
        )}

        {feedback && (
          <span style={{
            fontSize: '0.8rem', fontWeight: 600,
            color: feedback === 'Saved' ? 'var(--success)' : 'var(--danger)',
          }}>
            {feedback}
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ForgeTab (Main)
// ---------------------------------------------------------------------------

export function ForgeTab(): React.ReactElement {
  const designs = useDashboardStore((s) => s.forgeDesigns);
  const events = useDashboardStore((s) => s.events);
  const fetchForgeDesigns = useDashboardStore((s) => s.fetchForgeDesigns);
  const fetchEvents = useDashboardStore((s) => s.fetchEvents);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([fetchForgeDesigns(), fetchEvents()])
      .finally(() => setLoading(false));
  }, [fetchForgeDesigns, fetchEvents]);

  // Forge events from event log (forge:designed, forge:redesigning)
  const forgeEvents = useMemo(() => {
    return (events ?? [])
      .filter((e) => e.type?.startsWith('forge:'))
      .map((e) => {
        let p: Record<string, unknown> = {};
        try { p = JSON.parse(e.payload); } catch {}
        return { type: e.type, topology: (p.topology as string) ?? '--', taskId: (p.taskId as string)?.slice(0, 12) ?? '--', isRedesign: e.type === 'forge:redesigning' };
      });
  }, [events]);

  const summary = useMemo(() => {
    const originals = forgeEvents.filter((f) => !f.isRedesign).length;
    const redesigns = forgeEvents.filter((f) => f.isRedesign).length;
    const topologies = new Set([...forgeEvents.map((f) => f.topology), ...(designs ?? []).map((d) => d.topology)].filter(Boolean));
    return { originals, redesigns, uniqueTopologies: topologies.size, total: designs.length + forgeEvents.length };
  }, [designs, forgeEvents]);

  const topologyStats = useMemo(() => {
    const stats = new Map<string, { total: number; redesigns: number }>();
    for (const f of forgeEvents) {
      const key = f.topology || 'unknown';
      const current = stats.get(key) ?? { total: 0, redesigns: 0 };
      stats.set(key, {
        total: current.total + 1,
        redesigns: current.redesigns + (f.isRedesign ? 1 : 0),
      });
    }
    for (const d of designs ?? []) {
      const key = d.topology || 'unknown';
      const current = stats.get(key) ?? { total: 0, redesigns: 0 };
      stats.set(key, { total: current.total + 1, redesigns: current.redesigns });
    }
    return Array.from(stats.entries()).map(([topology, s]) => ({
      topology,
      total: s.total,
      redesigns: s.redesigns,
      successRate: s.total > 0 ? (((s.total - s.redesigns) / s.total) * 100).toFixed(1) : '0',
    }));
  }, [designs, forgeEvents]);

  const topologyColumns = [
    { key: 'topology', header: 'Topology' },
    { key: 'total', header: 'Total Designs' },
    { key: 'redesigns', header: 'Redesigns' },
    {
      key: 'successRate',
      header: 'Success Rate',
      render: (row: Record<string, unknown>) => `${row.successRate}%`,
    },
  ];

  if (loading) {
    return <LoadingSpinner message="Loading forge data..." />;
  }

  return (
    <div className="tab-grid">
      <ForgeSettings />

      <Card title="Forge Summary">
        <div className="stat-grid">
          <div className="stat-item">
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">Total Designs</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#22c55e' }}>{summary.originals}</span>
            <span className="stat-label">Originals</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{ color: '#f59e0b' }}>{summary.redesigns}</span>
            <span className="stat-label">Redesigns</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{summary.uniqueTopologies}</span>
            <span className="stat-label">Topologies</span>
          </div>
        </div>
      </Card>

      <Card title="Topology Performance">
        <DataTable
          columns={topologyColumns}
          data={topologyStats as unknown as Record<string, unknown>[]}
          emptyMessage="No topology data"
        />
      </Card>

      <Card title="Design History" className="span-2">
        <DataTable
          columns={forgeColumns}
          data={forgeEvents as unknown as Record<string, unknown>[]}
          emptyMessage="No designs created yet"
        />
      </Card>
    </div>
  );
}
