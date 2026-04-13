/**
 * Qualixar OS Phase 21 — ConditionNode Renderer
 * Renders the inner content of a Condition node on the workflow canvas.
 * Shows git-branch icon, condition expression preview, and diamond indicator.
 */

import React from 'react';
import { GitBranch } from 'lucide-react';

interface ConditionNodeProps {
  readonly config: Record<string, unknown>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function ConditionNode({ config }: ConditionNodeProps): React.ReactElement {
  const expression = typeof config['expression'] === 'string' ? config['expression'] : '';
  const trueLabel = typeof config['trueBranchLabel'] === 'string' ? config['trueBranchLabel'] : 'True';
  const falseLabel = typeof config['falseBranchLabel'] === 'string' ? config['falseBranchLabel'] : 'False';

  return (
    <div className="node-inner node-inner--condition">
      <div className="node-icon-row">
        <span className="node-icon node-icon--purple">
          <GitBranch size={16} />
        </span>
        <span className="node-type-label">Condition</span>
        <span className="node-diamond" aria-hidden="true">◆</span>
      </div>

      {expression ? (
        <div className="node-preview">
          <span className="node-preview-label">Expression</span>
          <code className="node-preview-code">{truncate(expression, 60)}</code>
        </div>
      ) : (
        <div className="node-empty-hint">No expression configured</div>
      )}

      <div className="node-branches-row">
        <span className="node-branch node-branch--true">{trueLabel}</span>
        <span className="node-branch node-branch--false">{falseLabel}</span>
      </div>
    </div>
  );
}
