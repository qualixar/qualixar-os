/** Qualixar OS Phase 14 -- Traces Tab */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner, type DataTableColumn } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceSummary {
  readonly traceId: string;
  readonly rootSpanName: string;
  readonly durationMs: number;
  readonly spanCount: number;
  readonly status: 'ok' | 'error';
  readonly startTime: string;
}

interface TraceMetrics {
  readonly totalTraces: number;
  readonly avgDurationMs: number;
  readonly p95LatencyMs: number;
  readonly errorRate: number;
}

interface Span {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly operationName: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
  readonly depth: number;
  readonly attributes: Record<string, string>;
}

interface TraceDetail {
  readonly traceId: string;
  readonly spans: readonly Span[];
  readonly totalDurationMs: number;
}

interface ErrorRateDataPoint {
  readonly hour: string;
  readonly requests: number;
  readonly errorRate: number;
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function generateErrorRateData(): readonly ErrorRateDataPoint[] {
  const now = Date.now();
  const points: ErrorRateDataPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const ts = new Date(now - i * 3600_000);
    const hour = `${String(ts.getHours()).padStart(2, '0')}:00`;
    const requests = Math.floor(80 + Math.random() * 420);
    const errorRate = parseFloat((Math.random() * 8).toFixed(1));
    points.push({ hour, requests, errorRate });
  }
  return points;
}

function generateMockSpans(traceId: string): TraceDetail {
  const rootStart = 0;
  const rootDuration = 320;
  const spans: Span[] = [
    {
      spanId: `${traceId}-s0`,
      parentSpanId: null,
      operationName: 'HTTP POST /api/execute',
      startMs: rootStart,
      durationMs: rootDuration,
      status: 'ok',
      depth: 0,
      attributes: { 'http.method': 'POST', 'http.url': '/api/execute', 'http.status_code': '200' },
    },
    {
      spanId: `${traceId}-s1`,
      parentSpanId: `${traceId}-s0`,
      operationName: 'auth.validateToken',
      startMs: 2,
      durationMs: 18,
      status: 'ok',
      depth: 1,
      attributes: { 'auth.method': 'bearer', 'auth.cached': 'true' },
    },
    {
      spanId: `${traceId}-s2`,
      parentSpanId: `${traceId}-s0`,
      operationName: 'pipeline.resolve',
      startMs: 22,
      durationMs: 140,
      status: 'ok',
      depth: 1,
      attributes: { 'pipeline.steps': '4', 'pipeline.id': 'p-001' },
    },
    {
      spanId: `${traceId}-s3`,
      parentSpanId: `${traceId}-s2`,
      operationName: 'tool.invoke:web-search',
      startMs: 30,
      durationMs: 95,
      status: 'ok',
      depth: 2,
      attributes: { 'tool.name': 'web-search', 'tool.timeout_ms': '5000' },
    },
    {
      spanId: `${traceId}-s4`,
      parentSpanId: `${traceId}-s2`,
      operationName: 'tool.invoke:summarize',
      startMs: 128,
      durationMs: 30,
      status: 'ok',
      depth: 2,
      attributes: { 'tool.name': 'summarize', 'tool.model': 'haiku-4.5' },
    },
    {
      spanId: `${traceId}-s5`,
      parentSpanId: `${traceId}-s0`,
      operationName: 'judge.evaluate',
      startMs: 170,
      durationMs: 90,
      status: 'ok',
      depth: 1,
      attributes: { 'judge.type': 'correctness', 'judge.verdict': 'pass' },
    },
    {
      spanId: `${traceId}-s6`,
      parentSpanId: `${traceId}-s5`,
      operationName: 'llm.generate',
      startMs: 175,
      durationMs: 78,
      status: 'ok',
      depth: 2,
      attributes: { 'llm.model': 'sonnet-4', 'llm.tokens': '1240' },
    },
    {
      spanId: `${traceId}-s7`,
      parentSpanId: `${traceId}-s0`,
      operationName: 'response.serialize',
      startMs: 265,
      durationMs: 50,
      status: Math.random() > 0.7 ? 'error' : 'ok',
      depth: 1,
      attributes: { 'response.format': 'json', 'response.bytes': '4096' },
    },
  ];

  return { traceId, spans, totalDurationMs: rootDuration };
}

