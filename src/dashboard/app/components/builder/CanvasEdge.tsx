/**
 * Qualixar OS Phase 21 — Canvas Edge
 * SVG bezier path between two nodes' ports.
 * Animated dash for running state. Clickable for selection.
 */

import React, { useState, useCallback } from 'react';
import type { WorkflowNode, WorkflowEdge } from '../../tabs/BuilderTab.js';
import type { NodeExecutionStatus } from '../../tabs/BuilderTab.js';

// ---------------------------------------------------------------------------
// Port position calculation helpers
// ---------------------------------------------------------------------------

function getPortPosition(
  node: WorkflowNode,
  portId: string,
): { x: number; y: number } {
  const headerH = 28;
  const ports = node.ports;
  const inputPorts = ports.filter(p => p.direction === 'input');
  const outputPorts = ports.filter(p => p.direction === 'output');

  const inputIdx = inputPorts.findIndex(p => p.id === portId);
  if (inputIdx >= 0) {
    const cy = headerH + ((node.height - headerH) / (inputPorts.length + 1)) * (inputIdx + 1);
    return { x: node.x, y: node.y + cy };
  }

  const outputIdx = outputPorts.findIndex(p => p.id === portId);
  if (outputIdx >= 0) {
    const cy = headerH + ((node.height - headerH) / (outputPorts.length + 1)) * (outputIdx + 1);
    return { x: node.x + node.width, y: node.y + cy };
  }

  // Fallback — center right
  return { x: node.x + node.width, y: node.y + node.height / 2 };
}

function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.abs(tx - sx);
  const offset = Math.max(dx * 0.5, 60);
  const cx1 = sx + offset;
  const cx2 = tx - offset;
  return `M ${sx} ${sy} C ${cx1} ${sy} ${cx2} ${ty} ${tx} ${ty}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasEdgeProps {
  readonly edge: WorkflowEdge;
  readonly sourceNode: WorkflowNode;
  readonly targetNode: WorkflowNode;
  readonly selected: boolean;
  readonly executionStatus?: NodeExecutionStatus;
  readonly onSelect: () => void;
}

// ---------------------------------------------------------------------------
// CanvasEdge
// ---------------------------------------------------------------------------

export function CanvasEdge({
  edge, sourceNode, targetNode,
  selected, executionStatus = 'idle',
  onSelect,
}: CanvasEdgeProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const src = getPortPosition(sourceNode, edge.sourcePortId);
  const tgt = getPortPosition(targetNode, edge.targetPortId);
  const d = bezierPath(src.x, src.y, tgt.x, tgt.y);

  const isRunning = executionStatus === 'running';
  const isComplete = executionStatus === 'complete';
  const isError = executionStatus === 'error';

  let strokeColor = 'var(--edge-color, #475569)';
  if (selected) strokeColor = '#60a5fa';
  else if (hovered) strokeColor = '#94a3b8';
  else if (isRunning) strokeColor = '#3b82f6';
  else if (isComplete) strokeColor = '#22c55e';
  else if (isError) strokeColor = '#ef4444';

  const strokeWidth = selected || hovered ? 2.5 : 1.8;

  const midX = (src.x + tgt.x) / 2;
  const midY = (src.y + tgt.y) / 2;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onMouseDown}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={`Edge from ${sourceNode.label} to ${targetNode.label}`}
    >
      {/* Invisible wider hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />

      {/* Main path */}
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
      />

      {/* Animated dash for running state */}
      {isRunning && (
        <path
          d={d}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeDasharray="8 6"
          opacity={0.8}
        >
          <animate
            attributeName="stroke-dashoffset"
            values="100;0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Arrow head at target */}
      <polygon
        points={`${tgt.x},${tgt.y} ${tgt.x - 8},${tgt.y - 4} ${tgt.x - 8},${tgt.y + 4}`}
        fill={strokeColor}
        style={{ transition: 'fill 0.15s' }}
      />

      {/* Edge label */}
      {edge.label && (
        <g transform={`translate(${midX}, ${midY})`}>
          <rect x={-24} y={-9} width={48} height={16} rx={4} fill="var(--node-bg, #1e293b)" opacity={0.85} />
          <text
            textAnchor="middle"
            dy={4}
            fontSize={10}
            fill="var(--text-secondary, #94a3b8)"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {edge.label}
          </text>
        </g>
      )}

      {/* Selection dot at midpoint when selected */}
      {selected && (
        <circle
          cx={midX}
          cy={midY}
          r={5}
          fill="#60a5fa"
          stroke="#fff"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}
