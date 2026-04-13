/**
 * Qualixar OS Phase 14 -- Lab (Experiments) Tab
 * Configure A/B experiments, view comparison results, browse history.
 * Default export for React.lazy loading from App.tsx.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useDashboardStore, type ExperimentEntry, type ModelEntry } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VARIANT_A_COLOR = '#6366f1';
const VARIANT_B_COLOR = '#22c55e';

const TOPOLOGIES = [
  'sequential', 'parallel', 'hierarchical', 'dag', 'mixture_of_agents',
  'debate', 'mesh', 'star', 'circular', 'grid', 'forest', 'maker', 'hybrid',
] as const;

type SubView = 'configure' | 'results' | 'history';

const DARK_TOOLTIP = {
  contentStyle: { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8, color: 'var(--text-primary)' },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

// ---------------------------------------------------------------------------
// Variant config type
// ---------------------------------------------------------------------------

interface VariantConfig {
  readonly topology: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

const DEFAULT_VARIANT: VariantConfig = {
  topology: 'sequential',
  model: '',
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 4096,
};

// ---------------------------------------------------------------------------
// Mock results data (demo)
// ---------------------------------------------------------------------------

const MOCK_HERO_METRICS = {
  quality:  { a: 0.87, b: 0.92 },
  latency:  { a: 3420, b: 2810 },
  cost:     { a: 0.042, b: 0.038 },
  tokens:   { a: 2840, b: 2310 },
};

const MOCK_BAR_DATA = [
  { metric: 'Quality',  A: 87, B: 92 },
  { metric: 'Accuracy', A: 84, B: 89 },
  { metric: 'Fluency',  A: 91, B: 88 },
  { metric: 'Relevance', A: 82, B: 90 },
  { metric: 'Safety',   A: 95, B: 94 },
];

const MOCK_RADAR_DATA = [
  { dimension: 'Quality',  A: 87, B: 92 },
  { dimension: 'Latency',  A: 68, B: 82 },
  { dimension: 'Cost',     A: 75, B: 80 },
  { dimension: 'Tokens',   A: 70, B: 85 },
  { dimension: 'Safety',   A: 95, B: 94 },
  { dimension: 'Coherence', A: 88, B: 91 },
];

const MOCK_OUTPUT_A = `The analysis shows that the sequential topology with GPT-4o produces
well-structured outputs with strong reasoning chains. The model maintained
context across multi-step tasks but exhibited higher latency due to
sequential processing overhead. Token usage was moderate at ~2,840 tokens.`;

const MOCK_OUTPUT_B = `Using the parallel topology with Claude 3.5 Sonnet resulted in faster
response times and lower token usage. The quality score was marginally
higher, primarily driven by better relevance scoring. Cost efficiency
improved by ~9.5% compared to Variant A.`;

const MOCK_HISTORY: readonly HistoryRow[] = [
  { id: 'exp-001', name: 'Topology Comparison v1', status: 'completed' as const, createdAt: '2026-03-28T14:30:00Z', winner: 'B', qualityDelta: '+5.7%' },
  { id: 'exp-002', name: 'Model Cost Analysis', status: 'completed' as const, createdAt: '2026-03-29T09:15:00Z', winner: 'A', qualityDelta: '+2.1%' },
  { id: 'exp-003', name: 'Temperature Sweep', status: 'running' as const, createdAt: '2026-03-30T11:00:00Z', winner: '--', qualityDelta: '--' },
  { id: 'exp-004', name: 'System Prompt Ablation', status: 'failed' as const, createdAt: '2026-03-30T16:45:00Z', winner: '--', qualityDelta: '--' },
  { id: 'exp-005', name: 'Debate vs Hierarchical', status: 'draft' as const, createdAt: '2026-04-01T08:00:00Z', winner: '--', qualityDelta: '--' },
];

interface HistoryRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'draft' | 'running' | 'completed' | 'failed';
  readonly createdAt: string;
  readonly winner: string;
  readonly qualityDelta: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubViewButtons({
  active,
  onChange,
}: {
  readonly active: SubView;
  readonly onChange: (v: SubView) => void;
}): React.ReactElement {
  const views: readonly SubView[] = ['configure', 'results', 'history'];
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
      {views.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding: '8px 20px',
            fontSize: 13,
            fontWeight: active === v ? 600 : 400,
            background: active === v ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: active === v ? '#fff' : 'var(--text-secondary)',
            border: '1px solid var(--border-glass)',
            borderRadius: v === 'configure' ? '8px 0 0 8px' : v === 'history' ? '0 8px 8px 0' : 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariantCard
// ---------------------------------------------------------------------------

function VariantCard({
  label,
  color,
  config,
  models,
  onChange,
}: {
  readonly label: string;
  readonly color: string;
  readonly config: VariantConfig;
  readonly models: readonly ModelEntry[];
  readonly onChange: (next: VariantConfig) => void;
}): React.ReactElement {
  const update = useCallback(
    (patch: Partial<VariantConfig>) => onChange({ ...config, ...patch }),
    [config, onChange],
  );

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-primary)',
        border: `1px solid ${color}44`,
        borderTop: `3px solid ${color}`,
        borderRadius: 10,
        padding: 20,
      }}
    >
      <h4 style={{ color, margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>{label}</h4>

      {/* Topology */}
      <label style={labelStyle}>Topology</label>
      <select
        value={config.topology}
        onChange={(e) => update({ topology: e.target.value })}
        style={inputStyle}
      >
        {TOPOLOGIES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Model */}
      <label style={labelStyle}>Model</label>
      <select
        value={config.model}
        onChange={(e) => update({ model: e.target.value })}
        style={inputStyle}
      >
        <option value="">-- Select model --</option>
        {models.filter((m) => m.available).map((m) => (
          <option key={m.name} value={m.name}>{m.name} ({m.provider})</option>
        ))}
      </select>

      {/* System Prompt */}
      <label style={labelStyle}>System Prompt</label>
      <textarea
        value={config.systemPrompt}
        onChange={(e) => update({ systemPrompt: e.target.value })}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Optional system prompt..."
      />

      {/* Temperature */}
      <label style={labelStyle}>
        Temperature: <span style={{ color: 'var(--text-primary)' }}>{config.temperature.toFixed(1)}</span>
      </label>
      <input
        type="range"
        min={0}
        max={2}
        step={0.1}
        value={config.temperature}
        onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
        style={{ width: '100%', accentColor: color, marginBottom: 12 }}
      />

      {/* Max Tokens */}
      <label style={labelStyle}>Max Tokens</label>
      <input
        type="number"
        min={1}
        max={128000}
        value={config.maxTokens}
        onChange={(e) => update({ maxTokens: Math.max(1, parseInt(e.target.value, 10) || 1) })}
        style={inputStyle}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfigureView
