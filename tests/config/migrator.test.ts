/**
 * Qualixar OS Session 15 -- Config Migrator Tests (M-03)
 *
 * Dedicated test file for the config migration system.
 */

import { describe, it, expect } from 'vitest';
import { migrateConfig } from '../../src/config/migrator.js';

describe('migrateConfig', () => {
  it('passes through config without _version field unchanged', () => {
    const input = { mode: 'companion', db: { path: ':memory:' } };
    const result = migrateConfig(input);
    expect(result).toEqual(input);
  });

  it('strips _version field when present with current version', () => {
    const input = { _version: 1, mode: 'power' };
    const result = migrateConfig(input);
    expect(result).toEqual({ mode: 'power' });
    expect('_version' in result).toBe(false);
  });

  it('throws for null input', () => {
    expect(() => migrateConfig(null as unknown as Record<string, unknown>)).toThrow('Config must be an object');
  });

  it('throws for array input', () => {
    expect(() => migrateConfig([] as unknown as Record<string, unknown>)).toThrow('Config must be an object');
  });

  it('throws for non-object input', () => {
    expect(() => migrateConfig('string' as unknown as Record<string, unknown>)).toThrow();
  });

  it('preserves all config fields during pass-through', () => {
    const input = {
      mode: 'companion',
      models: { primary: 'claude-sonnet-4-6' },
      budget: { max_usd: 5 },
      memory: { enabled: true },
    };
    const result = migrateConfig(input);
    expect(result.models).toEqual({ primary: 'claude-sonnet-4-6' });
    expect(result.budget).toEqual({ max_usd: 5 });
  });

  it('handles empty object', () => {
    const result = migrateConfig({});
    expect(result).toEqual({});
  });
});
