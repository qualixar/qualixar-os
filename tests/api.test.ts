/**
 * Qualixar OS -- Programmatic API Tests
 * Validates the library-facing API surface (createQosInstance).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createQosInstance } from '../src/api.js';
import type { QosInstance } from '../src/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let instance: QosInstance | undefined;

afterEach(async () => {
  if (instance) {
    await instance.shutdown();
    instance = undefined;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createQosInstance', () => {
  it('creates an instance with in-memory DB and default config', async () => {
    instance = await createQosInstance({ dbPath: ':memory:' });
    expect(instance).toBeDefined();
    expect(typeof instance.runTask).toBe('function');
    expect(typeof instance.getStatus).toBe('function');
    expect(typeof instance.listModels).toBe('function');
    expect(typeof instance.shutdown).toBe('function');
  });

  it('creates an instance with zero-config (all defaults)', async () => {
    instance = await createQosInstance();
    expect(instance).toBeDefined();
  });

  it('listModels returns a non-empty readonly array', async () => {
    instance = await createQosInstance({ dbPath: ':memory:' });
    const models = instance.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    // Each model has the expected shape
    for (const model of models) {
      expect(typeof model.name).toBe('string');
      expect(typeof model.provider).toBe('string');
      expect(typeof model.qualityScore).toBe('number');
    }
  });

  it('shutdown is idempotent (calling twice does not throw)', async () => {
    instance = await createQosInstance({ dbPath: ':memory:' });
    await instance.shutdown();
    await instance.shutdown(); // second call should be a no-op
    instance = undefined; // prevent afterEach double-shutdown
  });

  it('methods throw after shutdown', async () => {
    instance = await createQosInstance({ dbPath: ':memory:' });
    await instance.shutdown();

    expect(() => instance!.listModels()).toThrow('QosInstance has been shut down');
    expect(() => instance!.getStatus('fake-id')).toThrow('QosInstance has been shut down');
    await expect(instance!.runTask('hello')).rejects.toThrow('QosInstance has been shut down');

    instance = undefined; // prevent afterEach double-shutdown
  });

  it('respects custom log level', async () => {
    // Should not throw -- 'error' suppresses all but errors
    instance = await createQosInstance({
      dbPath: ':memory:',
      logLevel: 'error',
    });
    expect(instance).toBeDefined();
  });

  it('respects power mode', async () => {
    instance = await createQosInstance({
      dbPath: ':memory:',
      mode: 'power',
    });
    expect(instance).toBeDefined();
    // We can't directly check mode from the facade, but it shouldn't throw
  });
});
