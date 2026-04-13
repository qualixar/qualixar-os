/**
 * Qualixar OS Phase 21 — Visual Workflow Builder Tab
 * Top-level tab: 3-column layout (NodePalette | WorkflowCanvas | PropertiesPanel).
 * Manages viewport state, selection, workflow CRUD, undo/redo history.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WorkflowCanvas } from '../components/builder/WorkflowCanvas.js';
import { NodePalette } from '../components/builder/NodePalette.js';
import { PropertiesPanel } from '../components/builder/PropertiesPanel.js';
import { CanvasToolbar } from '../components/builder/CanvasToolbar.js';
import { ExecutionOverlay } from '../components/builder/ExecutionOverlay.js';
import { MiniMap } from '../components/builder/MiniMap.js';
import { LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Builder Domain Types
// ---------------------------------------------------------------------------

export interface NodePort {
  readonly id: string;
  readonly label: string;
  readonly direction: 'input' | 'output';
}

export interface WorkflowNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly ports: readonly NodePort[];
  readonly config: Record<string, unknown>;
}

export interface WorkflowEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
  readonly label?: string;
}

export interface Viewport {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zoom: number;
}

export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'complete' | 'error' | 'skipped';

export interface WorkflowExecutionState {
  readonly isRunning: boolean;
  readonly nodeStates: Record<string, NodeExecutionStatus>;
}

interface WorkflowSnapshot {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}

// ---------------------------------------------------------------------------
// Undo/Redo Stack
// ---------------------------------------------------------------------------

interface HistoryState {
  readonly past: readonly WorkflowSnapshot[];
  readonly present: WorkflowSnapshot;
  readonly future: readonly WorkflowSnapshot[];
}

function pushHistory(h: HistoryState, next: WorkflowSnapshot): HistoryState {
  return { past: [...h.past, h.present], present: next, future: [] };
}

function undoHistory(h: HistoryState): HistoryState {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

function redoHistory(h: HistoryState): HistoryState {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

// ---------------------------------------------------------------------------
// BuilderTab
// ---------------------------------------------------------------------------

export function BuilderTab(): React.ReactElement {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const [executionState, setExecutionState] = useState<WorkflowExecutionState>({ isRunning: false, nodeStates: {} });
  const [workflowList, setWorkflowList] = useState<readonly { id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: { nodes: [], edges: [] },
    future: [],
  });

  const nodes = history.present.nodes;
  const edges = history.present.edges;

  const commit = useCallback((next: WorkflowSnapshot) => {
    setHistory(h => pushHistory(h, next));
  }, []);

  // Fetch workflow list on mount
  useEffect(() => {
    fetch('/api/workflows')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { workflows: { id: string; name: string }[] }) => setWorkflowList(data.workflows ?? []))
      .catch(() => setLoadError('Failed to load workflows'))
      .finally(() => setInitialLoading(false));
  }, []);

  const handleNewWorkflow = useCallback(() => {
    setWorkflowId(null);
    setWorkflowName('Untitled Workflow');
    setSelectedNodeId(null);
    setHistory({ past: [], present: { nodes: [], edges: [] }, future: [] });
    setExecutionState({ isRunning: false, nodeStates: {} });
  }, []);

  const handleLoadWorkflow = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { workflow: { name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] } };
      const wf = data.workflow;
      setWorkflowId(id);
      setWorkflowName(wf.name ?? 'Untitled Workflow');
      setSelectedNodeId(null);
      setHistory({ past: [], present: { nodes: wf.nodes ?? [], edges: wf.edges ?? [] }, future: [] });
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  const handleSave = useCallback(async () => {
    const body = { name: workflowName, nodes, edges };
    const url = workflowId ? `/api/workflows/${workflowId}` : '/api/workflows';
    const method = workflowId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json() as { workflow: { id: string } };
      if (!workflowId) setWorkflowId(saved.workflow.id);
    } catch (err) {
      setLoadError(String(err));
    }
  }, [workflowId, workflowName, nodes, edges]);

  const handleRun = useCallback(async () => {
    if (!workflowId) { setLoadError('Save the workflow before running'); return; }
    setExecutionState({ isRunning: true, nodeStates: {} });
    try {
      await fetch(`/api/workflows/${workflowId}/run`, { method: 'POST' });
    } catch {
      setExecutionState({ isRunning: false, nodeStates: {} });
    }
  }, [workflowId]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify({ name: workflowName, nodes, edges }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflowName, nodes, edges]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as { name?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] };
          setWorkflowName(data.name ?? 'Imported Workflow');
          setHistory({ past: [], present: { nodes: data.nodes ?? [], edges: data.edges ?? [] }, future: [] });
        } catch { setLoadError('Invalid workflow JSON'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  const handleNodeChange = useCallback((updated: WorkflowNode) => {
    commit({ nodes: nodes.map(n => n.id === updated.id ? updated : n), edges });
  }, [nodes, edges, commit]);

  if (initialLoading) {
    return <LoadingSpinner message="Loading workflow builder..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {loadError && (
        <div style={{ background: '#ef4444', color: '#fff', padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>{loadError}</span>
          <button
            onClick={() => {
              setLoadError(null);
              setInitialLoading(true);
              fetch('/api/workflows')
                .then(r => r.ok ? r.json() : Promise.reject(r.status))
                .then((data: { workflows: { id: string; name: string }[] }) => setWorkflowList(data.workflows ?? []))
                .catch(() => setLoadError('Failed to load workflows'))
                .finally(() => setInitialLoading(false));
            }}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', cursor: 'pointer', padding: '2px 10px', borderRadius: 4, fontSize: 12 }}
          >
            Retry
          </button>
          <button onClick={() => setLoadError(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Workflow selector bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-color, #2d3748)', background: 'var(--card-bg, #1a202c)' }}>
        <input
          value={workflowName}
          onChange={e => setWorkflowName(e.target.value)}
          style={{ flex: 1, maxWidth: 280, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #4a5568)', background: 'var(--input-bg, #2d3748)', color: 'inherit' }}
          aria-label="Workflow name"
        />
        <button onClick={handleNewWorkflow} style={btnStyle}>+ New</button>
        <select onChange={e => { if (e.target.value) handleLoadWorkflow(e.target.value); }} defaultValue="" style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--input-bg, #2d3748)', color: 'inherit', border: '1px solid var(--border-color, #4a5568)' }} aria-label="Load workflow">
          <option value="">Load workflow…</option>
          {workflowList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <CanvasToolbar
        zoom={viewport.zoom}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        isRunning={executionState.isRunning}
        onZoomChange={z => setViewport(v => ({ ...v, zoom: z }))}
        onUndo={() => setHistory(h => undoHistory(h))}
        onRedo={() => setHistory(h => redoHistory(h))}
        onRun={handleRun}
        onSave={handleSave}
        onExport={handleExport}
        onImport={handleImport}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid var(--border-color, #2d3748)', overflow: 'auto' }}>
          <NodePalette />
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            viewport={viewport}
            onSelectNode={setSelectedNodeId}
            onMoveNode={(id, x, y) => commit({ nodes: nodes.map(n => n.id === id ? { ...n, x, y } : n), edges })}
            onDropNode={(type, x, y) => {
              const id = `node-${Date.now()}`;
              const newNode: WorkflowNode = { id, type, label: type, x, y, width: 160, height: 80, ports: [{ id: 'in', label: 'in', direction: 'input' }, { id: 'out', label: 'out', direction: 'output' }], config: {} };
              commit({ nodes: [...nodes, newNode], edges });
            }}
            onConnect={(srcNodeId, srcPortId, tgtNodeId, tgtPortId) => {
              const id = `edge-${Date.now()}`;
              commit({ nodes, edges: [...edges, { id, sourceNodeId: srcNodeId, sourcePortId: srcPortId, targetNodeId: tgtNodeId, targetPortId: tgtPortId }] });
            }}
            onViewportChange={setViewport}
          />
          <ExecutionOverlay executionState={executionState} nodes={nodes} />
          <MiniMap nodes={nodes} viewport={viewport} canvasSize={{ width: 2000, height: 2000 }} onViewportChange={setViewport} />
        </div>

        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border-color, #2d3748)', overflow: 'auto' }}>
          {selectedNode ? (
            <PropertiesPanel node={selectedNode} onChange={handleNodeChange} />
          ) : (
            <div style={{ padding: 16, color: 'var(--text-muted, #718096)', fontSize: 13 }}>Select a node to configure it.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--border-color, #4a5568)',
  background: 'var(--card-bg, #2d3748)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
};

export default BuilderTab;
