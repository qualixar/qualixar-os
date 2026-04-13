/**
 * Qualixar OS Phase 7 -- Memory Tab
 * Memory layer distribution (PieChart), trust score histogram, belief graph.
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as d3 from 'd3-force';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable } from '../components/shared.js';
import { SLMBrand } from '../components/SLMBrand.js';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const LAYER_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

// ---------------------------------------------------------------------------
// Belief graph (d3-force)
// ---------------------------------------------------------------------------

interface BeliefNode extends d3.SimulationNodeDatum {
  readonly id: string;
  readonly label: string;
}

interface BeliefLink extends d3.SimulationLinkDatum<BeliefNode> {
  readonly source: string;
  readonly target: string;
}

function BeliefGraph({
  nodes,
  links,
  width = 350,
  height = 250,
}: {
  readonly nodes: readonly BeliefNode[];
  readonly links: readonly BeliefLink[];
  readonly width?: number;
  readonly height?: number;
}): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const mutableNodes = nodes.map((n) => ({ ...n }));
    const mutableLinks = links.map((l) => ({ ...l }));

    const simulation = d3
      .forceSimulation(mutableNodes)
      .force('link', d3.forceLink(mutableLinks).id((d) => (d as BeliefNode).id).distance(60))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2));

    simulation.on('tick', () => {
      const svg = svgRef.current;
      if (!svg) return;
      const lineEls = svg.querySelectorAll('.belief-link');
      mutableLinks.forEach((l, i) => {
        const el = lineEls[i];
        if (!el) return;
        const src = l.source as unknown as BeliefNode;
        const tgt = l.target as unknown as BeliefNode;
        el.setAttribute('x1', String(src.x ?? 0));
        el.setAttribute('y1', String(src.y ?? 0));
        el.setAttribute('x2', String(tgt.x ?? 0));
        el.setAttribute('y2', String(tgt.y ?? 0));
      });
      const circleEls = svg.querySelectorAll('.belief-node');
      mutableNodes.forEach((n, i) => {
        const el = circleEls[i];
        if (!el) return;
        el.setAttribute('cx', String(n.x ?? 0));
        el.setAttribute('cy', String(n.y ?? 0));
      });
      const labelEls = svg.querySelectorAll('.belief-label');
      mutableNodes.forEach((n, i) => {
        const el = labelEls[i];
        if (!el) return;
        el.setAttribute('x', String(n.x ?? 0));
        el.setAttribute('y', String((n.y ?? 0) + 16));
      });
    });

    return () => { simulation.stop(); };
  }, [nodes, links, width, height]);

  if (nodes.length === 0) {
    return <div className="table-empty">No belief data to visualize</div>;
  }

  return (
    <svg ref={svgRef} width={width} height={height}>
      {links.map((l, i) => (
        <line key={i} className="belief-link" stroke="#475569" strokeWidth={1} />
      ))}
      {nodes.map((n) => (
        <circle key={n.id} className="belief-node" r={6} fill="#8b5cf6" stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {nodes.map((n) => (
        <text key={`l-${n.id}`} className="belief-label" fill="#94a3b8" fontSize={9} textAnchor="middle">
          {n.label}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const memoryEventColumns = [
  { key: 'type', header: 'Event' },
  { key: 'source', header: 'Source' },
  { key: 'detail', header: 'Detail' },
  { key: 'time', header: 'Time' },
];

interface MemoryEntry {
  readonly id: string;
  readonly layer: string;
  readonly content: string;
  readonly metadata: string;
  readonly trust_score: number;
  readonly access_count: number;
  readonly source: string;
  readonly created_at: string;
}

const memoryEntryColumns = [
  {
    key: 'layer',
    header: 'Layer',
    render: (row: Record<string, unknown>) => (
      <StatusBadge status="active" label={row.layer as string} />
    ),
  },
  {
    key: 'content',
    header: 'Content',
    render: (row: Record<string, unknown>) =>
      ((row.content as string) ?? '').slice(0, 60) + (((row.content as string) ?? '').length > 60 ? '...' : ''),
  },
  {
    key: 'trust_score',
    header: 'Trust',
    render: (row: Record<string, unknown>) => ((row.trust_score as number) ?? 0).toFixed(2),
  },
  { key: 'source', header: 'Source' },
  {
    key: 'created_at',
    header: 'Created',
    render: (row: Record<string, unknown>) =>
      new Date(row.created_at as string).toLocaleTimeString(),
  },
];

export function MemoryTab(): React.ReactElement {
  const stats = useDashboardStore((s) => s.memoryStats);
  const events = useDashboardStore((s) => s.events);
  const [entries, setEntries] = useState<readonly MemoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);

  useEffect(() => {
    fetch('/api/memory/entries?limit=50')
      .then((r) => r.json())
      .then((data) => { if (data.entries) setEntries(data.entries as MemoryEntry[]); })
      .catch(() => { /* non-critical */ });
  }, []);

  const handleEntryClick = useCallback((row: Record<string, unknown>) => {
    setSelectedEntry(row as unknown as MemoryEntry);
  }, []);
  const handleCloseEntry = useCallback(() => setSelectedEntry(null), []);

  const layerDistribution = useMemo(() => {
    if (!stats?.byLayer) return [];
    return Object.entries(stats.byLayer)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [stats]);

  // Memory-related events for the activity log
  const memoryEvents = useMemo(() => {
    return (events ?? [])
      .filter((e) => e.type?.startsWith('memory:'))
      .slice(0, 20)
      .map((e) => {
        let detail = '';
        try { const p = JSON.parse(e.payload); detail = p.layer ?? p.query ?? JSON.stringify(p).slice(0, 80); } catch { detail = e.payload?.slice(0, 80) ?? ''; }
        return { type: e.type, source: e.source, detail, time: new Date(e.created_at).toLocaleTimeString() };
      });
  }, [events]);

  const beliefNodes = useMemo((): BeliefNode[] => {
    if (!stats || stats.beliefNodes === 0) return [];
    // Create placeholder nodes based on stats
    return Array.from({ length: Math.min(stats.beliefNodes, 10) }, (_, i) => ({
      id: `belief-${i}`,
      label: `B${i + 1}`,
    }));
  }, [stats]);

  const beliefLinks = useMemo((): BeliefLink[] => {
    if (beliefNodes.length < 2) return [];
    return beliefNodes.slice(1).map((n) => ({
      source: beliefNodes[0].id,
      target: n.id,
    }));
  }, [beliefNodes]);

  useEffect(() => {
    if (!selectedEntry) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedEntry(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedEntry]);

  return (
    <div className="tab-grid">
      <div className="span-2" style={{ gridColumn: '1 / -1' }}>
        <SLMBrand variant="banner" />
      </div>
      <Card title="Memory Layer Distribution">
        {layerDistribution.length === 0 ? (
          <div className="table-empty">No memory data</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={layerDistribution}
                dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {layerDistribution.map((_, idx) => (
                  <Cell key={idx} fill={LAYER_COLORS[idx % LAYER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)', borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Belief Graph">
        <BeliefGraph nodes={beliefNodes} links={beliefLinks} />
      </Card>

      <Card title="Memory Stats">
        <div className="stat-grid">
          <div className="stat-item"><span className="stat-value">{stats?.totalEntries ?? 0}</span><span className="stat-label">Total Entries</span></div>
          <div className="stat-item"><span className="stat-value">{(stats?.avgTrustScore ?? 0).toFixed(2)}</span><span className="stat-label">Avg Trust</span></div>
          <div className="stat-item"><span className="stat-value">{stats?.beliefNodes ?? 0}</span><span className="stat-label">Belief Nodes</span></div>
          <div className="stat-item"><span className="stat-value">{stats?.beliefEdges ?? 0}</span><span className="stat-label">Belief Edges</span></div>
          <div className="stat-item"><span className="stat-value">{(stats?.ramUsageMb ?? 0).toFixed(1)} MB</span><span className="stat-label">RAM Usage</span></div>
        </div>
      </Card>

      <Card title="Memory Entries" subtitle="Click a row to see full content" className="span-2">
        <DataTable
          columns={memoryEntryColumns}
          data={entries as unknown as Record<string, unknown>[]}
          emptyMessage="No memory entries stored"
          onRowClick={handleEntryClick}
        />
      </Card>

      {selectedEntry && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={handleCloseEntry} role="dialog" aria-modal="true">
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseEntry}>x</button>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>Memory Entry Detail</h2>
            <div className="detail-row">
              <span className="detail-label">ID</span>
              <span className="detail-value">{selectedEntry.id}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Layer</span>
              <span className="detail-value"><StatusBadge status="active" label={selectedEntry.layer} /></span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Trust Score</span>
              <span className="detail-value">{selectedEntry.trust_score.toFixed(3)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Access Count</span>
              <span className="detail-value">{selectedEntry.access_count}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Source</span>
              <span className="detail-value">{selectedEntry.source}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Created</span>
              <span className="detail-value">{new Date(selectedEntry.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-section" style={{ marginTop: 16 }}>
              <h3>Full Content</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', maxHeight: 300, overflow: 'auto' }}>
                {selectedEntry.content}
              </pre>
            </div>
            {selectedEntry.metadata && selectedEntry.metadata !== '{}' && (
              <div className="detail-section" style={{ marginTop: 12 }}>
                <h3>Metadata</h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: 200, overflow: 'auto', color: 'var(--text-secondary)' }}>
                  {(() => { try { return JSON.stringify(JSON.parse(selectedEntry.metadata), null, 2); } catch { return selectedEntry.metadata; } })()}
                </pre>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {memoryEvents.length > 0 && (
        <Card title="Memory Activity Log" className="span-2">
          <DataTable
            columns={memoryEventColumns}
            data={memoryEvents as unknown as Record<string, unknown>[]}
            emptyMessage="No memory events"
          />
        </Card>
      )}
    </div>
  );
}
