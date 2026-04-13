// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Manifest Loader
 *
 * Reads qos-plugin.yaml from a plugin directory, parses it, and validates
 * against PluginManifestSchema. Throws typed errors on failure.
 *
 * Hard Rule HR-17: No shell commands for file I/O — use fs module only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PluginManifestSchema } from './manifest-schema.js';
import type { PluginManifest } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class ManifestNotFoundError extends Error {
  public readonly pluginDir: string;

  constructor(pluginDir: string) {
    super(`Plugin manifest not found in: ${pluginDir}`);
    this.name = 'ManifestNotFoundError';
    this.pluginDir = pluginDir;
  }
}

export class ManifestValidationError extends Error {
  public readonly pluginDir: string;
  public readonly issues: readonly string[];

  constructor(pluginDir: string, issues: readonly string[]) {
    super(`Invalid plugin manifest in: ${pluginDir}\n${issues.join('\n')}`);
    this.name = 'ManifestValidationError';
    this.pluginDir = pluginDir;
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const MANIFEST_FILENAME = 'qos-plugin.yaml';

/**
 * Load and validate a plugin manifest from disk.
 *
 * @param pluginDir - Absolute path to the plugin directory.
 * @returns Validated PluginManifest (immutable).
 * @throws ManifestNotFoundError if qos-plugin.yaml does not exist.
 * @throws ManifestValidationError if the manifest fails schema validation.
 */
export function loadManifest(pluginDir: string): PluginManifest {
  const manifestPath = path.join(pluginDir, MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    throw new ManifestNotFoundError(pluginDir);
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ManifestValidationError(pluginDir, [`YAML parse error: ${msg}`]);
  }

  const result = PluginManifestSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ManifestValidationError(pluginDir, issues);
  }

  return result.data as unknown as PluginManifest;
}
