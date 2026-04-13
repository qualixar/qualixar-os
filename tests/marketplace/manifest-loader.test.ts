/**
 * Qualixar OS Phase 20 -- manifest-loader.test.ts
 *
 * 3 tests covering loadManifest(dir) — valid YAML, missing file, invalid content.
 * Test IDs: 8–10.
 *
 * Uses real temp directories with actual YAML files (no mocking of fs).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadManifest,
  ManifestNotFoundError,
  ManifestValidationError,
} from '../../src/marketplace/manifest-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qos-manifest-test-'));
}

function writeManifest(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, 'qos-plugin.yaml'), content, 'utf8');
}

const VALID_YAML = `
name: my-plugin
version: 1.0.0
author: Qualixar
description: A test plugin that does something useful for Qualixar OS.
license: MIT
tags: []
icon: null
homepage: null
repository: null
provides:
  agents: []
  skills: []
  tools: []
  topologies: []
requires:
  minVersion: 2.0.0
  providers: []
  tools: []
  plugins: []
config: {}
`.trim();

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDirs: string[] = [];

beforeEach(() => {
  tmpDirs = [];
});

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTmpDir(): string {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadManifest()', () => {
  it('8 - loads and parses a valid YAML manifest successfully', () => {
    const dir = createTmpDir();
    writeManifest(dir, VALID_YAML);

    const manifest = loadManifest(dir);

    expect(manifest.name).toBe('my-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.author).toBe('Qualixar');
    expect(manifest.license).toBe('MIT');
    expect(manifest.provides.agents).toHaveLength(0);
    expect(manifest.requires.minVersion).toBe('2.0.0');
  });

  it('9 - throws ManifestNotFoundError when qos-plugin.yaml is absent', () => {
    const dir = createTmpDir();
    // No manifest file written

    expect(() => loadManifest(dir)).toThrowError(ManifestNotFoundError);

    try {
      loadManifest(dir);
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestNotFoundError);
      if (err instanceof ManifestNotFoundError) {
        expect(err.pluginDir).toBe(dir);
        expect(err.name).toBe('ManifestNotFoundError');
      }
    }
  });

  it('10 - throws ManifestValidationError for invalid manifest content', () => {
    const dir = createTmpDir();
    // name is missing, version is non-semver
    const badYaml = `
name: INVALID_UPPERCASE_NAME
version: not-a-version
author: X
description: Too short
license: MIT
provides:
  agents: []
  skills: []
  tools: []
  topologies: []
requires:
  minVersion: 2.0.0
config: {}
`.trim();
    writeManifest(dir, badYaml);

    expect(() => loadManifest(dir)).toThrowError(ManifestValidationError);

    try {
      loadManifest(dir);
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestValidationError);
      if (err instanceof ManifestValidationError) {
        expect(err.pluginDir).toBe(dir);
        expect(err.name).toBe('ManifestValidationError');
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }
  });
});
