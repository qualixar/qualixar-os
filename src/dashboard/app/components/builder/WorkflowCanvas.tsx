/**
 * Qualixar OS Phase 21 — Workflow Canvas
 * SVG-based canvas with pan, zoom, node drag-drop, port connection.
 * Pure React + SVG — no React Flow, no D3.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkflowNode, WorkflowEdge, Viewport } from '../../tabs/BuilderTab.js';
import { CanvasNode } from './CanvasNode.js';
import { CanvasEdge } from './CanvasEdge.js';
import { SelectionBox } from './SelectionBox.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowCanvasProps {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly selectedNodeId: string | null;
  readonly viewport: Viewport;
  readonly onSelectNode: (id: string | null) => void;
  readonly onMoveNode: (id: string, x: number, y: number) => void;
  readonly onDropNode: (type: string, x: number, y: number) => void;
  readonly onConnect: (srcNodeId: string, srcPortId: string, tgtNodeId: string, tgtPortId: string) => void;
  readonly onViewportChange: (vp: Viewport) => void;
}

// ---------------------------------------------------------------------------
// Pending connection while user drags from a port
// ---------------------------------------------------------------------------

interface PendingConnection {
  readonly srcNodeId: string;
  readonly srcPortId: string;
  readonly startX: number;
  readonly startY: number;
  currentX: number;
  currentY: number;
}

// ---------------------------------------------------------------------------
// WorkflowCanvas
// ---------------------------------------------------------------------------

export function WorkflowCanvas({
  nodes, edges, selectedNodeId, viewport,
  onSelectNode, onMoveNode, onDropNode, onConnect, onViewportChange,
}: WorkflowCanvasProps): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Node drag state
  const draggingNode = useRef<{ id: string; startX: number; startY: number; mouseStartX: number; mouseStartY: number } | null>(null);

  // Pending edge connection
  const [pendingConn, setPendingConn] = useState<PendingConnection | null>(null);

  // Multi-select box
  const [selBox, setSelBox] = useState<{ startPos: { x: number; y: number }; endPos: { x: number; y: number }; visible: boolean }>({
    startPos: { x: 0, y: 0 }, endPos: { x: 0, y: 0 }, visible: false,
  });

  // Container size for viewBox
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Convert SVG coordinates to world coordinates
  const svgToWorld = useCallback((svgX: number, svgY: number) => {
    return {
      x: (svgX - viewport.offsetX) / viewport.zoom,
      y: (svgY - viewport.offsetY) / viewport.zoom,
    };
  }, [viewport]);

  // Get SVG-relative mouse position from a mouse event
  const getMouseSVG = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // -------------------------------------------------------------------------
  // Background mouse events — pan + deselect
  // -------------------------------------------------------------------------

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, ox: viewport.offsetX, oy: viewport.offsetY };
    onSelectNode(null);
  }, [viewport, onSelectNode]);

  // -------------------------------------------------------------------------
  // Global mouse move/up for pan and node drag
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        onViewportChange({ ...viewport, offsetX: panStart.current.ox + dx, offsetY: panStart.current.oy + dy });
        return;
      }

      if (draggingNode.current) {
        const { id, startX, startY, mouseStartX, mouseStartY } = draggingNode.current;
        const dx = (e.clientX - mouseStartX) / viewport.zoom;
        const dy = (e.clientY - mouseStartY) / viewport.zoom;
        onMoveNode(id, startX + dx, startY + dy);
        return;
      }

      if (pendingConn) {
        const pos = { x: e.clientX, y: e.clientY };
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          setPendingConn(prev => prev ? { ...prev, currentX: pos.x - rect.left, currentY: pos.y - rect.top } : null);
        }
      }
    };

    const onMouseUp = () => {
      isPanning.current = false;
      draggingNode.current = null;
      setPendingConn(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [viewport, onViewportChange, onMoveNode, pendingConn]);

  // -------------------------------------------------------------------------
  // Zoom on wheel
  // -------------------------------------------------------------------------

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.25, Math.min(3.0, viewport.zoom * factor));
    const mousePos = getMouseSVG(e);
    // Zoom toward mouse pointer
    const worldX = (mousePos.x - viewport.offsetX) / viewport.zoom;
    const worldY = (mousePos.y - viewport.offsetY) / viewport.zoom;
    const newOffsetX = mousePos.x - worldX * newZoom;
    const newOffsetY = mousePos.y - worldY * newZoom;
    onViewportChange({ zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY });
  }, [viewport, getMouseSVG, onViewportChange]);

  // -------------------------------------------------------------------------
  // Drag-drop from NodePalette
  // -------------------------------------------------------------------------

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/qos-node-type');
    if (!nodeType) return;
    const pos = getMouseSVG(e);
    const world = svgToWorld(pos.x, pos.y);
    onDropNode(nodeType, world.x, world.y);
  }, [getMouseSVG, svgToWorld, onDropNode]);

  // -------------------------------------------------------------------------
  // Node drag start (called from CanvasNode)
  // -------------------------------------------------------------------------

  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    draggingNode.current = {
      id: nodeId,
      startX: node.x,
      startY: node.y,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
    onSelectNode(nodeId);
  }, [nodes, onSelectNode]);

  // -------------------------------------------------------------------------
  // Port drag — start connection
  // -------------------------------------------------------------------------

  const handlePortDragStart = useCallback((nodeId: string, portId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = getMouseSVG(e);
    setPendingConn({ srcNodeId: nodeId, srcPortId: portId, startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
  }, [getMouseSVG]);

  // -------------------------------------------------------------------------
  // Port mouse-up — complete connection
  // -------------------------------------------------------------------------

  const handlePortMouseUp = useCallback((nodeId: string, portId: string) => {
    if (pendingConn && pendingConn.srcNodeId !== nodeId) {
      onConnect(pendingConn.srcNodeId, pendingConn.srcPortId, nodeId, portId);
    }
    setPendingConn(null);
  }, [pendingConn, onConnect]);

  // -------------------------------------------------------------------------
  // Compute node center in SVG coords (for port positions)
  // -------------------------------------------------------------------------

  function nodePortSVGPos(node: WorkflowNode, side: 'input' | 'output'): { x: number; y: number } {
    const wx = side === 'input' ? node.x : node.x + node.width;
    const wy = node.y + node.height / 2;
    return { x: wx * viewport.zoom + viewport.offsetX, y: wy * viewport.zoom + viewport.offsetY };
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const transform = `translate(${viewport.offsetX}, ${viewport.offsetY}) scale(${viewport.zoom})`;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--canvas-bg, #0f172a)' }}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        role="application"
        aria-label="Workflow Builder Canvas"
        style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'grab' }}
        onMouseDown={onBgMouseDown}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Grid dots background */}
        <defs>
          <pattern id="builder-grid" x={viewport.offsetX % (20 * viewport.zoom)} y={viewport.offsetY % (20 * viewport.zoom)} width={20 * viewport.zoom} height={20 * viewport.zoom} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.8} fill="#1e293b" />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="url(#builder-grid)" />

        <g transform={transform}>
          {/* Edges */}
          {edges.map(edge => {
            const src = nodes.find(n => n.id === edge.sourceNodeId);
            const tgt = nodes.find(n => n.id === edge.targetNodeId);
            if (!src || !tgt) return null;
            return (
              <CanvasEdge
                key={edge.id}
                edge={edge}
                sourceNode={src}
                targetNode={tgt}
                selected={false}
                onSelect={() => {}}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => (
            <CanvasNode
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              onSelect={() => onSelectNode(node.id)}
              onDragEnd={(e: React.MouseEvent) => handleNodeDragStart(node.id, e)}
              onPortDragStart={(portId, e) => handlePortDragStart(node.id, portId, e)}
              onPortMouseUp={(portId) => handlePortMouseUp(node.id, portId)}
            />
          ))}

          {/* Pending connection line */}
          {pendingConn && (() => {
            const worldStart = svgToWorld(pendingConn.startX, pendingConn.startY);
            const worldEnd = svgToWorld(pendingConn.currentX, pendingConn.currentY);
            const cx1 = worldStart.x + (worldEnd.x - worldStart.x) * 0.5;
            const cx2 = worldEnd.x - (worldEnd.x - worldStart.x) * 0.5;
            return (
              <path
                d={`M ${worldStart.x} ${worldStart.y} C ${cx1} ${worldStart.y} ${cx2} ${worldEnd.y} ${worldEnd.x} ${worldEnd.y}`}
                fill="none"
                stroke="#60a5fa"
                strokeWidth={2 / viewport.zoom}
                strokeDasharray={`${6 / viewport.zoom} ${3 / viewport.zoom}`}
                pointerEvents="none"
              />
            );
          })()}
        </g>

        {/* Selection box (in SVG coords, not world coords) */}
        <SelectionBox startPos={selBox.startPos} endPos={selBox.endPos} visible={selBox.visible} />
      </svg>
    </div>
  );
}
