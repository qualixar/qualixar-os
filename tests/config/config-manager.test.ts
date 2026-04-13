/**
 * Qualixar OS V2 -- Config Manager Tests
 *
 * LLD Section 6, Step 3 (tests #10-18).
 * Tests: createConfigManager, get(), getValue(), reload(), migrateConfig.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { stringify } from 'yaml';
import { QosConfigSchema } from '../../src/types/common.js';
import { createConfigManager } from '../../src/config/config-manager.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import { migrateConfig } from '../../src/config/migrator.js';

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

const tempFiles: string[] = [];

function writeTempYaml(content: Record<string, unknown>): string {
  const filePath = path.join(
    os.tmpdir(),
    `qos-test-${crypto.randomUUID()}.yaml`,
  );
  fs.writeFileSync(filePath, stringify(content), 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const f of tempFiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      // file may already be cleaned up
    }
  }
  tempFiles.length = 0;
});

// ---------------------------------------------------------------------------
// #10: createConfigManager with valid object succeeds
// ---------------------------------------------------------------------------

describe('ConfigManager', () => {
  it('#10 createConfigManager with valid object succeeds', () => {
    const config = QosConfigSchema.parse({ mode: 'power' });
    const mgr: ConfigManager = createConfigManager(config);

    const result = mgr.get();
    expect(result.mode).toBe('power');
    expect(result.models.primary).toBe('claude-sonnet-4-6');
  });

  // -------------------------------------------------------------------------
  // #11: get() returns deep clone -- mutating clone does not affect source
  // -------------------------------------------------------------------------

  it('#11 get() returns deep clone -- mutating clone does not affect source', () => {
    const mgr = createConfigManager({ mode: 'companion' });

    const clone = mgr.get();
    // Mutate the clone
    (clone as Record<string, unknown>).mode = 'power';
    (clone.models as Record<string, unknown>).primary = 'gpt-4-turbo';

    // Source must be unchanged
    const fresh = mgr.get();
    expect(fresh.mode).toBe('companion');
    expect(fresh.models.primary).toBe('claude-sonnet-4-6');
  });

  // -------------------------------------------------------------------------
  // #12: get() returns identical values on consecutive calls
  // -------------------------------------------------------------------------

  it('#12 get() returns identical values on consecutive calls', () => {
    const mgr = createConfigManager({ mode: 'power' });

    const first = mgr.get();
    const second = mgr.get();

    expect(first).toEqual(second);
    // But they must be different references (structuredClone)
    expect(first).not.toBe(second);
  });

  // -------------------------------------------------------------------------
  // #13: getValue() retrieves nested values via dot path
  // -------------------------------------------------------------------------

  it('#13 getValue() retrieves nested values via dot path', () => {
    const mgr = createConfigManager({
      mode: 'power',
      models: { primary: 'claude-sonnet-4-6' },
    });

    expect(mgr.getValue('models.primary')).toBe('claude-sonnet-4-6');
    expect(mgr.getValue('mode')).toBe('power');
    expect(mgr.getValue('budget.max_usd')).toBe(100); // default
  });

  // -------------------------------------------------------------------------
  // #14: getValue() throws on invalid path
  // -------------------------------------------------------------------------

  it('#14 getValue() throws on invalid path', () => {
    const mgr = createConfigManager({});

    expect(() => mgr.getValue('nonexistent.deep.path')).toThrow(
      'Config path not found: nonexistent.deep.path',
    );
    expect(() => mgr.getValue('models.doesNotExist')).toThrow(
      'Config path not found: models.doesNotExist',
    );
  });

  // -------------------------------------------------------------------------
  // #15: createConfigManager from YAML file path
  // -------------------------------------------------------------------------

  it('#15 createConfigManager from YAML file path', () => {
    const yamlPath = writeTempYaml({
      mode: 'power',
      models: { primary: 'claude-opus-4' },
      budget: { max_usd: 25 },
    });

    const mgr = createConfigManager(yamlPath);
    const config = mgr.get();

    expect(config.mode).toBe('power');
    expect(config.models.primary).toBe('claude-opus-4');
    expect(config.budget.max_usd).toBe(25);
    // Defaults still fill in
    expect(config.models.fallback).toBe('gpt-4.1-mini');
  });

  // -------------------------------------------------------------------------
  // #16: reload() refreshes config from YAML file
  // -------------------------------------------------------------------------

  it('#16 reload() refreshes config from YAML file', () => {
    const yamlPath = writeTempYaml({
      mode: 'companion',
      budget: { max_usd: 10 },
    });

    const mgr = createConfigManager(yamlPath);
    expect(mgr.get().mode).toBe('companion');
    expect(mgr.get().budget.max_usd).toBe(10);

    // Modify the YAML file
    fs.writeFileSync(
      yamlPath,
      stringify({ mode: 'power', budget: { max_usd: 50 } }),
      'utf-8',
    );

    // Reload
    mgr.reload();

    expect(mgr.get().mode).toBe('power');
    expect(mgr.get().budget.max_usd).toBe(50);
  });

  // -------------------------------------------------------------------------
  // #17: reload() throws when no YAML path available
  // -------------------------------------------------------------------------

  it('#17 reload() throws when no YAML path available', () => {
    // Created with an object, not a file path
    const mgr = createConfigManager({ mode: 'companion' });

    expect(() => mgr.reload()).toThrow('No YAML path available for reload');
  });

  // -------------------------------------------------------------------------
  // #18: migrateConfig passes through current version unchanged
  // -------------------------------------------------------------------------

  it('#18 migrateConfig passes through current version unchanged', () => {
    const raw = {
      mode: 'companion',
      models: { primary: 'claude-sonnet-4-6' },
      budget: { max_usd: 10 },
    };

    const result = migrateConfig(raw);

    // Should pass through unchanged
    expect(result).toEqual(raw);
  });

  // -------------------------------------------------------------------------
  // Additional migrator edge cases
  // -------------------------------------------------------------------------

  it('migrateConfig throws on non-object input', () => {
    expect(() => migrateConfig(null as unknown as Record<string, unknown>)).toThrow(
      'Config must be an object',
    );
    expect(() => migrateConfig('hello' as unknown as Record<string, unknown>)).toThrow(
      'Config must be an object',
    );
  });

  // -------------------------------------------------------------------------
  // Coverage: migrateConfig strips _version when version equals CURRENT_VERSION
  // -------------------------------------------------------------------------

  it('migrateConfig strips _version field when version is current (1)', () => {
    const raw = {
      _version: 1,
      mode: 'power',
      models: { primary: 'claude-sonnet-4-6' },
    };

    const result = migrateConfig(raw);

    // _version should be stripped from the output
    expect(result).not.toHaveProperty('_version');
    expect(result).toEqual({
      mode: 'power',
      models: { primary: 'claude-sonnet-4-6' },
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: migrateConfig throws on unknown numeric version
  // -------------------------------------------------------------------------

  it('migrateConfig throws on unknown numeric version', () => {
    const raw = { _version: 999, mode: 'companion' };
    expect(() => migrateConfig(raw)).toThrow('Unknown config version: 999');
  });

  // -------------------------------------------------------------------------
  // Coverage: migrateConfig throws on non-number version type (string)
  // -------------------------------------------------------------------------

  it('migrateConfig throws on non-number version type', () => {
    const raw = { _version: 'v2', mode: 'companion' };
    expect(() => migrateConfig(raw)).toThrow('Unknown config version: v2');
  });

  // -------------------------------------------------------------------------
  // Coverage: migrateConfig throws on array input
  // -------------------------------------------------------------------------

  it('migrateConfig throws on array input', () => {
    expect(() => migrateConfig([] as unknown as Record<string, unknown>)).toThrow(
      'Config must be an object',
    );
  });

  // -------------------------------------------------------------------------
  // Coverage: YAML file with null content (empty file) throws
  // -------------------------------------------------------------------------

  it('createConfigManager throws on empty YAML file', () => {
    const yamlPath = writeTempYaml('');
    // Empty YAML returns null -> should throw 'Invalid YAML config file'
    // We need to write raw empty content, not via writeTempYaml helper
    fs.writeFileSync(yamlPath, '', 'utf-8');
    expect(() => createConfigManager(yamlPath)).toThrow();
  });

  it('createConfigManager throws on YAML array content', () => {
    const yamlPath = path.join(os.tmpdir(), `qos-test-${crypto.randomUUID()}.yaml`);
    fs.writeFileSync(yamlPath, '- item1\n- item2\n', 'utf-8');
    tempFiles.push(yamlPath);
    expect(() => createConfigManager(yamlPath)).toThrow();
  });
});
