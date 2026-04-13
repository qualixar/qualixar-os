/**
 * Qualixar OS ThemeToggle Component
 * Three-state toggle: System / Light / Dark
 * Uses useTheme hook for persistence + OS preference detection.
 */

import React, { useCallback } from 'react';
import { useTheme, type Theme } from '../hooks/useTheme.js';

const THEMES: readonly { readonly value: Theme; readonly label: string; readonly icon: string }[] = [
  { value: 'system', label: 'Auto', icon: '💻' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
];

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useTheme();

  const handleClick = useCallback((value: Theme) => {
    setTheme(value);
  }, [setTheme]);

  return (
    <div style={{
      display: 'flex',
      gap: 2,
      padding: 3,
      borderRadius: 'var(--radius-full)',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-glass)',
    }}>
      {THEMES.map((t) => {
        const isActive = theme === t.value;
        return (
          <button
            key={t.value}
            onClick={() => handleClick(t.value)}
            title={`${t.label} theme`}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 150ms cubic-bezier(0.25, 1, 0.5, 1)',
              boxShadow: isActive ? '0 2px 8px var(--accent-glow)' : 'none',
            }}
          >
            <span style={{ fontSize: 11 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
