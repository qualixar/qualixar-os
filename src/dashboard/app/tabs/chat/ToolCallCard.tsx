/**
 * Qualixar OS Phase 14 -- ToolCallCard
 * Collapsible display for tool calls within assistant messages.
 * Amber=calling, green=completed, red=error, slate=pending.
 */

import React, { useState, useCallback } from 'react';
import type { ToolCallData } from '../../store.js';

interface ToolCallCardProps {
  readonly call: ToolCallData;
}

const STATUS_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  pending: { border: 'var(--text-muted)', bg: 'var(--bg-tertiary)', label: 'var(--text-secondary)' },
  calling: { border: 'var(--warning)', bg: 'var(--warning-soft)', label: 'var(--warning)' },
  completed: { border: 'var(--success)', bg: 'var(--success-soft)', label: 'var(--success)' },
  error: { border: 'var(--danger)', bg: 'var(--danger-soft)', label: 'var(--danger)' },
};

export function ToolCallCard({ call }: ToolCallCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const colors = STATUS_COLORS[call.status] ?? STATUS_COLORS.pending;
  const durationLabel = call.durationMs != null ? ` ${call.durationMs}ms` : '';

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: 6,
      marginTop: 4,
      overflow: 'hidden',
      backgroundColor: colors.bg,
    }}>
      <button
        onClick={toggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          color: colors.label,
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          &#9654;
        </span>
        <span style={{ fontWeight: 600 }}>{call.displayName || call.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
          {call.status}{durationLabel}
        </span>
      </button>
      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '8px 12px' }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Input:</span>
            <pre style={{ margin: '2px 0 0', color: 'var(--text-primary)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {call.output != null && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Output:</span>
              <pre style={{ margin: '2px 0 0', color: 'var(--text-primary)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                {call.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
