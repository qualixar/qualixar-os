// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 — ID Generation Utility
 * LLD Section 2.9
 *
 * Wraps Node's crypto.randomUUID() for consistent UUID v4 generation
 * across all Qualixar OS components. Zero external dependencies.
 */
import { randomUUID } from 'node:crypto';

/**
 * Generate a cryptographically random UUID v4 string.
 * Format: 8-4-4-4-12 hex characters (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateId(): string {
  return randomUUID();
}
