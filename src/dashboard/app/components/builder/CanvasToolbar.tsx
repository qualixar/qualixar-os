/**
 * Qualixar OS Phase 21 — Canvas Toolbar
 * Top toolbar: zoom, fit, undo/redo, run, save, export, import.
 */

import React, { useCallback } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasToolbarProps {
  readonly zoom: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isRunning: boolean;
  readonly onZoomChange: (zoom: number) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onRun: () => void;
  readonly onSave: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
}

// ---------------------------------------------------------------------------
// CanvasToolbar
// ---------------------------------------------------------------------------

export function CanvasToolbar({
  zoom, canUndo, canRedo, isRunning,
  onZoomChange, onUndo, onRedo, onRun, onSave, onExport, onImport,
}: CanvasToolbarProps): React.ReactElement {

  const handleZoomInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onZoomChange(Number(e.target.value));
  }, [onZoomChange]);

  const handleFit = useCallback(() => {
    // Emit 1:1 zoom reset — parent can implement fit-to-content if desired
    onZoomChange(1);
  }, [onZoomChange]);

  return (
    <div style={toolbarStyle} role="toolbar" aria-label="Canvas toolbar">
      {/* Zoom controls */}
      <div style={groupStyle}>
        <button
          onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
          style={iconBtnStyle}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>

        <input
          type="range"
          min={0.25}
          max={3.0}
          step={0.05}
          value={zoom}
          onChange={handleZoomInput}
          style={{ width: 80, cursor: 'pointer', accentColor: '#60a5fa' }}
          aria-label="Zoom level"
          title={`Zoom: ${Math.round(zoom * 100)}%`}
        />

        <button
          onClick={() => onZoomChange(Math.min(3.0, zoom + 0.1))}
          style={iconBtnStyle}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>

        <span style={zoomLabelStyle} aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>
          {Math.round(zoom * 100)}%
        </span>

        <button onClick={handleFit} style={btnStyle} title="Reset zoom to 100%" aria-label="Fit to canvas">
          ⊡ Fit
        </button>
      </div>

      <Separator />

      {/* Undo / Redo */}
      <div style={groupStyle}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{ ...iconBtnStyle, opacity: canUndo ? 1 : 0.35 }}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          aria-disabled={!canUndo}
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{ ...iconBtnStyle, opacity: canRedo ? 1 : 0.35 }}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          aria-disabled={!canRedo}
        >
          ↪
        </button>
      </div>

      <Separator />

      {/* IO actions */}
      <div style={groupStyle}>
        <button onClick={onImport} style={btnStyle} title="Import workflow JSON" aria-label="Import workflow">
          ⬆ Import
        </button>
        <button onClick={onExport} style={btnStyle} title="Export workflow as JSON" aria-label="Export workflow">
          ⬇ Export
        </button>
      </div>

      <Separator />

      {/* Save */}
      <button onClick={onSave} style={{ ...btnStyle, ...saveStyle }} title="Save workflow" aria-label="Save workflow">
        💾 Save
      </button>

      {/* Run */}
      <button
        onClick={onRun}
        disabled={isRunning}
        style={{ ...btnStyle, ...runStyle, opacity: isRunning ? 0.6 : 1 }}
        title={isRunning ? 'Workflow is running…' : 'Run workflow'}
        aria-label={isRunning ? 'Workflow running' : 'Run workflow'}
        aria-busy={isRunning}
      >
        {isRunning ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Running…
          </>
        ) : (
          '▶ Run'
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function Separator(): React.ReactElement {
  return <div style={{ width: 1, height: 20, background: 'var(--border-color, #4a5568)', margin: '0 4px' }} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-color, #2d3748)',
  background: 'var(--card-bg, #1a202c)',
  flexWrap: 'wrap',
};

const groupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const baseBtnStyle: React.CSSProperties = {
  borderRadius: 5,
  border: '1px solid var(--border-color, #4a5568)',
  background: 'var(--input-bg, #2d3748)',
  color: 'var(--text-primary, #e2e8f0)',
  cursor: 'pointer',
  fontSize: 12,
  transition: 'background 0.15s, opacity 0.15s',
};

const iconBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  padding: '3px 7px',
  fontSize: 14,
  lineHeight: 1,
};

const btnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  padding: '4px 10px',
};

const saveStyle: React.CSSProperties = {
  borderColor: '#3b82f6',
  color: '#93c5fd',
};

const runStyle: React.CSSProperties = {
  background: '#166534',
  borderColor: '#22c55e',
  color: '#86efac',
  fontWeight: 600,
};

const zoomLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted, #718096)',
  minWidth: 34,
  textAlign: 'right',
};
