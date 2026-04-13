/**
 * Qualixar OS Phase 21 — Selection Box
 * SVG rectangle drawn during multi-select drag.
 * Dashed blue border, transparent fill.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SelectionBoxProps {
  readonly startPos: { x: number; y: number };
  readonly endPos: { x: number; y: number };
  readonly visible: boolean;
}

// ---------------------------------------------------------------------------
// SelectionBox
// ---------------------------------------------------------------------------

export function SelectionBox({ startPos, endPos, visible }: SelectionBoxProps): React.ReactElement | null {
  if (!visible) return null;

  const x = Math.min(startPos.x, endPos.x);
  const y = Math.min(startPos.y, endPos.y);
  const width = Math.abs(endPos.x - startPos.x);
  const height = Math.abs(endPos.y - startPos.y);

  if (width < 2 && height < 2) return null;

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="rgba(96,165,250,0.07)"
      stroke="#60a5fa"
      strokeWidth={1.5}
      strokeDasharray="6 3"
      rx={3}
      ry={3}
      pointerEvents="none"
      aria-hidden="true"
    />
  );
}
