/**
 * Qualixar OS Phase 21 — OutputNode Renderer
 * Renders the inner content of an Output node on the workflow canvas.
 * Shows flag icon and output format badge (text / json / markdown).
 */

import React from 'react';
import { Flag } from 'lucide-react';

interface OutputNodeProps {
  readonly config: Record<string, unknown>;
}

const FORMAT_COLORS: Record<string, string> = {
  text: 'node-badge--format-text',
  json: 'node-badge--format-json',
  markdown: 'node-badge--format-md',
};

export function OutputNode({ config }: OutputNodeProps): React.ReactElement {
  const format = typeof config['outputFormat'] === 'string' ? config['outputFormat'] : 'text';
  const label = typeof config['label'] === 'string' ? config['label'] : 'Output';
  const colorClass = FORMAT_COLORS[format] ?? 'node-badge--format-text';

  return (
    <div className="node-inner node-inner--output">
      <div className="node-icon-row">
        <span className="node-icon node-icon--red">
          <Flag size={16} />
        </span>
        <span className="node-type-label">{label}</span>
      </div>

      <div className="node-badges-row">
        <span className={`node-badge ${colorClass}`}>
          {format}
        </span>
      </div>
    </div>
  );
}
