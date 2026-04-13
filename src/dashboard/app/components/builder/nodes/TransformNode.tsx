/**
 * Qualixar OS Phase 21 — TransformNode Renderer
 * Renders the inner content of a Transform node on the workflow canvas.
 * Shows wand icon, transform type badge, and expression preview.
 */

import React from 'react';
import { Wand2 } from 'lucide-react';

interface TransformNodeProps {
  readonly config: Record<string, unknown>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function TransformNode({ config }: TransformNodeProps): React.ReactElement {
  const transformType = typeof config['transformType'] === 'string' ? config['transformType'] : 'template';
  const expression = typeof config['expression'] === 'string' ? config['expression'] : '';

  return (
    <div className="node-inner node-inner--transform">
      <div className="node-icon-row">
        <span className="node-icon node-icon--pink">
          <Wand2 size={16} />
        </span>
        <span className="node-type-label">Transform</span>
        <span className="node-badge node-badge--type">{transformType}</span>
      </div>

      {expression ? (
        <div className="node-preview">
          <span className="node-preview-label">Expression</span>
          <code className="node-preview-code">{truncate(expression, 60)}</code>
        </div>
      ) : (
        <div className="node-empty-hint">No expression configured</div>
      )}
    </div>
  );
}
