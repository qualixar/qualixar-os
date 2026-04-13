// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: Elastic-2.0
/**
 * SuperLocalMemory branding component for dashboard tabs.
 * Displays a brain/memory icon + "Powered by SuperLocalMemory" with
 * links to GitHub and npm. Works in both light and dark themes.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// SuperLocalMemory Icon — brain-style memory icon (distinct from Qualixar logo)
// ---------------------------------------------------------------------------

function SLMIcon({ size = 28 }: { readonly size?: number }): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      width={size}
      height={size}
      aria-label="SuperLocalMemory"
    >
      {/* Brain outline */}
      <path
        d="M24 6C16 6 10 12 10 19c0 4 2 7.5 5 10l1 1v6a2 2 0 002 2h12a2 2 0 002-2v-6l1-1c3-2.5 5-6 5-10 0-7-6-13-14-13z"
        stroke="#8B5CF6"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Neural connections */}
      <path d="M18 20c2-2 4-2 6 0s4 2 6 0" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M18 26c2-2 4-2 6 0s4 2 6 0" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.5" />
      {/* Memory layers (dots) */}
      <circle cx="17" cy="16" r="1.5" fill="#8B5CF6" opacity="0.6" />
      <circle cx="24" cy="14" r="1.5" fill="#8B5CF6" opacity="0.8" />
      <circle cx="31" cy="16" r="1.5" fill="#8B5CF6" opacity="0.6" />
      <circle cx="24" cy="32" r="1.5" fill="#8B5CF6" opacity="0.4" />
      {/* Base pins */}
      <line x1="18" y1="38" x2="18" y2="42" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="38" x2="24" y2="44" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="38" x2="30" y2="42" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SLM Brand Banner — reusable across Memory and Settings tabs
// ---------------------------------------------------------------------------

const GITHUB_URL = 'https://github.com/qualixar/superlocalmemory';
const NPM_URL = 'https://www.npmjs.com/package/superlocalmemory';

interface SLMBrandProps {
  /** 'banner' = full-width hero, 'inline' = compact single-line */
  readonly variant?: 'banner' | 'inline';
}

const linkStyle: React.CSSProperties = {
  color: '#8B5CF6',
  textDecoration: 'none',
  fontWeight: 500,
};

export function SLMBrand({ variant = 'banner' }: SLMBrandProps): React.ReactElement {
  if (variant === 'inline') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', opacity: 0.7 }}>
        <SLMIcon size={16} />
        <span>Powered by{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            SuperLocalMemory
          </a>{' '}(Lite)
        </span>
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        borderRadius: 12,
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        marginBottom: 16,
      }}
    >
      <SLMIcon size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
          Powered by SuperLocalMemory <span style={{ fontWeight: 400, opacity: 0.6, fontSize: '0.85em' }}>(Lite)</span>
        </div>
        <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 3 }}>
          Cognitive memory engine &middot; 4-layer retrieval &middot; local-first &middot;{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            GitHub
          </a>
          {' '}&middot;{' '}
          <a href={NPM_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            npm
          </a>
        </div>
      </div>
    </div>
  );
}
