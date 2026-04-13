/**
 * Qualixar OS Phase 21 — ToolNode Renderer
 * Renders the inner content of a Tool node on the workflow canvas.
 * Shows wrench icon, tool name, and parameter count.
 */

import React from 'react';
import { Wrench } from 'lucide-react';

interface ToolNodeProps {
  readonly config: Record<string, unknown>;
}

function countParams(config: Record<string, unknown>): number {
  const params = config['parameters'];
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    return Object.keys(params as Record<string, unknown>).length;
  }
  return 0;
}

export function ToolNode({ config }: ToolNodeProps): React.ReactElement {
  const toolName = typeof config['toolName'] === 'string' ? config['toolName'] : 'Unnamed Tool';
  const paramCount = countParams(config);

  return (
    <div className="node-inner node-inner--tool">
      <div className="node-icon-row">
        <span className="node-icon node-icon--orange">
          <Wrench size={16} />
        </span>
        <span className="node-type-label">{toolName}</span>
      </div>

      <div className="node-badges-row">
        <span className="node-badge node-badge--count">
          {paramCount} {paramCount === 1 ? 'param' : 'params'}
        </span>
      </div>
    </div>
  );
}
