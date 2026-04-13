// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Plugin Lifecycle Manager
 *
 * Orchestrates the full plugin lifecycle: install from registry, install from
 * local directory, uninstall, enable, disable, configure. Persists state to
 * the SQLite `plugins` and `plugin_configs` tables and synchronises the
 * runtime registries on every state change.
 *
 * Hard Rules:
 *   HR-17: Parameterized queries only (via QosDatabase helpers).
 *   HR-17 (file): fs.rmSync for deletion — NEVER shell rm.
 *   Security: SHA-256 verified before extracting tarballs.
 *   Immutability: every returned InstalledPlugin is a new object.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { PluginLoader } from './plugin-loader.js';
import { loadManifest } from './manifest-loader.js';
import { PluginManifestSchema } from './manifest-schema.js';
import type {
  InstalledPlugin,
  PluginLifecycleManager,
  SkillRegistry,
  PluginManifest,
  PluginRegistry,
  RegistryEntry,
  PluginSandbox,
  PluginTier,
  PluginType,
} from '../types/phase20.js';

// ---------------------------------------------------------------------------
// DB row shape (what comes back from SQLite)
// ---------------------------------------------------------------------------

interface PluginRow {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  tier: string;
  types: string; // JSON array
  enabled: number; // 0 | 1
  manifest_json: string;
  install_path: string;
  installed_at: string;
  updated_at: string;
}

interface ConfigRow {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Row <-> domain model conversion (immutable output)
// ---------------------------------------------------------------------------

function rowToPlugin(row: PluginRow, config: Readonly<Record<string, unknown>>): InstalledPlugin {
  return Object.freeze({
    id: row.id,
    name: row.name,
    version: row.version,
    author: row.author,
    description: row.description,
    tier: row.tier as PluginTier,
    types: JSON.parse(row.types) as readonly PluginType[],
    enabled: row.enabled === 1,
    manifest: JSON.parse(row.manifest_json) as PluginManifest,
    installPath: row.install_path,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    config,
  });
}

// ---------------------------------------------------------------------------
// Synthetic manifest builder (for registry entries without real packages)
// ---------------------------------------------------------------------------

function buildSyntheticManifest(entry: RegistryEntry): Record<string, unknown> {
  return {
    name: entry.name,
    version: entry.version,
    author: entry.author,
    description: entry.description,
    tags: [...entry.tags],
    provides: { agents: [], skills: [], tools: [], topologies: [] },
  };
}

// ---------------------------------------------------------------------------
// Tarball download + SHA-256 verification
// ---------------------------------------------------------------------------

async function downloadTarball(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download plugin: ${response.status} ${response.statusText}`);
  }
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}

function verifySha256(data: Buffer, expected: string): void {
  const actual = crypto.createHash('sha256').update(data).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `SHA-256 mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tarball extraction (Node built-in tar via child_process, no extra deps)
// ---------------------------------------------------------------------------

async function extractTarball(tarBuffer: Buffer, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  const tmpFile = path.join(destDir, '.tmp-plugin.tgz');
  fs.writeFileSync(tmpFile, tarBuffer);

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync('tar', ['-xzf', tmpFile, '-C', destDir, '--strip-components=1']);
  } finally {
    try { fs.rmSync(tmpFile); } catch { /* best-effort cleanup */ }
  }
}

// ---------------------------------------------------------------------------
// Plugin install dir helper
// ---------------------------------------------------------------------------

function pluginInstallDir(pluginId: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return path.join(home, '.qualixar-os', 'plugins', pluginId);
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig(
  db: QosDatabase,
  pluginId: string,
): Readonly<Record<string, unknown>> {
  const rows = db.query<ConfigRow>(
    'SELECT key, value FROM plugin_configs WHERE plugin_id = ?',
    [pluginId],
  );
  const config: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      config[row.key] = row.value;
    }
  }
  return Object.freeze(config);
}

// ---------------------------------------------------------------------------
// Sandbox with register/unregister helpers
// ---------------------------------------------------------------------------

