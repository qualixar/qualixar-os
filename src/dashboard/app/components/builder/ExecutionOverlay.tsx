/**
 * Qualixar OS Phase 21 — Execution Overlay
 * HTML overlay (absolute positioned) that renders status badges over each node
 * during workflow execution. Computed from viewport transform.
 */

import React from 'react';
import type { WorkflowNode, WorkflowExecutionState } from '../../tabs/BuilderTab.js';
import type { NodeExecutionStatus } from '../../tabs/BuilderTab.js';

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

interface StatusStyle {
  readonly bg: string;
  readonly text: string;
  readonly label: string;
  readonly pulse: boolean;
}

const STATUS_STYLES: Record<NodeExecutionStatus, StatusStyle> = {
  idle:     { bg: '#374151', text: '#9ca3af', label: 'Idle',     pulse: false },
  pending:  { bg: '#78350f', text: '#fbbf24', label: 'Pending',  pulse: false },
  running:  { bg: '#1d4ed8', text: '#bfdbfe', label: 'Running',  pulse: true  },
  complete: { bg: '#14532d', text: '#86efac', label: 'Done',     pulse: false },
  error:    { bg: '#7f1d1d', text: '#fca5a5', label: 'Error',    pulse: false },
  skipped:  { bg: '#1f2937', text: '#4b5563', label: 'Skipped',  pulse: false },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExecutionOverlayProps {
  readonly executionState: WorkflowExecutionState;
  readonly nodes: readonly WorkflowNode[];
}

// ---------------------------------------------------------------------------
// ExecutionOverlay
// ---------------------------------------------------------------------------

export function ExecutionOverlay({ executionState, nodes }: ExecutionOverlayProps): React.ReactElement | null {
  if (!executionState.isRunning && Object.keys(executionState.nodeStates).length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-live="polite"
      aria-label="Workflow execution status"
    >
      {nodes.map(node => {
        const status: NodeExecutionStatus = executionState.nodeStates[node.id] ?? 'idle';
        if (status === 'idle') return null;

        const styles = STATUS_STYLES[status];

        return (
          <NodeStatusBadge
            key={node.id}
            node={node}
            status={status}
            styles={styles}
          />
        );
      })}

      {/* Global running indicator */}
      {executionState.isRunning && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 12,
            background: '#1d4ed8',
            border: '1px solid #3b82f6',
            fontSize: 11,
            fontWeight: 600,
            color: '#bfdbfe',
          }}
          role="status"
        >
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 13 }}>⟳</span>
          Executing…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NodeStatusBadge — positioned using the node's world coords
// NOTE: This overlay sits in HTML space, not SVG. Without viewport transform
// access here we use a data-attribute approach: the canvas syncs node screen
// positions via CSS custom properties or we use a simple approach of reading
// node world coords and noting this overlay should be a child of a div that
// has the same viewport transform applied. For simplicity, we render the
// badge in the top-left of each node's world-space bounding box. The parent
// BuilderTab wraps this inside the transformed container.
// ---------------------------------------------------------------------------

interface NodeStatusBadgeProps {
  readonly node: WorkflowNode;
  readonly status: NodeExecutionStatus;
  readonly styles: StatusStyle;
}

function NodeStatusBadge({ node, status, styles }: NodeStatusBadgeProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        // These are world coords — parent applies the viewport transform via CSS
        left: node.x + node.width / 2,
        top: node.y - 18,
        transform: 'translateX(-50%)',
        padding: '2px 8px',
        borderRadius: 10,
        background: styles.bg,
        color: styles.text,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        border: `1px solid ${styles.text}44`,
        boxShadow: styles.pulse ? `0 0 8px ${styles.text}88` : 'none',
        animation: styles.pulse ? 'execPulse 1.2s ease-in-out infinite' : 'none',
      }}
      aria-label={`${node.label}: ${styles.label}`}
    >
      {statusIcon(status)} {styles.label}
    </div>
  );
}

function statusIcon(status: NodeExecutionStatus): string {
  switch (status) {
    case 'pending':  return '⏳';
    case 'running':  return '⟳';
    case 'complete': return '✓';
    case 'error':    return '✕';
    case 'skipped':  return '⤳';
    default:         return '·';
  }
}
