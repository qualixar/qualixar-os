// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS useTheme Hook
 * Source: research/phase14/05-ui-ux-design-system-research.md Section 5.2
 *
 * Three-state theme: system | light | dark.
 * Persists to localStorage. Listens to OS preference changes.
 * Classes 'light' or 'dark' applied to <html> for CSS variable switching.
 */

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export function useTheme(): { readonly theme: Theme; readonly setTheme: (next: Theme) => void; readonly resolvedTheme: 'light' | 'dark' } {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('qos-theme') as Theme) ?? 'system';
    } catch {
      return 'system';
    }
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      root.classList.remove('light', 'dark');
      if (theme === 'system') {
        root.classList.add(mq.matches ? 'dark' : 'light');
        try { localStorage.removeItem('qos-theme'); } catch { /* */ }
      } else {
        root.classList.add(theme);
        try { localStorage.setItem('qos-theme', theme); } catch { /* */ }
      }
    };

    apply();

    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const resolvedTheme = (() => {
    if (theme !== 'system') return theme;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  })();

  return { theme, setTheme, resolvedTheme } as const;
}
