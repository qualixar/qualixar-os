/**
 * Qualixar OS Phase 21 — LoopNode Renderer
 * Renders the inner content of a Loop node on the workflow canvas.
 * Shows repeat icon, max iterations badge, and break condition preview.
 */

import React from 'react';
import { Repeat } from 'lucide-react';

interface LoopNodeProps {
  readonly config: Record<string, unknown>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function LoopNode({ config }: LoopNodeProps): React.ReactElement {
  const maxIter = typeof config['maxIterations'] === 'number' ? config['maxIterations'] : null;
  const breakCond = typeof config['breakCondition'] === 'string' ? config['breakCondition'] : '';

  return (
    <div className="node-inner node-inner--loop">
      <div className="node-icon-row">
        <span className="node-icon node-icon--teal">
          <Repeat size={16} />
        </span>
        <span className="node-type-label">Loop</span>
        {maxIter !== null && (
          <span className="node-badge node-badge--iter">max {maxIter}×</span>
        )}
      </div>

      {breakCond ? (
        <div className="node-preview">
          <span className="node-preview-label">Break when</span>
          <code className="node-preview-code">{truncate(breakCond, 60)}</code>
        </div>
      ) : (
        <div className="node-empty-hint">No break condition</div>
      )}
    </div>
  );
}
