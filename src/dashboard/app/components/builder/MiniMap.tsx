/**
 * Qualixar OS Phase 21 — MiniMap
 * Small overview panel (bottom-right corner) showing scaled-down node rectangles.
 * Highlights the current viewport area. Click to jump viewport.
 */

import React, { useCallback, useRef } from 'react';
import type { WorkflowNode, Viewport } from '../../tabs/BuilderTab.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MiniMapProps {
  readonly nodes: readonly WorkflowNode[];
  readonly viewport: Viewport;
  readonly canvasSize: { width: number; height: number };
  readonly onViewportChange: (vp: Viewport) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAP_W = 160;
const MAP_H = 110;
const PADDING = 12;

// ---------------------------------------------------------------------------
// MiniMap
// ---------------------------------------------------------------------------

export function MiniMap({ nodes, viewport, canvasSize, onViewportChange }: MiniMapProps): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);

  // Scale factor from canvas world space to minimap space
  const scaleX = MAP_W / canvasSize.width;
  const scaleY = MAP_H / canvasSize.height;

  // Viewport rect in world space
  // The SVG canvas is (size.w x size.h) in screen space.
  // world_x = (screen_x - offsetX) / zoom
  // viewport_width_world = screen_w / zoom (approx — use 800 as default view width)
  const viewW = 800; // approximate visible screen width
  const viewH = 600; // approximate visible screen height
  const vpWorldX = -viewport.offsetX / viewport.zoom;
  const vpWorldY = -viewport.offsetY / viewport.zoom;
  const vpWorldW = viewW / viewport.zoom;
  const vpWorldH = viewH / viewport.zoom;

  // Viewport rect in minimap coords
  const vpMapX = vpWorldX * scaleX;
  const vpMapY = vpWorldY * scaleY;
  const vpMapW = vpWorldW * scaleX;
  const vpMapH = vpWorldH * scaleY;

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mapX = e.clientX - rect.left;
    const mapY = e.clientY - rect.top;

    // Convert minimap click → world center → new viewport offset
    const worldX = mapX / scaleX;
    const worldY = mapY / scaleY;

    // Center the viewport on this world point
    const newOffsetX = -(worldX * viewport.zoom) + viewW / 2;
    const newOffsetY = -(worldY * viewport.zoom) + viewH / 2;

    onViewportChange({ ...viewport, offsetX: newOffsetX, offsetY: newOffsetY });
  }, [viewport, scaleX, scaleY, onViewportChange]);

  if (nodes.length === 0) return <></>;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: PADDING,
        right: PADDING,
        background: 'var(--minimap-bg, rgba(15,23,42,0.92))',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        cursor: 'crosshair',
      }}
      title="Mini-map — click to jump"
      aria-label="Workflow mini-map"
      role="navigation"
    >
      <div style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #475569)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-color, #1e293b)' }}>
        Map
      </div>
      <svg
        ref={svgRef}
        width={MAP_W}
        height={MAP_H}
        onClick={handleClick}
        style={{ display: 'block' }}
      >
        {/* Grid dots */}
        <rect width={MAP_W} height={MAP_H} fill="#0f172a" />

        {/* Nodes */}
        {nodes.map(node => (
          <rect
            key={node.id}
            x={node.x * scaleX}
            y={node.y * scaleY}
            width={Math.max(4, node.width * scaleX)}
            height={Math.max(3, node.height * scaleY)}
            rx={2}
            fill="#334155"
            stroke="#475569"
            strokeWidth={0.5}
          />
        ))}

        {/* Viewport indicator */}
        <rect
          x={Math.max(0, vpMapX)}
          y={Math.max(0, vpMapY)}
          width={Math.min(MAP_W, vpMapW)}
          height={Math.min(MAP_H, vpMapH)}
          fill="#3b82f633"
          stroke="#60a5fa"
          strokeWidth={1}
          rx={2}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
