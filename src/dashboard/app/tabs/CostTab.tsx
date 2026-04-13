/**
 * Qualixar OS Phase 7 -- Cost Tab
 * Budget gauge, cost by model (PieChart), cost by category (BarChart), running total.
 * Data from GET /api/cost -> { cost: CostData }
 * CostData: { total_usd, by_model, by_agent, by_category, budget_remaining_usd }
 * Budget from GET /api/system/config -> config.budget.max_usd
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useDashboardStore } from '../store.js';
import { Card, Gauge, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CostTab(): React.ReactElement {
  const cost = useDashboardStore((s) => s.cost);
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const fetchConfig = useDashboardStore((s) => s.fetchConfig);
  const fetchCost = useDashboardStore((s) => s.fetchCost);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([fetchCost(), fetchConfig()])
      .finally(() => setLoading(false));
  }, [fetchCost, fetchConfig]);

  const budgetMax = (systemConfig.budget as { max_usd?: number })?.max_usd ?? 5;
  const budgetRemaining = cost.budget_remaining_usd >= 0
    ? cost.budget_remaining_usd
    : budgetMax - cost.total_usd;

  // Inline budget editor state
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditStart = useCallback(() => {
    setBudgetInput(String(budgetMax));
    setEditing(true);
  }, [budgetMax]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: { max_usd: parseFloat(budgetInput) || budgetMax } }),
      });
      await fetchConfig();
    } catch (err) { console.error('CostTab: budget save error:', err); }
    setSaving(false);
    setEditing(false);
  }, [budgetInput, budgetMax, fetchConfig]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setBudgetInput('');
  }, []);

  const spendPct = budgetMax > 0 ? Math.min(100, (cost.total_usd / budgetMax) * 100) : 0;
  const progressColor = spendPct > 90 ? 'var(--danger)' : spendPct > 70 ? 'var(--warning)' : 'var(--success)';

  const modelData = useMemo(
    () =>
      Object.entries(cost.by_model)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          value: Number(value.toFixed(6)),
        })),
    [cost.by_model],
  );

  const categoryData = useMemo(
    () =>
      Object.entries(cost.by_category)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          cost: Number(value.toFixed(6)),
        })),
    [cost.by_category],
  );

  const agentData = useMemo(
    () =>
      Object.entries(cost.by_agent)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          cost: Number(value.toFixed(6)),
        })),
    [cost.by_agent],
  );

  if (loading) {
    return <LoadingSpinner message="Loading cost data..." />;
  }

  return (
    <div className="tab-grid">
      <Card title="Budget Status">
        <div className="budget-editor">
          <div className="budget-progress-bar">
            <div className="budget-progress-fill" style={{ width: `${spendPct}%`, background: progressColor }} />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {spendPct.toFixed(1)}%
          </span>
          {editing ? (
            <>
              <input
                className="budget-edit-input"
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                min={0}
                step={1}
              />
              <button className="budget-edit-btn" onClick={handleSave} disabled={saving}>
                {saving ? '...' : 'Save'}
              </button>
              <button className="budget-edit-btn" onClick={handleCancel} style={{ borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}>
                Cancel
              </button>
            </>
          ) : (
            <button className="budget-edit-btn" onClick={handleEditStart}>Edit</button>
          )}
        </div>
        <div className="gauge-center">
          <Gauge
            value={cost.total_usd}
            max={budgetMax}
            label="Budget Used"
            unit=" USD"
            size={160}
          />
          <div className="budget-stats">
            <div className="stat-row">
              <span>Spent:</span>
              <span className="stat-value">${cost.total_usd.toFixed(5)}</span>
            </div>
            <div className="stat-row">
              <span>Budget:</span>
              <span className="stat-value">${budgetMax.toFixed(2)}</span>
            </div>
            <div className="stat-row">
              <span>Remaining:</span>
              <span className="stat-value">${budgetRemaining.toFixed(5)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Cost by Model">
        {modelData.length === 0 ? (
          <div className="table-empty">No model cost data</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={modelData}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: $${value}`}
              >
                {modelData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                formatter={(value: number) => [`$${value.toFixed(6)}`, 'Cost']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Cost by Category">
        {categoryData.length === 0 ? (
          <div className="table-empty">No category cost data</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                formatter={(value: number) => [`$${value.toFixed(6)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Cost by Agent">
        {agentData.length === 0 ? (
          <div className="table-empty">No agent cost data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={agentData}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} angle={-30} textAnchor="end" />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                formatter={(value: number) => [`$${value.toFixed(6)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