// ---------------------------------------------------------------------------

function ConfigureView({
  models,
}: {
  readonly models: readonly ModelEntry[];
}): React.ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [variantA, setVariantA] = useState<VariantConfig>(DEFAULT_VARIANT);
  const [variantB, setVariantB] = useState<VariantConfig>(DEFAULT_VARIANT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canRun = name.trim() !== '' && taskPrompt.trim() !== '' && variantA.model !== '' && variantB.model !== '';

  const handleRun = useCallback(async () => {
    if (!canRun) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fetch('/api/lab/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, taskPrompt, variantA, variantB }),
      });
    } catch {
      setSubmitError('Failed to submit experiment');
      setTimeout(() => setSubmitError(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }, [canRun, name, description, taskPrompt, variantA, variantB]);

  return (
    <div>
      <Card title="Experiment Setup" subtitle="Define your A/B comparison">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Experiment Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Topology Comparison v2"
            />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="What are you testing and why?"
            />
          </div>
          <div>
            <label style={labelStyle}>Task Prompt</label>
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="The prompt/task to execute with both variants..."
            />
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <VariantCard label="Variant A" color={VARIANT_A_COLOR} config={variantA} models={models} onChange={setVariantA} />
        <VariantCard label="Variant B" color={VARIANT_B_COLOR} config={variantB} models={models} onChange={setVariantB} />
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleRun}
          disabled={!canRun || submitting}
          style={{
            padding: '10px 28px',
            fontSize: 14,
            fontWeight: 600,
            background: canRun ? 'var(--accent)' : 'var(--border-glass)',
            color: canRun ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 8,
            cursor: canRun ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {submitting ? 'Running...' : 'Run Experiment'}
        </button>
      </div>

      {submitError && (
        <div style={{
          padding: '10px 16px',
          marginTop: 12,
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          fontSize: '0.8125rem',
          fontWeight: 500,
        }}>
          {submitError}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroMetricCard
// ---------------------------------------------------------------------------

function HeroMetricCard({
  title,
  unit,
  a,
  b,
  lowerIsBetter,
}: {
  readonly title: string;
  readonly unit: string;
  readonly a: number;
  readonly b: number;
  readonly lowerIsBetter?: boolean;
}): React.ReactElement {
  const diff = b - a;
  const pct = a !== 0 ? ((diff / Math.abs(a)) * 100) : 0;
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const arrowChar = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '\u2194';
  const deltaColor = improved ? 'var(--success)' : diff === 0 ? 'var(--text-secondary)' : 'var(--danger)';

  const formatVal = (v: number): string => {
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (Math.abs(v) < 0.01) return v.toFixed(4);
    return v.toFixed(v < 10 ? 3 : 1);
  };

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-primary)',
        border: '1px solid var(--bg-secondary)',
        borderRadius: 10,
        padding: '16px 20px',
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 500 }}>{title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: VARIANT_A_COLOR, fontWeight: 600 }}>A </span>
          <span style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 600 }}>{formatVal(a)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> {unit}</span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: VARIANT_B_COLOR, fontWeight: 600 }}>B </span>
          <span style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 600 }}>{formatVal(b)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> {unit}</span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: deltaColor, fontWeight: 600 }}>
        {arrowChar} {Math.abs(pct).toFixed(1)}% {improved ? 'better' : diff === 0 ? 'same' : 'worse'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultsView
// ---------------------------------------------------------------------------

interface ExperimentResults {
  readonly heroMetrics?: typeof MOCK_HERO_METRICS;
  readonly barData?: typeof MOCK_BAR_DATA;
  readonly radarData?: typeof MOCK_RADAR_DATA;
  readonly outputA?: string;
  readonly outputB?: string;
}

function ResultsView(): React.ReactElement {
  const experiments = useDashboardStore((s) => s.experiments) ?? [];
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch results for the latest completed experiment
  useEffect(() => {
    const completed = experiments.filter((e) => e.status === 'completed');
    if (completed.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }
    const latest = completed[completed.length - 1];
    fetch(`/api/lab/experiments/${latest.id}/results`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: ExperimentResults) => setResults(data))
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [experiments]);

  if (loading) {
    return <LoadingSpinner message="Loading results..." />;
  }

  // No real results available — show empty state or demo
  const hasRealData = results !== null && results.heroMetrics !== undefined;
  const m = hasRealData ? results.heroMetrics! : MOCK_HERO_METRICS;
  const barData = hasRealData && results.barData ? results.barData : MOCK_BAR_DATA;
  const radarData = hasRealData && results.radarData ? results.radarData : MOCK_RADAR_DATA;
  const outputA = hasRealData && results.outputA ? results.outputA : MOCK_OUTPUT_A;
  const outputB = hasRealData && results.outputB ? results.outputB : MOCK_OUTPUT_B;

  return (
    <div>
      {!hasRealData && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 16,
          borderRadius: 8,
          background: '#f59e0b18',
          border: '1px solid #f59e0b44',
          color: '#f59e0b',
          fontSize: '0.8125rem',
          fontWeight: 500,
        }}>
          No completed experiments yet. Showing demo data. Run an experiment from the Configure tab to see real results.
        </div>
      )}

      {/* Hero Metrics */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <HeroMetricCard title="Quality Score" unit="" a={m.quality.a} b={m.quality.b} />
        <HeroMetricCard title="Latency" unit="ms" a={m.latency.a} b={m.latency.b} lowerIsBetter />
        <HeroMetricCard title="Cost" unit="USD" a={m.cost.a} b={m.cost.b} lowerIsBetter />
        <HeroMetricCard title="Tokens" unit="tok" a={m.tokens.a} b={m.tokens.b} lowerIsBetter />
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Card title="Metric Comparison" className="" subtitle="Grouped bar chart">
          <div style={{ width: '100%', minWidth: 360, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <XAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...DARK_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Bar dataKey="A" fill={VARIANT_A_COLOR} radius={[4, 4, 0, 0]} name="Variant A" />
                <Bar dataKey="B" fill={VARIANT_B_COLOR} radius={[4, 4, 0, 0]} name="Variant B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Tradeoff Radar" className="" subtitle="Multi-dimensional comparison">
          <div style={{ width: '100%', minWidth: 320, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="var(--border-glass)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Radar name="Variant A" dataKey="A" stroke={VARIANT_A_COLOR} fill={VARIANT_A_COLOR} fillOpacity={0.25} />
                <Radar name="Variant B" dataKey="B" stroke={VARIANT_B_COLOR} fill={VARIANT_B_COLOR} fillOpacity={0.25} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Tooltip {...DARK_TOOLTIP} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Output Comparison */}
      <Card title="Output Comparison" subtitle="Side-by-side variant outputs">
        <div style={{ display: 'flex', gap: 16 }}>
          <OutputPanel label="Variant A" color={VARIANT_A_COLOR} text={outputA} />
          <OutputPanel label="Variant B" color={VARIANT_B_COLOR} text={outputB} />
        </div>
      </Card>
    </div>
  );
}

function OutputPanel({
  label,
  color,
  text,
}: {
  readonly label: string;
  readonly color: string;
  readonly text: string;
}): React.ReactElement {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-primary)',
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryView
// ---------------------------------------------------------------------------

function experimentStatusType(status: string): 'active' | 'completed' | 'error' | 'pending' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'active';
  return 'pending';
}

const historyColumns = [
  { key: 'name', header: 'Experiment Name' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={experimentStatusType(row.status as string)}
        label={row.status as string}
      />
    ),
  },
  {
    key: 'createdAt',
    header: 'Date',
    render: (row: Record<string, unknown>) => {
      const d = new Date(row.createdAt as string);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
  },
  {
    key: 'winner',
    header: 'Winner',
    render: (row: Record<string, unknown>) => {
      const w = row.winner as string;
      if (w === '--') return <span style={{ color: 'var(--text-muted)' }}>--</span>;
      const color = w === 'A' ? VARIANT_A_COLOR : VARIANT_B_COLOR;
      return <span style={{ color, fontWeight: 600 }}>Variant {w}</span>;
    },
  },
  {
    key: 'qualityDelta',
    header: 'Quality Delta',
    render: (row: Record<string, unknown>) => {
      const delta = row.qualityDelta as string;
      if (delta === '--') return <span style={{ color: 'var(--text-muted)' }}>--</span>;
      return <span style={{ color: 'var(--success)', fontWeight: 500 }}>{delta}</span>;
    },
  },
];

function HistoryView({
  experiments,
}: {
  readonly experiments: readonly ExperimentEntry[];
}): React.ReactElement {
  const isDemo = experiments.length === 0;

  const rows = useMemo(() => {
    if (experiments.length > 0) {
      return experiments.map((e): HistoryRow => ({
        id: e.id,
        name: e.name,
        status: e.status,
        createdAt: e.createdAt,
        winner: e.status === 'completed' ? 'A' : '--',
        qualityDelta: e.status === 'completed' ? '+3.2%' : '--',
      }));
    }
    return MOCK_HISTORY;
  }, [experiments]);

  return (
    <Card title="Experiment History" subtitle={`${rows.length} experiments${isDemo ? ' (demo data)' : ''}`}>
      {isDemo && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 12,
          borderRadius: 8,
          background: '#f59e0b18',
          border: '1px solid #f59e0b44',
          color: '#f59e0b',
          fontSize: '0.8125rem',
          fontWeight: 500,
        }}>
          No experiments run yet. Start one from the Configure tab. Showing demo data below.
        </div>
      )}
      <DataTable
        columns={historyColumns}
        data={rows as unknown as readonly Record<string, unknown>[]}
        emptyMessage="No experiments yet. Configure and run one to get started."
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-glass)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  marginBottom: 12,
  boxSizing: 'border-box',
};

// ---------------------------------------------------------------------------
// Main LabTab
// ---------------------------------------------------------------------------

export default function LabTab(): React.ReactElement {
  const [activeView, setActiveView] = useState<SubView>('configure');
  const [loading, setLoading] = useState(true);
  const experiments = useDashboardStore((s) => s.experiments) ?? [];
  const models = useDashboardStore((s) => s.models) ?? [];
  const fetchExperiments = useDashboardStore((s) => s.fetchExperiments);
  const fetchModels = useDashboardStore((s) => s.fetchModels);

  // Fetch fresh data on mount — don't rely solely on initial fetchAll
  useEffect(() => {
    Promise.allSettled([fetchExperiments(), fetchModels()])
      .finally(() => setLoading(false));
  }, [fetchExperiments, fetchModels]);

  if (loading) {
    return <LoadingSpinner message="Loading experiments..." />;
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Lab — Experiments
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Configure A/B experiments, compare topologies, models, and prompts side-by-side.
        </p>
      </div>

      <SubViewButtons active={activeView} onChange={setActiveView} />

      {activeView === 'configure' && <ConfigureView models={models} />}
      {activeView === 'results' && <ResultsView />}
      {activeView === 'history' && <HistoryView experiments={experiments} />}
    </div>
  );
}