type SandboxWithRegistration = PluginSandbox & {
  register?(pluginId: string, tier: PluginTier): void;
  unregister?(pluginId: string): void;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class PluginLifecycleManagerImpl implements PluginLifecycleManager {
  private readonly _db: QosDatabase;
  private readonly _registry: PluginRegistry;
  private readonly _loader: PluginLoader;
  private readonly _sandbox: SandboxWithRegistration;
  private readonly _eventBus: EventBus;

  constructor(
    db: QosDatabase,
    registry: PluginRegistry,
    loader: PluginLoader,
    sandbox: PluginSandbox,
    eventBus: EventBus,
  ) {
    this._db = db;
    this._registry = registry;
    this._loader = loader;
    this._sandbox = sandbox as SandboxWithRegistration;
    this._eventBus = eventBus;
  }

  // ---- Runtime registries (injected at load time) -------------------------
  // We accept them per-call instead of constructor to keep the constructor
  // signature clean and to avoid circular-dep issues at bootstrap.

  async install(
    pluginId: string,
    toolRegistry?: ToolRegistry,
    agentRegistry?: AgentRegistry,
    skillRegistry?: SkillRegistry,
  ): Promise<InstalledPlugin> {
    // 1. Look up in the remote registry
    const entry = this._registry.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin '${pluginId}' not found in registry`);
    }

    const id = randomUUID();
    const installTimestamp = new Date().toISOString();
    const tier: PluginTier = entry.verified ? 'verified' : 'community';

    // Determine install strategy from the tarball URL:
    //   .json  → JSON manifest install (skills, blueprints)
    //   .tgz   → tarball install (full plugin packages)
    const isJsonManifest = entry.tarballUrl.endsWith('.json');
    let installPath: string;
    let manifestObj: Record<string, unknown>;

    if (isJsonManifest) {
      // --- JSON Manifest Install Path ---
      // Download the manifest JSON, verify SHA256 integrity, persist locally.
      const response = await fetch(entry.tarballUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      }
      const rawBytes = Buffer.from(await response.arrayBuffer());
      verifySha256(rawBytes, entry.sha256);

      manifestObj = JSON.parse(rawBytes.toString('utf-8')) as Record<string, unknown>;
      installPath = pluginInstallDir(pluginId);
      fs.mkdirSync(installPath, { recursive: true });
      fs.writeFileSync(
        path.join(installPath, 'plugin.json'),
        JSON.stringify(manifestObj, null, 2),
        'utf-8',
      );
    } else {
      // --- Tarball Install Path ---
      // Download .tgz, verify SHA256, extract to install directory.
      const tarball = await downloadTarball(entry.tarballUrl);
      verifySha256(tarball, entry.sha256);
      installPath = pluginInstallDir(pluginId);
      await extractTarball(tarball, installPath);
      manifestObj = loadManifest(installPath) as unknown as Record<string, unknown>;
    }

    // Persist to DB
    this._db.insert('plugins', {
      id,
      name: entry.name,
      version: entry.version,
      author: entry.author,
      description: entry.description,
      tier,
      types: JSON.stringify(entry.types),
      enabled: 1,
      manifest_json: JSON.stringify(manifestObj),
      install_path: installPath,
      installed_at: installTimestamp,
      updated_at: installTimestamp,
    });

    const plugin = rowToPlugin(
      {
        id,
        name: entry.name,
        version: entry.version,
        author: entry.author,
        description: entry.description,
        tier,
        types: JSON.stringify(entry.types),
        enabled: 1,
        manifest_json: JSON.stringify(manifestObj),
        install_path: installPath,
        installed_at: installTimestamp,
        updated_at: installTimestamp,
      },
      {},
    );

    // Register in sandbox
    this._sandbox.register?.(id, tier);

    // Load into runtime if registries provided
    if (toolRegistry && agentRegistry && skillRegistry) {
      this._loader.loadPlugin(plugin, toolRegistry, agentRegistry, skillRegistry, this._sandbox);
    }

    // Emit event
    this._eventBus.emit({
      type: 'plugin:installed',
      source: 'plugin-lifecycle',
      payload: { pluginId: id, name: entry.name, version: entry.version },
    });

    return plugin;
  }

  async installLocal(
    pluginDir: string,
    toolRegistry?: ToolRegistry,
    agentRegistry?: AgentRegistry,
    skillRegistry?: SkillRegistry,
  ): Promise<InstalledPlugin> {
    // 1. Load + validate manifest
    const manifest = loadManifest(pluginDir);

    // 2. Copy to install dir
    const id = randomUUID();
    const installPath = pluginInstallDir(id);
    fs.mkdirSync(installPath, { recursive: true });
    fs.cpSync(pluginDir, installPath, { recursive: true });

    // 3. Persist to DB
    const now = new Date().toISOString();
    const tier: PluginTier = 'local';

    this._db.insert('plugins', {
      id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      tier,
      types: JSON.stringify(
        [
          manifest.provides.tools.length > 0 ? 'tool' : null,
          manifest.provides.agents.length > 0 ? 'agent' : null,
          manifest.provides.skills.length > 0 ? 'skill' : null,
          manifest.provides.topologies.length > 0 ? 'topology' : null,
        ].filter(Boolean),
      ),
      enabled: 1,
      manifest_json: JSON.stringify(manifest),
      install_path: installPath,
      installed_at: now,
      updated_at: now,
    });

    const plugin = rowToPlugin(
      {
        id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: manifest.description,
        tier,
        types: JSON.stringify([]),
        enabled: 1,
        manifest_json: JSON.stringify(manifest),
        install_path: installPath,
        installed_at: now,
        updated_at: now,
      },
      {},
    );

    // 4. Register in sandbox
    this._sandbox.register?.(id, tier);

    // 5. Load into runtime if registries provided
    if (toolRegistry && agentRegistry && skillRegistry) {
      this._loader.loadPlugin(plugin, toolRegistry, agentRegistry, skillRegistry, this._sandbox);
    }

    // 6. Emit event
    this._eventBus.emit({
      type: 'plugin:installed',
      source: 'plugin-lifecycle',
      payload: { pluginId: id, name: manifest.name, version: manifest.version, local: true },
    });

    return plugin;
  }

  async uninstall(
    pluginId: string,
    toolRegistry?: ToolRegistry,
    agentRegistry?: AgentRegistry,
    skillRegistry?: SkillRegistry,
  ): Promise<void> {
    const plugin = this.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    // 1. Unload from runtime
    if (toolRegistry && agentRegistry && skillRegistry) {
      this._loader.unloadPlugin(plugin, toolRegistry, agentRegistry, skillRegistry);
    }

    // 2. Remove from sandbox registry
    this._sandbox.unregister?.(pluginId);

    // 3. Delete DB records (plugin_configs cascade-deletes automatically)
    this._db.db
      .prepare('DELETE FROM plugins WHERE id = ?')
      .run(pluginId);

    // 4. Remove install files — explicit path, never shell rm
    if (fs.existsSync(plugin.installPath)) {
      fs.rmSync(plugin.installPath, { recursive: true, force: true });
    }

    // 5. Emit event
    this._eventBus.emit({
      type: 'plugin:uninstalled',
      source: 'plugin-lifecycle',
      payload: { pluginId, name: plugin.name },
    });
  }

  async enable(
    pluginId: string,
    toolRegistry?: ToolRegistry,
    agentRegistry?: AgentRegistry,
    skillRegistry?: SkillRegistry,
  ): Promise<void> {
    const plugin = this.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }
    if (plugin.enabled) return;

    // 1. Update DB
    this._db.update(
      'plugins',
      { enabled: 1, updated_at: new Date().toISOString() },
      { id: pluginId },
    );

    // 2. Re-register in sandbox
    this._sandbox.register?.(pluginId, plugin.tier);

    // 3. Load into runtime
    if (toolRegistry && agentRegistry && skillRegistry) {
      this._loader.loadPlugin(plugin, toolRegistry, agentRegistry, skillRegistry, this._sandbox);
    }

    // 4. Emit event
    this._eventBus.emit({
      type: 'plugin:enabled',
      source: 'plugin-lifecycle',
      payload: { pluginId, name: plugin.name },
    });
  }

  async disable(
    pluginId: string,
    toolRegistry?: ToolRegistry,
    agentRegistry?: AgentRegistry,
    skillRegistry?: SkillRegistry,
  ): Promise<void> {
    const plugin = this.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }
    if (!plugin.enabled) return;

    // 1. Unload from runtime
    if (toolRegistry && agentRegistry && skillRegistry) {
      this._loader.unloadPlugin(plugin, toolRegistry, agentRegistry, skillRegistry);
    }

    // 2. Remove from sandbox
    this._sandbox.unregister?.(pluginId);

    // 3. Update DB
    this._db.update(
      'plugins',
      { enabled: 0, updated_at: new Date().toISOString() },
      { id: pluginId },
    );

    // 4. Emit event
    this._eventBus.emit({
      type: 'plugin:disabled',
      source: 'plugin-lifecycle',
      payload: { pluginId, name: plugin.name },
    });
  }

  async configure(
    pluginId: string,
    config: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const plugin = this.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    // Validate config keys against manifest schema
    const manifestConfigSchema = plugin.manifest.config;
    for (const [key, value] of Object.entries(config)) {
      const fieldSchema = manifestConfigSchema[key];
      if (!fieldSchema) {
        throw new Error(`Unknown config key '${key}' for plugin '${plugin.name}'`);
      }
      // Basic type check
      const expected = fieldSchema.type === 'select' || fieldSchema.type === 'multiselect'
        ? 'string'
        : fieldSchema.type;
      const actual = typeof value;
      if (expected !== 'string' && actual !== expected) {
        throw new Error(
          `Config key '${key}': expected type '${expected}', got '${actual}'`,
        );
      }
    }

    // Upsert each config key using parameterized query
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(config)) {
      const existing = this._db.get<{ id: string }>(
        'SELECT id FROM plugin_configs WHERE plugin_id = ? AND key = ?',
        [pluginId, key],
      );

      if (existing) {
        this._db.update(
          'plugin_configs',
          { value: JSON.stringify(value), updated_at: now },
          { id: existing.id },
        );
      } else {
        this._db.insert('plugin_configs', {
          id: randomUUID(),
          plugin_id: pluginId,
          key,
          value: JSON.stringify(value),
          updated_at: now,
        });
      }
    }

    // Emit event
    this._eventBus.emit({
      type: 'plugin:configured',
      source: 'plugin-lifecycle',
      payload: { pluginId, keys: Object.keys(config) },
    });
  }

  list(): readonly InstalledPlugin[] {
    const rows = this._db.query<PluginRow>('SELECT * FROM plugins ORDER BY name');
    return rows.map((row) => rowToPlugin(row, loadConfig(this._db, row.id)));
  }

  get(pluginId: string): InstalledPlugin | undefined {
    const row = this._db.get<PluginRow>(
      'SELECT * FROM plugins WHERE id = ?',
      [pluginId],
    );
    if (!row) return undefined;
    return rowToPlugin(row, loadConfig(this._db, pluginId));
  }

  isInstalled(pluginId: string): boolean {
    return this._db.get<{ id: string }>(
      'SELECT id FROM plugins WHERE id = ?',
      [pluginId],
    ) !== undefined;
  }

  validateManifest(manifest: unknown): PluginManifest {
    const result = PluginManifestSchema.safeParse(manifest);
    if (!result.success) {
      const issues = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new Error(`Invalid manifest:\n${issues.join('\n')}`);
    }
    return result.data as unknown as PluginManifest;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginLifecycleManager(
  db: QosDatabase,
  registry: PluginRegistry,
  loader: PluginLoader,
  sandbox: PluginSandbox,
  eventBus: EventBus,
): PluginLifecycleManager {
  return new PluginLifecycleManagerImpl(db, registry, loader, sandbox, eventBus);
}
