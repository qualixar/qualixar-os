/**
 * Qualixar OS Phase 21 — StartNode Renderer
 * Renders the inner content of a Start node on the workflow canvas.
 * Shows a green play icon and prompt template preview if configured.
 */

import React from 'react';
import { Play } from 'lucide-react';

interface StartNodeProps {
  readonly config: Record<string, unknown>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function StartNode({ config }: StartNodeProps): React.ReactElement {
  const prompt = typeof config['promptTemplate'] === 'string' ? config['promptTemplate'] : '';
  const label = typeof config['label'] === 'string' ? config['label'] : 'Start';

  return (
    <div className="node-inner node-inner--start">
      <div className="node-icon-row">
        <span className="node-icon node-icon--green">
          <Play size={16} />
        </span>
        <span className="node-type-label">{label}</span>
      </div>

      {prompt ? (
        <div className="node-preview">
          <span className="node-preview-label">Prompt template</span>
          <span className="node-preview-text">{truncate(prompt, 72)}</span>
        </div>
      ) : (
        <div className="node-empty-hint">No prompt template configured</div>
      )}
    </div>
  );
}
