/**
 * Qualixar OS Phase 21 — MergeNode Renderer
 * Renders the inner content of a Merge node on the workflow canvas.
 * Shows merge icon and merge strategy badge.
 */

import React from 'react';
import { Merge } from 'lucide-react';

interface MergeNodeProps {
  readonly config: Record<string, unknown>;
}

const STRATEGY_LABELS: Record<string, string> = {
  concatenate: 'Concat',
  first: 'First',
  best: 'Best',
  json_array: 'JSON Array',
};

export function MergeNode({ config }: MergeNodeProps): React.ReactElement {
  const strategy = typeof config['mergeStrategy'] === 'string' ? config['mergeStrategy'] : 'first';
  const strategyLabel = STRATEGY_LABELS[strategy] ?? strategy;
  const inputCount = typeof config['inputCount'] === 'number' ? config['inputCount'] : null;

  return (
    <div className="node-inner node-inner--merge">
      <div className="node-icon-row">
        <span className="node-icon node-icon--indigo">
          <Merge size={16} />
        </span>
        <span className="node-type-label">Merge</span>
      </div>

      <div className="node-badges-row">
        <span className="node-badge node-badge--strategy">{strategyLabel}</span>
        {inputCount !== null && (
          <span className="node-badge node-badge--count">{inputCount} inputs</span>
        )}
      </div>
    </div>
  );
}
