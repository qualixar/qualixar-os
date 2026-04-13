/**
 * Qualixar OS Phase 21 — HumanApprovalNode Renderer
 * Renders the inner content of a HumanApproval node on the workflow canvas.
 * Shows pause icon, approval message preview, and timeout value.
 */

import React from 'react';
import { Hand } from 'lucide-react';

interface HumanApprovalNodeProps {
  readonly config: Record<string, unknown>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function HumanApprovalNode({ config }: HumanApprovalNodeProps): React.ReactElement {
  const message = typeof config['approvalMessage'] === 'string' ? config['approvalMessage'] : '';
  const timeoutSec = typeof config['timeoutSeconds'] === 'number' ? config['timeoutSeconds'] : null;

  return (
    <div className="node-inner node-inner--approval">
      <div className="node-icon-row">
        <span className="node-icon node-icon--yellow">
          <Hand size={16} />
        </span>
        <span className="node-type-label">Human Approval</span>
      </div>

      {message ? (
        <div className="node-preview">
          <span className="node-preview-label">Message</span>
          <span className="node-preview-text">{truncate(message, 64)}</span>
        </div>
      ) : (
        <div className="node-empty-hint">No approval message</div>
      )}

      {timeoutSec !== null && (
        <div className="node-badges-row">
          <span className="node-badge node-badge--timeout">
            Timeout: {timeoutSec}s
          </span>
        </div>
      )}
    </div>
  );
}
