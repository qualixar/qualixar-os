// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Motion 12 Animation Presets
 * Source: research/phase14/05-ui-ux-design-system-research.md Section 9
 *
 * Spring configs, page/tab/stagger variants, micro-interactions.
 * Import from 'motion/react' (NOT 'framer-motion' — renamed in 2025).
 */

import type { Transition, Variants } from 'motion/react';

// ---------------------------------------------------------------------------
// Spring Presets
// ---------------------------------------------------------------------------

/** Snappy UI interactions (buttons, toggles) */
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 30 };

/** Standard page/card animations */
export const springGentle: Transition = { type: 'spring', stiffness: 300, damping: 25 };

/** Slow, dramatic entrances (hero, modals) */
export const springSlow: Transition = { type: 'spring', stiffness: 200, damping: 20 };

/** Bouncy feedback (success, notifications) */
export const springBouncy: Transition = { type: 'spring', stiffness: 400, damping: 15 };

// ---------------------------------------------------------------------------
// Page Transition Variants
// ---------------------------------------------------------------------------

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

// ---------------------------------------------------------------------------
// Tab Content Variants
// ---------------------------------------------------------------------------

export const tabContent: Variants = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};

// ---------------------------------------------------------------------------
// Stagger Container + Item
// ---------------------------------------------------------------------------

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

// ---------------------------------------------------------------------------
// Scale-Fade (badges, tooltips, popovers)
// ---------------------------------------------------------------------------

export const scaleFade: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

// ---------------------------------------------------------------------------
// Slide-Over (sidebars, panels)
// ---------------------------------------------------------------------------

export const slideOver: Variants = {
  initial: { x: '-100%' },
  animate: { x: 0 },
  exit: { x: '-100%' },
};

// ---------------------------------------------------------------------------
// Modal Variants
// ---------------------------------------------------------------------------

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
};

// ---------------------------------------------------------------------------
// Micro-Interactions
// ---------------------------------------------------------------------------

export const microInteractions = {
  tap: { scale: 0.97 },
  hover: { scale: 1.02 },
  hoverLift: { scale: 1.02, y: -2 },
  hoverGlow: { scale: 1.02, boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)' },
} as const;
