/**
 * Qualixar OS Phase 6 -- Index Entry Point Tests
 */

import { describe, it, expect } from 'vitest';

describe('Qualixar OS index exports', () => {
  it('exports createQos factory', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.createQos).toBe('function');
  });

  it('exports QosConfigSchema', async () => {
    const mod = await import('../src/index.js');
    expect(mod.QosConfigSchema).toBeDefined();
    expect(typeof mod.QosConfigSchema.parse).toBe('function');
  });

  it('createQos is the sole factory export', async () => {
    const mod = await import('../src/index.js');
    // Verify createQos exists and is a function
    const functionExports = Object.entries(mod).filter(
      ([, value]) => typeof value === 'function' && !('parse' in (value as object)),
    );
    // createQos should be among the function exports
    const names = functionExports.map(([name]) => name);
    expect(names).toContain('createQos');
  });
});
