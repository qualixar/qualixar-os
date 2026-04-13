/**
 * Qualixar OS Phase 21 — Canvas Node
 * Renders a single workflow node as SVG group.
 * Rounded rect + colored header + label + port circles.
 * Draggable, selectable, port-drag-startable.
 */

import React, { useState, useCallback } from 'react';
import type { WorkflowNode } from '../../tabs/BuilderTab.js';
import type { NodeExecutionStatus } from '../../tabs/BuilderTab.js';

// ---------------------------------------------------------------------------
// Node type → header color mapping
// ---------------------------------------------------------------------------

const NODE_HEADER_COLORS: Record<string, string> = {
  // Flow
  start: '#22c55e',
  end: '#ef4444',
  branch: '#f59e0b',
  merge: '#8b5cf6',
  // Agent
  agent: '#3b82f6',
  llm: '#06b6d4',
  judge: '#a78bfa',
  // Logic
  condition: '#f97316',
  loop: '#ec4899',
  filter: '#14b8a6',
  // IO
  input: '#64748b',
  output: '#94a3b8',
  transform: '#6366f1',
};

function getHeaderColor(type: string): string {
  return NODE_HEADER_COLORS[type.toLowerCase()] ?? '#475569';
}

// ---------------------------------------------------------------------------
// Status ring color
// ---------------------------------------------------------------------------

const STATUS_RING: Record<string, string> = {
  idle: 'transparent',
  pending: '#f59e0b',
  running: '#3b82f6',
  complete: '#22c55e',
  error: '#ef4444',
  skipped: '#374151',
};

// ---------------------------------------------------------------------------
// Port circle
// ---------------------------------------------------------------------------

interface PortCircleProps {
  readonly cx: number;
  readonly cy: number;
  readonly portId: string;
  readonly direction: 'input' | 'output';
  readonly onDragStart: (portId: string, e: React.MouseEvent) => void;
  readonly onMouseUp: (portId: string) => void;
}

function PortCircle({ cx, cy, portId, direction, onDragStart, onMouseUp }: PortCircleProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={hovered ? 7 : 5}
      fill={hovered ? '#60a5fa' : '#1e293b'}
      stroke={direction === 'input' ? '#22c55e' : '#f59e0b'}
      strokeWidth={2}
      style={{ cursor: 'crosshair', transition: 'r 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => { e.stopPropagation(); onDragStart(portId, e); }}
      onMouseUp={e => { e.stopPropagation(); onMouseUp(portId); }}
    />
  );
}

// ---------------------------------------------------------------------------
// CanvasNode Props
// ---------------------------------------------------------------------------

interface CanvasNodeProps {
  readonly node: WorkflowNode;
  readonly selected: boolean;
  readonly executionStatus?: NodeExecutionStatus;
  readonly onSelect: () => void;
  readonly onDragEnd: (e: React.MouseEvent) => void;
  readonly onPortDragStart: (portId: string, e: React.MouseEvent) => void;
  readonly onPortMouseUp?: (portId: string) => void;
}

// ---------------------------------------------------------------------------
// CanvasNode
// ---------------------------------------------------------------------------

export function CanvasNode({
  node, selected, executionStatus = 'idle',
  onSelect, onDragEnd, onPortDragStart, onPortMouseUp,
}: CanvasNodeProps): React.ReactElement {
  const { x, y, width, height, type, label, ports } = node;
  const headerH = 28;
  const headerColor = getHeaderColor(type);
  const statusColor = STATUS_RING[executionStatus] ?? 'transparent';

  const inputPorts = ports.filter(p => p.direction === 'input');
  const outputPorts = ports.filter(p => p.direction === 'output');

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDragEnd(e); // triggers drag in parent
    onSelect();
  }, [onDragEnd, onSelect]);

  const handlePortMouseUp = useCallback((portId: string) => {
    onPortMouseUp?.(portId);
  }, [onPortMouseUp]);

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
      role="button"
      aria-label={`Node: ${label}`}
      aria-selected={selected}
    >
      {/* Selection / status ring */}
      <rect
        x={-3}
        y={-3}
        width={width + 6}
        height={height + 6}
        rx={10}
        ry={10}
        fill="none"
        stroke={selected ? '#60a5fa' : statusColor}
        strokeWidth={selected ? 2.5 : 2}
        opacity={selected || executionStatus !== 'idle' ? 1 : 0}
      />

      {/* Running pulse ring */}
      {executionStatus === 'running' && (
        <rect
          x={-6}
          y={-6}
          width={width + 12}
          height={height + 12}
          rx={13}
          ry={13}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          opacity={0.4}
        >
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="2;4;2" dur="1.2s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Body */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill="var(--node-bg, #1e293b)"
        stroke="var(--node-border, #334155)"
        strokeWidth={1}
      />

      {/* Header bar */}
      <rect
        x={0}
        y={0}
        width={width}
        height={headerH}
        rx={8}
        ry={8}
        fill={headerColor}
        clipPath={`url(#node-header-clip-${node.id})`}
      />
      {/* Clip so header only rounds top corners */}
      <defs>
        <clipPath id={`node-header-clip-${node.id}`}>
          <rect x={0} y={0} width={width} height={headerH} />
        </clipPath>
      </defs>
      {/* Bottom of header sharp */}
      <rect x={0} y={headerH / 2} width={width} height={headerH / 2} fill={headerColor} />

      {/* Icon placeholder */}
      <text x={10} y={headerH - 8} fontSize={12} fill="#fff" opacity={0.9} style={{ userSelect: 'none', pointerEvents: 'none' }}>
        ⬡
      </text>

      {/* Node type label in header */}
      <text x={width / 2} y={headerH - 8} textAnchor="middle" fontSize={11} fill="#fff" fontWeight="600" style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {type.toUpperCase()}
      </text>

      {/* Node label in body */}
      <text x={width / 2} y={headerH + (height - headerH) / 2 + 5} textAnchor="middle" fontSize={12} fill="var(--text-primary, #e2e8f0)" style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {label.length > 20 ? label.slice(0, 18) + '…' : label}
      </text>

      {/* Input ports — left side */}
      {inputPorts.map((port, i) => {
        const cy = headerH + ((height - headerH) / (inputPorts.length + 1)) * (i + 1);
        return (
          <PortCircle
            key={port.id}
            cx={0}
            cy={cy}
            portId={port.id}
            direction="input"
            onDragStart={onPortDragStart}
            onMouseUp={handlePortMouseUp}
          />
        );
      })}

      {/* Output ports — right side */}
      {outputPorts.map((port, i) => {
        const cy = headerH + ((height - headerH) / (outputPorts.length + 1)) * (i + 1);
        return (
          <PortCircle
            key={port.id}
            cx={width}
            cy={cy}
            portId={port.id}
            direction="output"
            onDragStart={onPortDragStart}
            onMouseUp={handlePortMouseUp}
          />
        );
      })}
    </g>
  );
}
