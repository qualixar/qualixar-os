/**
 * Qualixar OS Phase 7 -- bin/qos.js Tests
 *
 * Validates the entry point script structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BIN_PATH = resolve(
  import.meta.dirname ?? '.',
  '../../bin/qos.js',
);

describe('bin/qos.js', () => {
  it('exists and is readable', () => {
    const content = readFileSync(BIN_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('has shebang line', () => {
    const content = readFileSync(BIN_PATH, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('imports from dist/channels/cli.js', () => {
    const content = readFileSync(BIN_PATH, 'utf-8');
    expect(content).toContain('../dist/channels/cli.js');
  });

  it('is a valid JavaScript/ESM file', () => {
    const content = readFileSync(BIN_PATH, 'utf-8');
    // Should use dynamic import (ESM)
    expect(content).toContain('import(');
  });
});
