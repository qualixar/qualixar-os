/**
 * Qualixar OS Phase 21 — ConditionProperties Panel
 * Configuration form for Condition nodes: expression, true/false branch labels.
 */

import React from 'react';

interface ConditionPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

export function ConditionProperties({ config, onChange }: ConditionPropertiesProps): React.ReactElement {
  const expression = typeof config['expression'] === 'string' ? config['expression'] : '';
  const trueLabel = typeof config['trueBranchLabel'] === 'string' ? config['trueBranchLabel'] : 'True';
  const falseLabel = typeof config['falseBranchLabel'] === 'string' ? config['falseBranchLabel'] : 'False';

  return (
    <div className="properties-panel">
      <div className="settings-row">
        <label className="settings-label">Condition Expression</label>
        <input
          className="settings-input settings-input--mono"
          type="text"
          value={expression}
          placeholder='e.g. output.score > 0.8'
          onChange={(e) => onChange('expression', e.target.value)}
        />
        <span className="properties-hint">
          Reference workflow variables with dot notation: <code>output.field</code>
        </span>
      </div>

      <div className="settings-row">
        <label className="settings-label">True Branch Label</label>
        <input
          className="settings-input"
          type="text"
          value={trueLabel}
          placeholder="True"
          onChange={(e) => onChange('trueBranchLabel', e.target.value)}
        />
      </div>

      <div className="settings-row">
        <label className="settings-label">False Branch Label</label>
        <input
          className="settings-input"
          type="text"
          value={falseLabel}
          placeholder="False"
          onChange={(e) => onChange('falseBranchLabel', e.target.value)}
        />
      </div>
    </div>
  );
}
