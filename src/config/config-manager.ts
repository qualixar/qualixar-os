// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Config Manager
 *
 * Zod-validated config loading from objects or YAML files.
 * Source of truth: Phase 0 LLD Section 2.3.
 *
 * Key invariants:
 *   - get() returns structuredClone (Hard Rule #5 -- immutability)
 *   - No global state (Hard Rule #7 -- constructor DI only)
 *   - YAML loading via 'yaml' package (eemeli/yaml, YAML 1.2)
 *   - Migration via migrator.ts before Zod validation
 */

import fs, { watch } from 'node:fs';
import yaml from 'yaml';
import { QosConfigSchema, type QosConfig } from '../types/common.js';
import { migrateConfig } from './migrator.js';
import type { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Read-only config access with dot-path queries and hot-reload.
 */
export interface ConfigManager {
  /** Return a deep clone of the full config. */
  get(): QosConfig;

  /** Retrieve a nested value via dot-delimited path (e.g. 'models.primary'). */
  getValue<T = unknown>(path: string): T;

  /**
   * Reload config from YAML.
   * Uses the stored YAML path unless an explicit path is provided.
   * @throws Error if no YAML path is available
   */
  reload(yamlPath?: string): void;

  /** Start watching config.yaml for changes and auto-reload (debounced 500ms). */
  startWatching(eventBus: EventBus): void;

  /** Stop watching config.yaml for changes. */
  stopWatching(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ConfigManagerImpl implements ConfigManager {
  private _config: QosConfig;
  private _yamlPath: string | undefined;
  private _watcher: ReturnType<typeof watch> | undefined;

  constructor(config: QosConfig | string) {
    if (typeof config === 'string') {
      // String = YAML file path
      this._yamlPath = config;
      const raw = this._loadFromYaml(config);
      const migrated = migrateConfig(raw);
      this._config = QosConfigSchema.parse(migrated);
    } else {
      // Object = direct config (still validate + apply defaults)
      this._config = QosConfigSchema.parse(config);
    }
  }

  get(): QosConfig {
    // HARD RULE 5: structuredClone for immutability
    return structuredClone(this._config);
  }

  getValue<T = unknown>(path: string): T {
    // Step 1: Clone to prevent mutation via returned sub-objects
    const clone = structuredClone(this._config);

    // Step 2: Split path into segments
    const segments = path.split('.');

    // Step 3-4: Walk the object tree
    let current: unknown = clone;
    for (const segment of segments) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== 'object'
      ) {
        throw new Error(`Config path not found: ${path}`);
      }
      current = (current as Record<string, unknown>)[segment];
    }

    // Step 5: Final undefined check
    if (current === undefined) {
      throw new Error(`Config path not found: ${path}`);
    }

    return current as T;
  }

  reload(yamlPath?: string): void {
    // Step 1: Determine path
    const resolvedPath = yamlPath ?? this._yamlPath;
    if (!resolvedPath) {
      throw new Error('No YAML path available for reload');
    }

    // Steps 2-7: Load, migrate, validate, replace
    const raw = this._loadFromYaml(resolvedPath);
    const migrated = migrateConfig(raw);
    this._config = QosConfigSchema.parse(migrated);
    this._yamlPath = resolvedPath;
  }

  startWatching(eventBus: EventBus): void {
    if (!this._yamlPath) return;
    const configPath = this._yamlPath;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    this._watcher = watch(configPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          this.reload();
          eventBus.emit({
            type: 'config:changed',
            payload: { source: 'file-watcher', path: configPath },
            source: 'ConfigManager',
          });
        } catch (err) {
          // Config reload failed — keep the previous valid config
          console.error('Config hot-reload failed:', err);
        }
      }, 500);
    });
  }

  stopWatching(): void {
    this._watcher?.close();
    this._watcher = undefined;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _loadFromYaml(filePath: string): Record<string, unknown> {
    // Step 1: Read file
    const content = fs.readFileSync(filePath, 'utf-8');

    // Step 2: Parse YAML (strict mode, pretty errors)
    const parsed = yaml.parse(content, {
      prettyErrors: true,
      strict: true,
      uniqueKeys: true,
    });

    // Step 3: Validate result is a non-null object
    // (empty YAML files return null per yaml package spec)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid YAML config file');
    }

    return parsed as Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a ConfigManager from a validated config object or YAML file path.
 *
 * @param config - A QosConfig object or path to a YAML config file
 * @returns ConfigManager instance
 */
export function createConfigManager(
  config: QosConfig | string,
): ConfigManager {
  return new ConfigManagerImpl(config);
}
