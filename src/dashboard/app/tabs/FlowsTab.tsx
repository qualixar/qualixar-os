/**
 * Qualixar OS Phase 14 -- Flows Tab
 * Flow editor with topology picker, d3-force SVG canvas, node config, and CRUD.
 * Uses d3-force for auto-layout (same pattern as SwarmsTab).
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, useReducer } from 'react';
import * as d3 from 'd3-force';
import { useDashboardStore, type FlowDefinitionEntry } from '../store.js';
import { Card, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeState = 'idle' | 'running' | 'completed' | 'error';

interface FlowNode extends d3.SimulationNodeDatum {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly state: NodeState;
}

interface FlowEdge extends d3.SimulationLinkDatum<FlowNode> {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

interface FlowState {
  readonly id: string | null;
  readonly name: string;
  readonly topology: TopologyKey;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly selectedNodeId: string | null;
  readonly dirty: boolean;
}

type FlowAction =
  | { type: 'LOAD_FLOW'; payload: { id: string; name: string; topology: TopologyKey; nodes: readonly FlowNode[]; edges: readonly FlowEdge[] } }
  | { type: 'NEW_FLOW' }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_TOPOLOGY'; payload: TopologyKey }
  | { type: 'ADD_NODE' }
  | { type: 'DELETE_NODE'; payload: string }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'UPDATE_NODE'; payload: { id: string; role?: string; model?: string; systemPrompt?: string } }
  | { type: 'SET_GENERATED'; payload: { nodes: readonly FlowNode[]; edges: readonly FlowEdge[] } }
  | { type: 'ADD_EDGE'; payload: { source: string; target: string } }
  | { type: 'DELETE_EDGE'; payload: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPOLOGIES = [
  'sequential', 'parallel', 'star', 'hierarchical', 'debate',
  'circular', 'mesh', 'pipeline', 'tree', 'broadcast', 'reduce', 'custom', 'hybrid',
] as const;

type TopologyKey = typeof TOPOLOGIES[number];

const MODEL_OPTIONS = [
  'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-20250514',
  'gpt-4o', 'gpt-4o-mini', 'gemini-2.5-pro', 'gemini-2.5-flash',
] as const;

const NODE_COLORS: Record<NodeState, string> = {
  idle: '#334155',
  running: '#22c55e',
  completed: '#22c55e',
  error: '#ef4444',
};

const NODE_STROKES: Record<NodeState, string> = {
  idle: '#475569',
  running: '#4ade80',
  completed: '#16a34a',
  error: '#f87171',
};

// ---------------------------------------------------------------------------
// Topology generators
// ---------------------------------------------------------------------------

function makeNode(index: number): FlowNode {
  return {
    id: `node-${Date.now()}-${index}`,
    label: `Agent ${index + 1}`,
    role: 'worker',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: '',
    state: 'idle',
  };
}

function generateTopology(
  topo: TopologyKey,
  count: number,
): { nodes: readonly FlowNode[]; edges: readonly FlowEdge[] } {
  const nodes: FlowNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(makeNode(i));
  }

  const edges: FlowEdge[] = [];
  const edge = (si: number, ti: number): void => {
    edges.push({ id: `e-${si}-${ti}`, source: nodes[si].id, target: nodes[ti].id });
  };

  switch (topo) {
    case 'sequential':
    case 'pipeline':
      for (let i = 0; i < count - 1; i++) edge(i, i + 1);
      break;
    case 'parallel':
    case 'star':
    case 'broadcast':
      for (let i = 1; i < count; i++) edge(0, i);
      break;
    case 'hierarchical':
    case 'tree': {
      for (let i = 0; i < count; i++) {
        const parent = Math.floor((i - 1) / 2);
        if (parent >= 0) edge(parent, i);
      }
      break;
    }
    case 'debate':
      if (count >= 3) {
        edge(0, 1);
        edge(1, 0);
        for (let i = 2; i < count; i++) { edge(0, i); edge(1, i); }
      } else if (count === 2) {
        edge(0, 1); edge(1, 0);
      }
      break;
    case 'circular':
      for (let i = 0; i < count; i++) edge(i, (i + 1) % count);
      break;
    case 'mesh':
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) edge(i, j);
      }
      break;
    case 'reduce':
      for (let i = 0; i < count - 1; i++) edge(i, count - 1);
      break;
    case 'custom':
      // Empty — user draws manually
      break;
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const INITIAL_STATE: FlowState = {
  id: null,
  name: 'Untitled Flow',
  topology: 'sequential',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  dirty: false,
};

function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'NEW_FLOW': {
      const gen = generateTopology('sequential', 3);
      return { ...INITIAL_STATE, nodes: gen.nodes, edges: gen.edges, dirty: true };
    }
    case 'LOAD_FLOW':
      return {
        id: action.payload.id,
        name: action.payload.name,
        topology: action.payload.topology,
        nodes: action.payload.nodes,
        edges: action.payload.edges,
        selectedNodeId: null,
        dirty: false,
      };
    case 'SET_NAME':
      return { ...state, name: action.payload, dirty: true };
    case 'SET_TOPOLOGY': {
      const gen = generateTopology(action.payload, Math.max(state.nodes.length, 3));
      return { ...state, topology: action.payload, nodes: gen.nodes, edges: gen.edges, selectedNodeId: null, dirty: true };
    }
    case 'ADD_NODE': {
      const newNode = makeNode(state.nodes.length);
      return { ...state, nodes: [...state.nodes, newNode], dirty: true };
    }
    case 'DELETE_NODE': {
      const filtered = state.nodes.filter((n) => n.id !== action.payload);
      const filteredEdges = state.edges.filter(
        (e) => e.source !== action.payload && e.target !== action.payload,
      );
      return {
        ...state,
        nodes: filtered,
        edges: filteredEdges,
        selectedNodeId: state.selectedNodeId === action.payload ? null : state.selectedNodeId,
        dirty: true,
      };
    }
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };
    case 'UPDATE_NODE': {
      const { id, ...updates } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, ...updates, label: updates.role ?? n.label } : n,
        ),
        dirty: true,
      };
    }
    case 'SET_GENERATED':
      return { ...state, nodes: action.payload.nodes, edges: action.payload.edges, selectedNodeId: null, dirty: true };
    case 'ADD_EDGE': {
      const { source, target } = action.payload;
      // Don't add duplicate or self-referencing edges
      if (source === target) return state;
      if (state.edges.some((e) => e.source === source && e.target === target)) return state;
      const newEdge: FlowEdge = { id: `e-${source.slice(0, 4)}-${target.slice(0, 4)}`, source, target };
      return { ...state, edges: [...state.edges, newEdge], dirty: true };
    }
    case 'DELETE_EDGE':
      return { ...state, edges: state.edges.filter((e) => e.id !== action.payload), dirty: true };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// FlowCanvas — d3-force SVG visualization
// ---------------------------------------------------------------------------

function FlowCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  width = 600,
  height = 400,
}: {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (id: string | null) => void;
  readonly width?: number;
  readonly height?: number;
}): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const pad = 40;
    const mutableNodes = nodes.map((n, i) => {
      const prev = positionsRef.current.get(n.id);
      // Place new nodes in a grid near center instead of (0,0)
      const defaultX = prev?.x ?? (width / 2) + (i % 3 - 1) * 120;
      const defaultY = prev?.y ?? (height / 2) + Math.floor(i / 3) * 100;
      return { ...n, x: defaultX, y: defaultY };
    });
    const mutableEdges = edges.map((e) => ({ ...e }));

    const simulation = d3
      .forceSimulation(mutableNodes)
      .force('link', d3.forceLink(mutableEdges).id((d) => (d as FlowNode).id).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-80)) // Gentle repulsion — nodes stay on screen
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(40))
      .alphaDecay(0.05)  // Settle quickly
      .velocityDecay(0.4); // High friction — nodes don't fly away

    simulation.on('tick', () => {
      const svg = svgRef.current;
      if (!svg) return;

      // Clamp nodes to visible area — prevents flying off screen
      for (const n of mutableNodes) {
        n.x = Math.max(pad, Math.min(width - pad, n.x ?? width / 2));
        n.y = Math.max(pad, Math.min(height - pad, n.y ?? height / 2));
      }

      // Update edges
      const lineEls = svg.querySelectorAll('.flow-edge');
      mutableEdges.forEach((e, i) => {
        const el = lineEls[i];
        if (!el) return;
        const src = e.source as unknown as FlowNode;
        const tgt = e.target as unknown as FlowNode;
        el.setAttribute('x1', String(src.x ?? 0));
        el.setAttribute('y1', String(src.y ?? 0));
        el.setAttribute('x2', String(tgt.x ?? 0));
        el.setAttribute('y2', String(tgt.y ?? 0));
      });

      // Update nodes
      const circleEls = svg.querySelectorAll('.flow-node');
      mutableNodes.forEach((n, i) => {
        const el = circleEls[i];
        if (!el) return;
        el.setAttribute('cx', String(n.x ?? 0));
        el.setAttribute('cy', String(n.y ?? 0));
        positionsRef.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      });

      // Update labels
      const labelEls = svg.querySelectorAll('.flow-label');
      mutableNodes.forEach((n, i) => {
        const el = labelEls[i];
        if (!el) return;
        el.setAttribute('x', String(n.x ?? 0));
        el.setAttribute('y', String((n.y ?? 0) + 24));
      });
    });

    return () => { simulation.stop(); };
  }, [nodes, edges, width, height]);

  if (nodes.length === 0) {
    return (
      <div className="table-empty" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No nodes — create a new flow or select a topology
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="force-graph"
      style={{ cursor: 'crosshair' }}
      onClick={(e) => {
        if ((e.target as Element).tagName === 'svg') onSelectNode(null);
      }}
    >
      <defs>
        <marker id="flow-arrow" markerWidth="10" markerHeight="7" refX="18" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" opacity={0.7} />
        </marker>
      </defs>
      <style>{`
        @keyframes flow-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .flow-node-running { animation: flow-pulse 1.2s ease-in-out infinite; }
      `}</style>

      {edges.map((e) => (
        <line
          key={e.id}
          className="flow-edge"
          stroke="#6366f1"
          strokeWidth={1.5}
          strokeOpacity={0.5}
          markerEnd="url(#flow-arrow)"
        />
      ))}

      {nodes.map((n) => {
        const isSelected = n.id === selectedNodeId;
        return (
          <circle
            key={n.id}
            className={`flow-node${n.state === 'running' ? ' flow-node-running' : ''}`}
            r={isSelected ? 14 : 11}
            fill={NODE_COLORS[n.state]}
            stroke={isSelected ? '#f59e0b' : NODE_STROKES[n.state]}
            strokeWidth={isSelected ? 3 : 2}
            opacity={n.state === 'idle' ? 0.8 : 1}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onSelectNode(n.id); }}
          />
        );
      })}

      {nodes.map((n) => (
        <text
          key={`lbl-${n.id}`}
          className="flow-label"
          fill={n.id === selectedNodeId ? '#fbbf24' : 'var(--text-secondary)'}
          fontSize={10}
          fontWeight={n.id === selectedNodeId ? 600 : 400}
          textAnchor="middle"
          style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); onSelectNode(n.id); }}
        >
          {n.label}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NodeConfigPanel
// ---------------------------------------------------------------------------

function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
  onSaveFlow,
}: {
  readonly node: FlowNode;
  readonly onUpdate: (updates: { role?: string; model?: string; systemPrompt?: string }) => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
  readonly onSaveFlow: () => void;
}): React.ReactElement {
  const [saved, setSaved] = React.useState(false);

  const handleSaveConfig = React.useCallback(() => {
    onSaveFlow();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [onSaveFlow]);

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-glass)',
      borderRadius: 8,
      padding: 16,
      minWidth: 260,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>Node Config</span>
        <button onClick={onClose} style={closeBtnStyle}>&times;</button>
      </div>

      <label style={labelStyle}>Role</label>
      <input
        type="text"
        value={node.role}
        onChange={(e) => onUpdate({ role: e.target.value })}
        style={inputStyle}
      />

      <label style={labelStyle}>Model</label>
      <select
        value={node.model}
        onChange={(e) => onUpdate({ model: e.target.value })}
        style={inputStyle}
      >
        {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <label style={labelStyle}>System Prompt</label>
      <textarea
        value={node.systemPrompt}
        onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
        rows={4}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={handleSaveConfig}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: saved ? 'var(--success)' : 'var(--info)', color: 'var(--text-primary)',
            fontWeight: 600, fontSize: 13, transition: 'background 0.2s',
          }}
        >
          {saved ? 'Saved!' : 'Save Config'}
        </button>
        <button onClick={onDelete} style={{ ...deleteBtnStyle, flex: 'none', marginTop: 0 }}>Delete</button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4, marginTop: 10,
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)',
  borderRadius: 4, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
};

const deleteBtnStyle: React.CSSProperties = {
  marginTop: 14, width: '100%', padding: '8px 0', background: '#7f1d1d',
  color: '#fca5a5', border: '1px solid #991b1b', borderRadius: 4, cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};

// ---------------------------------------------------------------------------
// FlowToolbar
// ---------------------------------------------------------------------------

function FlowToolbar({
  state,
  dispatch,
  onSave,
  onRun,
  onDeleteFlow,
  saving,
  connecting,
  onConnectToggle,
}: {
  readonly state: FlowState;
  readonly dispatch: React.Dispatch<FlowAction>;
  readonly onSave: () => void;
  readonly onRun: () => void;
  readonly onDeleteFlow: () => void;
  readonly saving: boolean;
  readonly connecting: boolean;
  readonly onConnectToggle: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <button onClick={() => dispatch({ type: 'NEW_FLOW' })} style={toolbarBtnStyle}>
        + New Flow
      </button>
      <button onClick={onSave} disabled={saving || !state.dirty} style={toolbarBtnStyle}>
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button onClick={onRun} disabled={!state.id} style={{ ...toolbarBtnStyle, background: '#065f46', borderColor: '#059669' }}>
        Run
      </button>
      <button onClick={onDeleteFlow} disabled={!state.id} style={{ ...toolbarBtnStyle, background: '#7f1d1d', borderColor: '#991b1b' }}>
        Delete
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Topology:</label>
        <select
          value={state.topology}
          onChange={(e) => dispatch({ type: 'SET_TOPOLOGY', payload: e.target.value as TopologyKey })}
          style={{ ...inputStyle, width: 140 }}
        >
          {TOPOLOGIES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <button onClick={() => dispatch({ type: 'ADD_NODE' })} style={toolbarBtnStyle}>
          + Node
        </button>
        <button
          onClick={() => onConnectToggle()}
          style={{
            ...toolbarBtnStyle,
            background: connecting ? '#6366f1' : undefined,
            borderColor: connecting ? '#818cf8' : undefined,
            color: connecting ? '#fff' : undefined,
          }}
        >
          {connecting ? 'Click 2 nodes...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
  border: '1px solid var(--border-glass)', borderRadius: 4, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
};

// ---------------------------------------------------------------------------
// FlowList
// ---------------------------------------------------------------------------

function FlowList({
  flows,
  activeId,
  onSelect,
}: {
  readonly flows: readonly FlowDefinitionEntry[];
  readonly activeId: string | null;
  readonly onSelect: (flow: FlowDefinitionEntry) => void;
}): React.ReactElement {
  const columns = useMemo(() => [
    { key: 'name', header: 'Name' },
    { key: 'topology', header: 'Topology' },
    { key: 'nodeCount', header: 'Nodes' },
    { key: 'edgeCount', header: 'Edges' },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row: Record<string, unknown>) => {
        const d = row.updatedAt as string;
        return d ? new Date(d).toLocaleDateString() : '--';
      },
    },
  ], []);

  const data = useMemo(() =>
    flows.map((f) => ({
      ...f,
      _rowStyle: f.id === activeId ? { background: 'var(--bg-tertiary)' } : undefined,
    })) as unknown as Record<string, unknown>[],
    [flows, activeId],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="No saved flows"
      onRowClick={(row) => {
        const match = flows.find((f) => f.id === (row as Record<string, unknown>).id);
        if (match) onSelect(match);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// FlowCanvasContainer — responsive width wrapper
// ---------------------------------------------------------------------------

function FlowCanvasContainer({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (id: string | null) => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    // Set initial width
    setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, width: '100%' }}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        width={containerWidth}
        height={400}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlowsTab — Main export
// ---------------------------------------------------------------------------

export default function FlowsTab(): React.ReactElement {
  const flowDefinitions = useDashboardStore((s) => s.flowDefinitions) ?? [];
  const fetchFlowDefinitions = useDashboardStore((s) => s.fetchFlowDefinitions);

  const [state, dispatch] = useReducer(flowReducer, INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => { fetchFlowDefinitions(); }, [fetchFlowDefinitions]);

  // Load a flow from the list
  const handleLoadFlow = useCallback(async (entry: FlowDefinitionEntry) => {
    try {
      const res = await fetch(`/api/flows/${entry.id}`);
      const data = await res.json();
      const flowData = data.flow ?? data;
      dispatch({
        type: 'LOAD_FLOW',
        payload: {
          id: entry.id,
          name: flowData.name ?? entry.name,
          topology: (flowData.topology ?? entry.topology) as TopologyKey,
          nodes: (flowData.nodes ?? []).map((n: Record<string, unknown>, i: number) => ({
            id: (n.id as string) ?? `node-${i}`,
            label: (n.role as string) ?? (n.label as string) ?? `Agent ${i + 1}`,
            role: (n.role as string) ?? 'worker',
            model: (n.model as string) ?? 'claude-sonnet-4-20250514',
            systemPrompt: (n.systemPrompt as string) ?? '',
            state: 'idle' as NodeState,
          })),
          edges: (flowData.edges ?? []).map((e: Record<string, unknown>, i: number) => ({
            id: (e.id as string) ?? `e-${i}`,
            source: e.source as string,
            target: e.target as string,
          })),
        },
      });
    } catch {
      // Fallback: generate from topology
      const gen = generateTopology(entry.topology as TopologyKey, entry.nodeCount || 3);
      dispatch({
        type: 'LOAD_FLOW',
        payload: { id: entry.id, name: entry.name, topology: entry.topology as TopologyKey, nodes: gen.nodes, edges: gen.edges },
      });
    }
  }, []);

  // Save flow
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: state.name,
        topology: state.topology,
        nodes: state.nodes.map((n) => ({ id: n.id, role: n.role, model: n.model, systemPrompt: n.systemPrompt })),
        edges: state.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };
      const method = state.id ? 'PUT' : 'POST';
      const url = state.id ? `/api/flows/${state.id}` : '/api/flows';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.id || data.flow?.id) {
        dispatch({
          type: 'LOAD_FLOW',
          payload: { id: data.id ?? data.flow.id, name: state.name, topology: state.topology, nodes: state.nodes, edges: state.edges },
        });
      }
      await fetchFlowDefinitions();
    } catch {
      setSaveError('Failed to save flow');
      setTimeout(() => setSaveError(null), 3000);
    }
    setSaving(false);
  }, [state, fetchFlowDefinitions]);

  // Run flow
  const handleRun = useCallback(async () => {
    if (!state.id) return;
    setRunStatus('running');
    try {
      const res = await fetch(`/api/flows/${state.id}/run`, { method: 'POST' });
      const data = await res.json();
      setRunStatus(data.status ?? 'submitted');
      setTimeout(() => setRunStatus(null), 3000);
    } catch {
      setRunStatus('error');
      setTimeout(() => setRunStatus(null), 3000);
    }
  }, [state.id]);

  // Delete flow
  const handleDeleteFlow = useCallback(async () => {
    if (!state.id) return;
    try {
      await fetch(`/api/flows/${state.id}`, { method: 'DELETE' });
      dispatch({ type: 'NEW_FLOW' });
      await fetchFlowDefinitions();
    } catch { /* non-critical */ }
  }, [state.id, fetchFlowDefinitions]);

  // Edge connection mode: click Connect btn → click source node → click target node → edge created
  const [connectSource, setConnectSource] = useState<string | null>(null);

  const handleSelectNode = useCallback((id: string | null) => {
    // Connect mode active
    if (connectSource) {
      if (connectSource === '__waiting__' && id) {
        // First click in connect mode — set as source
        setConnectSource(id);
        return;
      }
      if (connectSource !== '__waiting__' && id && connectSource !== id) {
        // Second click — create edge
        dispatch({ type: 'ADD_EDGE', payload: { source: connectSource, target: id } });
        setConnectSource(null);
        return;
      }
      if (id === connectSource) {
        // Clicked same node — cancel
        setConnectSource(null);
      }
      return;
    }
    // Normal mode — select node for config panel
    dispatch({ type: 'SELECT_NODE', payload: id });
  }, [connectSource]);

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId],
  );

  const handleUpdateNode = useCallback((updates: { role?: string; model?: string; systemPrompt?: string }) => {
    if (!state.selectedNodeId) return;
    dispatch({ type: 'UPDATE_NODE', payload: { id: state.selectedNodeId, ...updates } });
  }, [state.selectedNodeId]);

  const handleDeleteNode = useCallback(() => {
    if (!state.selectedNodeId) return;
    dispatch({ type: 'DELETE_NODE', payload: state.selectedNodeId });
  }, [state.selectedNodeId]);

  return (
    <div className="tab-grid">
      {/* Left column: Flow list */}
      <Card title="Saved Flows" className="span-1">
        <FlowList flows={flowDefinitions} activeId={state.id} onSelect={handleLoadFlow} />
      </Card>

      {/* Right column: Editor */}
      <Card
        title={`${state.name}${state.dirty ? ' *' : ''}`}
        subtitle={state.id ? `ID: ${state.id.slice(0, 12)}` : 'Unsaved'}
        className="span-2"
      >
        {/* Flow name input */}
        <div style={{ marginBottom: 8 }}>
          <input
            type="text"
            value={state.name}
            onChange={(e) => dispatch({ type: 'SET_NAME', payload: e.target.value })}
            placeholder="Flow name"
            style={{ ...inputStyle, width: 300, marginBottom: 8 }}
          />
        </div>

        <FlowToolbar
          state={state}
          dispatch={dispatch}
          onSave={handleSave}
          onRun={handleRun}
          onDeleteFlow={handleDeleteFlow}
          saving={saving}
          connecting={connectSource !== null}
          onConnectToggle={() => setConnectSource(connectSource ? null : '__waiting__')}
        />

        {runStatus && (
          <div style={{
            padding: '6px 12px',
            marginBottom: 8,
            borderRadius: 4,
            fontSize: 12,
            background: runStatus === 'error' ? '#7f1d1d' : '#065f46',
            color: runStatus === 'error' ? '#fca5a5' : '#6ee7b7',
          }}>
            Flow run: {runStatus}
          </div>
        )}

        {saveError && (
          <div style={{
            padding: '6px 12px',
            marginBottom: 8,
            borderRadius: 4,
            fontSize: 12,
            background: '#7f1d1d',
            color: '#fca5a5',
          }}>
            {saveError}
          </div>
        )}

        {/* Canvas + config panel */}
        <div style={{ display: 'flex', gap: 12 }}>
          <FlowCanvasContainer
            nodes={state.nodes}
            edges={state.edges}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={handleSelectNode}
          />

          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={handleUpdateNode}
              onDelete={handleDeleteNode}
              onClose={() => handleSelectNode(null)}
              onSaveFlow={handleSave}
            />
          )}
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
          <span>Nodes: {state.nodes.length}</span>
          <span>Edges: {state.edges.length}</span>
          <span>Topology: {state.topology}</span>
        </div>
      </Card>
    </div>
  );
}
