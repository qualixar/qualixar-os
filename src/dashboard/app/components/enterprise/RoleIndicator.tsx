/**
 * Qualixar OS Phase 22 Enterprise — RoleIndicator
 * Colored pill badge showing the current user's role in the dashboard header.
 * Roles: admin (red), developer (blue), viewer (gray)
 */

import React from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../../lib/motion-presets.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleIndicatorProps {
  readonly role: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_STYLES: Record<string, { bg: string; fg: string; border: string; icon: string }> = {
  admin:     { bg: 'rgba(239,68,68,0.18)',   fg: '#ef4444', border: 'rgba(239,68,68,0.4)',   icon: '⬡' },
  developer: { bg: 'rgba(59,130,246,0.18)',  fg: '#3b82f6', border: 'rgba(59,130,246,0.4)',  icon: '◈' },
  viewer:    { bg: 'rgba(107,114,128,0.18)', fg: '#9ca3af', border: 'rgba(107,114,128,0.4)', icon: '◎' },
};

const DEFAULT_STYLE = { bg: 'rgba(107,114,128,0.18)', fg: '#9ca3af', border: 'rgba(107,114,128,0.4)', icon: '◎' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleIndicator({ role }: RoleIndicatorProps): React.ReactElement {
  const normalized = role.toLowerCase();
  const style = ROLE_STYLES[normalized] ?? DEFAULT_STYLE;
  const label = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

  return (
    <motion.span
      className="role-indicator"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
        backdropFilter: 'blur(6px)',
        userSelect: 'none',
      }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springSnappy}
      title={`Current role: ${label}`}
    >
      <span style={{ fontSize: '0.65rem' }}>{style.icon}</span>
      {label}
    </motion.span>
  );
}
