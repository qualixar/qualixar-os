/**
 * Qualixar OS Phase 21 — LoopProperties Panel
 * Configuration form for Loop nodes: maxIterations, breakCondition.
 */

import React from 'react';

interface LoopPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

const MIN_ITER = 1;
const MAX_ITER = 50;

export function LoopProperties({ config, onChange }: LoopPropertiesProps): React.ReactElement {
  const maxIterations = typeof config['maxIterations'] === 'number'
    ? config['maxIterations']
    : 10;
  const breakCondition = typeof config['breakCondition'] === 'string'
    ? config['breakCondition']
    : '';

  function handleMaxIter(raw: string): void {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(Math.max(parsed, MIN_ITER), MAX_ITER);
      onChange('maxIterations', clamped);
    }
  }

  return (
    <div className="properties-panel">
      <div className="settings-row">
        <label className="settings-label">
          Max Iterations
          <span className="properties-hint"> (1–50)</span>
        </label>
        <input
          className="settings-input settings-input--narrow"
          type="number"
          min={MIN_ITER}
          max={MAX_ITER}
          value={maxIterations}
          onChange={(e) => handleMaxIter(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <label className="settings-label">Break Condition</label>
        <input
          className="settings-input settings-input--mono"
          type="text"
          value={breakCondition}
          placeholder='e.g. result.done === true'
          onChange={(e) => onChange('breakCondition', e.target.value)}
        />
        <span className="properties-hint">
          Leave empty to always run to max iterations.
        </span>
      </div>
    </div>
  );
}