function generateMockTraceSummaries(): readonly TraceSummary[] {
  const ops = [
    'HTTP POST /api/execute',
    'HTTP GET /api/agents',
    'pipeline.run',
    'swarm.dispatch',
    'tool.batch',
    'judge.evaluate',
    'HTTP POST /api/tools/invoke',
    'memory.consolidate',
  ];
  const summaries: TraceSummary[] = [];
  const now = Date.now();
  for (let i = 0; i < 25; i++) {
    const traceId = `tr-${crypto.randomUUID().slice(0, 12)}`;
    summaries.push({
      traceId,
      rootSpanName: ops[i % ops.length],
      durationMs: Math.floor(50 + Math.random() * 800),
      spanCount: Math.floor(3 + Math.random() * 12),
      status: Math.random() > 0.85 ? 'error' : 'ok',
      startTime: new Date(now - i * 120_000).toISOString(),
    });
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Utility: linear scale
// ---------------------------------------------------------------------------

function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan = rangeMax - rangeMin;
  return (value: number) => rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function truncate(str: string, len: number): string {
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// TraceMetricCards
// ---------------------------------------------------------------------------

function TraceMetricCards({
  metrics,
}: {
  readonly metrics: TraceMetrics;
}): React.ReactElement {
  const cards = [
    { title: 'Total Traces', value: metrics.totalTraces.toLocaleString(), subtitle: 'all time' },
    { title: 'Avg Duration', value: formatDuration(metrics.avgDurationMs), subtitle: 'mean latency' },
    { title: 'p95 Latency', value: formatDuration(metrics.p95LatencyMs), subtitle: '95th percentile' },
    { title: 'Error Rate', value: `${(metrics.errorRate * 100).toFixed(1)}%`, subtitle: 'failure ratio' },
  ];

  return (
    <div className="metric-cards-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
      {cards.map((c) => (
        <Card key={c.title} title={c.title} subtitle={c.subtitle}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', padding: '0.5rem 0' }}>
            {c.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorRateChart
// ---------------------------------------------------------------------------

function ErrorRateChart(): React.ReactElement {
  const data = useMemo(() => generateErrorRateData(), []);

  return (
    <Card title="Error Rate & Volume" subtitle="Last 24 hours">
      <div style={{
        padding: '8px 16px', marginBottom: 12, borderRadius: 8,
        background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
        color: '#f59e0b', fontSize: 13, fontWeight: 500,
      }}>
        Showing simulated error rate data
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data as unknown as Record<string, unknown>[]} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
            <XAxis
              dataKey="hour"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickLine={false}
              interval={3}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickLine={false}
              label={{ value: 'Requests', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 15]}
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickLine={false}
              label={{ value: 'Error %', angle: 90, position: 'insideRight', fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 6, color: 'var(--text-primary)' }}
              labelStyle={{ color: 'var(--text-secondary)' }}
            />
            <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="requests" fill="#475569" radius={[2, 2, 0, 0]} name="Requests" />
            <Line yAxisId="right" dataKey="errorRate" stroke="#ef4444" strokeWidth={2} dot={false} name="Error %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TraceList
// ---------------------------------------------------------------------------

interface TraceListProps {
  readonly traces: readonly TraceSummary[];
  readonly selectedTraceId: string | null;
  readonly onSelectTrace: (trace: TraceSummary) => void;
}

function TraceList({ traces, selectedTraceId, onSelectTrace }: TraceListProps): React.ReactElement {
  const columns = useMemo(
    () => [
      {
        key: 'traceId',
        header: 'Trace ID',
        render: (row: TraceSummary) => (
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: row.traceId === selectedTraceId ? 'var(--info)' : 'var(--text-secondary)' }}>
            {truncate(row.traceId, 16)}
          </span>
        ),
      },
      {
        key: 'rootSpanName',
        header: 'Operation',
        render: (row: TraceSummary) => <span style={{ color: 'var(--text-primary)' }}>{row.rootSpanName}</span>,
      },
      {
        key: 'durationMs',
        header: 'Duration',
        render: (row: TraceSummary) => (
          <span style={{ color: row.durationMs > 500 ? 'var(--warning)' : 'var(--success)', fontFamily: 'monospace' }}>
            {formatDuration(row.durationMs)}
          </span>
        ),
      },
      {
        key: 'spanCount',
        header: 'Spans',
        render: (row: TraceSummary) => <span style={{ color: 'var(--text-secondary)' }}>{row.spanCount}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: TraceSummary) => (
          <StatusBadge
            status={row.status === 'ok' ? 'completed' : 'error'}
            label={row.status}
          />
        ),
      },
      {
        key: 'startTime',
        header: 'Time',
        render: (row: TraceSummary) => <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatTime(row.startTime)}</span>,
      },
    ],
    [selectedTraceId],
  );

  return (
    <Card title="Traces" subtitle={`${traces.length} traces`}>
      <DataTable
        columns={columns as unknown as readonly DataTableColumn<Record<string, unknown>>[]}
        data={traces as unknown as readonly Record<string, unknown>[]}
        emptyMessage="No traces recorded yet"
        onRowClick={(row) => onSelectTrace(row as unknown as TraceSummary)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TraceWaterfall (SVG)
// ---------------------------------------------------------------------------

interface TraceWaterfallProps {
  readonly detail: TraceDetail;
  readonly selectedSpanId: string | null;
  readonly onSelectSpan: (span: Span) => void;
}

const WATERFALL_LEFT_PANE = 220;
const WATERFALL_ROW_HEIGHT = 32;
const WATERFALL_BAR_HEIGHT = 18;
const WATERFALL_RIGHT_PADDING = 16;

function TraceWaterfall({ detail, selectedSpanId, onSelectSpan }: TraceWaterfallProps): React.ReactElement {
  const { spans, totalDurationMs } = detail;
  const svgWidth = 700;
  const timelineWidth = svgWidth - WATERFALL_LEFT_PANE - WATERFALL_RIGHT_PADDING;
  const svgHeight = spans.length * WATERFALL_ROW_HEIGHT + 40;

  const xScale = useMemo(
    () => linearScale(0, totalDurationMs, 0, timelineWidth),
    [totalDurationMs, timelineWidth],
  );

  // Tick marks
  const ticks = useMemo(() => {
    const count = 5;
    const step = totalDurationMs / count;
    return Array.from({ length: count + 1 }, (_, i) => ({
      value: i * step,
      x: xScale(i * step),
    }));
  }, [totalDurationMs, xScale]);

  return (
    <Card title="Trace Waterfall" subtitle={`${detail.traceId} - ${spans.length} spans`}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block', minWidth: svgWidth }}
          role="img"
          aria-label="Trace waterfall visualization"
        >
          {/* Header background */}
          <rect x={0} y={0} width={svgWidth} height={28} fill="var(--bg-primary)" />
          <text x={8} y={18} fill="var(--text-muted)" fontSize={11} fontWeight={600}>
            Operation
          </text>
          <text x={WATERFALL_LEFT_PANE + 4} y={18} fill="var(--text-muted)" fontSize={11} fontWeight={600}>
            Timeline
          </text>

          {/* Tick grid lines */}
          {ticks.map((t) => (
            <g key={t.value}>
              <line
                x1={WATERFALL_LEFT_PANE + t.x}
                y1={28}
                x2={WATERFALL_LEFT_PANE + t.x}
                y2={svgHeight}
                stroke="var(--bg-secondary)"
                strokeWidth={1}
              />
              <text
                x={WATERFALL_LEFT_PANE + t.x}
                y={18}
                fill="var(--text-muted)"
                fontSize={9}
                textAnchor="middle"
              >
                {formatDuration(t.value)}
              </text>
            </g>
          ))}

          {/* Span rows */}
          {spans.map((span, idx) => {
            const y = 28 + idx * WATERFALL_ROW_HEIGHT;
            const barX = WATERFALL_LEFT_PANE + xScale(span.startMs);
            const barW = Math.max(xScale(span.durationMs) - xScale(0), 3);
            const barY = y + (WATERFALL_ROW_HEIGHT - WATERFALL_BAR_HEIGHT) / 2;
            const isSelected = span.spanId === selectedSpanId;
            const barColor = span.status === 'error' ? 'var(--danger)' : 'var(--success)';

            return (
              <g
                key={span.spanId}
                onClick={() => onSelectSpan(span)}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`Span ${span.operationName}`}
              >
                {/* Row highlight */}
                {isSelected && (
                  <rect x={0} y={y} width={svgWidth} height={WATERFALL_ROW_HEIGHT} fill="var(--accent-soft)" opacity={0.5} />
                )}

                {/* Hover highlight */}
                <rect
                  x={0}
                  y={y}
                  width={svgWidth}
                  height={WATERFALL_ROW_HEIGHT}
                  fill="transparent"
                  className="waterfall-row-hover"
                />

                {/* Span name (indented by depth) */}
                <text
                  x={8 + span.depth * 16}
                  y={y + WATERFALL_ROW_HEIGHT / 2 + 4}
                  fill={isSelected ? 'var(--info)' : 'var(--text-primary)'}
                  fontSize={11}
                  fontFamily="monospace"
                >
                  {truncate(span.operationName, 22 - span.depth * 2)}
                </text>

                {/* Timeline bar */}
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={WATERFALL_BAR_HEIGHT}
                  rx={3}
                  fill={barColor}
                  opacity={isSelected ? 1 : 0.75}
                />

                {/* Duration label */}
                <text
                  x={barX + barW + 4}
                  y={barY + WATERFALL_BAR_HEIGHT / 2 + 3}
                  fill="var(--text-secondary)"
                  fontSize={9}
                  fontFamily="monospace"
                >
                  {formatDuration(span.durationMs)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SpanDetailPanel
// ---------------------------------------------------------------------------

interface SpanDetailPanelProps {
  readonly span: Span;
  readonly onClose: () => void;
}

function SpanDetailPanel({ span, onClose }: SpanDetailPanelProps): React.ReactElement {
  const entries = Object.entries(span.attributes);

  const panel = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--bg-secondary)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--bg-secondary)',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>Span Details</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid var(--border-glass)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            fontSize: '0.8rem',
          }}
          aria-label="Close span detail panel"
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {/* Summary fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Operation</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {span.operationName}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Span ID</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{span.spanId}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Duration</div>
            <div style={{ color: 'var(--success)', fontSize: '1.1rem', fontWeight: 600 }}>{formatDuration(span.durationMs)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
            <StatusBadge status={span.status === 'ok' ? 'completed' : 'error'} label={span.status} />
          </div>
          {span.parentSpanId && (
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Parent Span</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{span.parentSpanId}</div>
            </div>
          )}
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Depth</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{span.depth}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Start</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{span.startMs}ms</div>
          </div>
        </div>

        {/* Attributes table */}
        {entries.length > 0 && (
          <>
            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem', marginTop: '1rem' }}>
              Attributes
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--bg-secondary)' }}>
                    Key
                  </th>
                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--bg-secondary)' }}>
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, value]) => (
                  <tr key={key}>
                    <td
                      style={{
                        color: 'var(--info)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        padding: '0.35rem 0.5rem',
                        borderBottom: '1px solid var(--bg-primary)',
                      }}
                    >
                      {key}
                    </td>
                    <td
                      style={{
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        padding: '0.35rem 0.5rem',
                        borderBottom: '1px solid var(--bg-primary)',
                      }}
                    >
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
}

// ---------------------------------------------------------------------------
// TracesTab (default export)
// ---------------------------------------------------------------------------

export default function TracesTab(): React.ReactElement {
  const traceSummaries = (useDashboardStore((s) => s.traceSummaries) ?? []) as readonly TraceSummary[];
  const traceMetrics = (useDashboardStore((s) => s.traceMetrics) ?? { totalTraces: 0, avgDurationMs: 0, p95LatencyMs: 0, errorRate: 0 }) as TraceMetrics;
  const fetchTraceSummaries = useDashboardStore((s) => s.fetchTraceSummaries);
  const fetchTraceMetrics = useDashboardStore((s) => s.fetchTraceMetrics);

  // Fetch fresh data on mount
  useEffect(() => {
    void fetchTraceSummaries();
    void fetchTraceMetrics();
  }, [fetchTraceSummaries, fetchTraceMetrics]);

  const [selectedTrace, setSelectedTrace] = useState<TraceSummary | null>(null);
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // H-22: No mock data — use real traces or empty array (with null guard)
  const displayTraces = useMemo(
    () => (traceSummaries ?? []).filter((t): t is TraceSummary => t != null && typeof t === 'object' && 'traceId' in t),
    [traceSummaries],
  );

  const displayMetrics = useMemo((): TraceMetrics => {
    if (traceMetrics.totalTraces > 0) return traceMetrics;
    // Derive metrics from display traces
    const total = displayTraces.length;
    const durations = displayTraces.map((t) => t.durationMs ?? 0);
    const avg = durations.reduce((a, b) => a + b, 0) / (total || 1);
    const sorted = [...durations].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Idx] ?? 0;
    const errors = displayTraces.filter((t) => t.status === 'error').length;
    return {
      totalTraces: total,
      avgDurationMs: Math.round(avg),
      p95LatencyMs: p95,
      errorRate: total > 0 ? errors / total : 0,
    };
  }, [traceMetrics, displayTraces]);

  const handleSelectTrace = useCallback(async (trace: TraceSummary) => {
    setSelectedTrace(trace);
    setSelectedSpan(null);
    setIsLoadingDetail(true);

    try {
      const res = await fetch(`/api/traces/${trace.traceId}`);
      if (res.ok) {
        const data = await res.json();
        setTraceDetail(data as TraceDetail);
      } else {
        // H-22: No mock — show empty detail
        setTraceDetail(null);
      }
    } catch {
      // Network error — show empty state
      setTraceDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const handleSelectSpan = useCallback((span: Span) => {
    setSelectedSpan(span);
  }, []);

  const handleCloseSpanPanel = useCallback(() => {
    setSelectedSpan(null);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedTrace(null);
    setTraceDetail(null);
    setSelectedSpan(null);
  }, []);

  return (
    <div className="tab-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Metric cards — always visible */}
      <TraceMetricCards metrics={displayMetrics} />

      {/* Error rate chart — always visible */}
      <ErrorRateChart />

      {/* Trace detail view or trace list */}
      {selectedTrace && traceDetail ? (
        <div>
          <button
            onClick={handleBackToList}
            style={{
              background: 'none',
              border: '1px solid var(--border-glass)',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
            }}
          >
            &larr; Back to traces
          </button>
          <TraceWaterfall
            detail={traceDetail}
            selectedSpanId={selectedSpan?.spanId ?? null}
            onSelectSpan={handleSelectSpan}
          />
        </div>
      ) : isLoadingDetail ? (
        <Card title="Loading Trace..." subtitle="">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <LoadingSpinner />
          </div>
        </Card>
      ) : (
        <TraceList
          traces={displayTraces}
          selectedTraceId={selectedTrace?.traceId ?? null}
          onSelectTrace={handleSelectTrace}
        />
      )}

      {/* Span detail side panel */}
      {selectedSpan && <SpanDetailPanel span={selectedSpan} onClose={handleCloseSpanPanel} />}
    </div>
  );
}
