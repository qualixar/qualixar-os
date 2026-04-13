/**
 * Qualixar OS Phase 14 -- ThinkingBlock
 * Collapsible reasoning/thinking display for assistant messages.
 * Collapsed by default, muted grey styling.
 */

import React, { useState, useCallback } from 'react';

interface ThinkingBlockProps {
  readonly text: string;
  readonly durationMs?: number;
}

export function ThinkingBlock({ text, durationMs }: ThinkingBlockProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const durationLabel = durationMs != null ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';

  return (
    <div style={{
      border: '1px solid var(--border-glass)',
      borderRadius: 6,
      marginTop: 4,
      overflow: 'hidden',
      backgroundColor: 'var(--bg-tertiary)',
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
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          &#9654;
        </span>
        <span>Thinking{durationLabel}</span>
      </button>
      {expanded && (
        <pre style={{
          padding: '8px 12px',
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          borderTop: '1px solid var(--border-glass)',
        }}>
          {text}
        </pre>
      )}
    </div>
  );
}
