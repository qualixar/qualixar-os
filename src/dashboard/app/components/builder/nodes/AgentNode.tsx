/**
 * Qualixar OS Phase 21 — AgentNode Renderer
 * Renders the inner content of an Agent node on the workflow canvas.
 * Shows bot icon, model badge, tool count, and role name.
 */

import React from 'react';
import { Bot } from 'lucide-react';

interface AgentNodeProps {
  readonly config: Record<string, unknown>;
}

export function AgentNode({ config }: AgentNodeProps): React.ReactElement {
  const model = typeof config['model'] === 'string' ? config['model'] : 'default';
  const role = typeof config['role'] === 'string' ? config['role'] : 'Agent';
  const tools = Array.isArray(config['tools']) ? (config['tools'] as unknown[]).length : 0;

  const shortModel = model.length > 22 ? model.slice(0, 22) + '…' : model;

  return (
    <div className="node-inner node-inner--agent">
      <div className="node-icon-row">
        <span className="node-icon node-icon--blue">
          <Bot size={16} />
        </span>
        <span className="node-type-label">{role}</span>
      </div>

      <div className="node-badges-row">
        <span className="node-badge node-badge--model" title={model}>
          {shortModel}
        </span>
        <span className="node-badge node-badge--count">
          {tools} {tools === 1 ? 'tool' : 'tools'}
        </span>
      </div>
    </div>
  );
}
