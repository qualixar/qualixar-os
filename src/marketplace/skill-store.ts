// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Unified Skill Store
 *
 * Local-first browsable catalog combining:
 *   1. Built-in plugins (from builtin-catalog.ts)
 *   2. Installed skill packages (from skill_packages DB table)
 *
 * This is the single source of truth for the Marketplace UI.
 * No remote registry dependency — everything served from local DB.
 *
 * Plan: .backup/pivot/PHASE3-MARKETPLACE-PLAN.md (Stream 3A)
 */

import type { ToolCategory } from '../tools/tool-categories.js';
import { BUILTIN_PLUGINS } from './builtin-catalog.js';
import type { QosDatabase } from '../db/database.js';
import type { PluginRegistry, RegistryEntry } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillStoreEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly category: ToolCategory | 'mixed';
  readonly tier: 'builtin' | 'community' | 'local';
  readonly types: readonly string[];       // agent, skill, tool, topology
  readonly tags: readonly string[];
  readonly toolCount: number;
  readonly toolNames: readonly string[];
  readonly installed: boolean;
  readonly enabled: boolean;
}

export interface SkillStoreSearchOptions {
  readonly query?: string;
  readonly category?: ToolCategory;
  readonly type?: string;                  // agent, skill, tool, topology
  readonly installedOnly?: boolean;
  readonly sort?: 'name' | 'toolCount' | 'category';
}

export interface SkillStore {
  search(options: SkillStoreSearchOptions): readonly SkillStoreEntry[];
  get(id: string): SkillStoreEntry | undefined;
  getInstalled(): readonly SkillStoreEntry[];
  count(): number;
  /** Re-merge remote registry entries after a registry refresh. */
  refreshRemote(): void;
}

// ---------------------------------------------------------------------------
// Category inference for built-in plugins
// ---------------------------------------------------------------------------

function inferPluginCategory(manifest: typeof BUILTIN_PLUGINS[number]): ToolCategory | 'mixed' {
  const tools = manifest.provides.tools;
  const tags = manifest.tags;

  if (tools.some((t) => /web|search|crawl/.test(t.name))) return 'web-data';
  if (tools.some((t) => /file|shell|code/.test(t.name))) return 'code-dev';
  if (tags.some((t) => /code|engineer|developer/.test(t))) return 'code-dev';
  if (tags.some((t) => /research|web|search/.test(t))) return 'web-data';
  if (tags.some((t) => /data|analysis|report/.test(t))) return 'knowledge';
  if (tags.some((t) => /support|customer|helpdesk/.test(t))) return 'communication';
  if (tags.some((t) => /text|summariz|translat/.test(t))) return 'knowledge';
  if (tags.some((t) => /review|quality/.test(t))) return 'code-dev';
  if (tags.some((t) => /topology|sequential|parallel|debate/.test(t))) return 'knowledge';
  return 'knowledge';
}

function pluginTypes(manifest: typeof BUILTIN_PLUGINS[number]): readonly string[] {
  const types: string[] = [];
  if (manifest.provides.agents.length > 0) types.push('agent');
  if (manifest.provides.skills.length > 0) types.push('skill');
  if (manifest.provides.tools.length > 0) types.push('tool');
  if (manifest.provides.topologies.length > 0) types.push('topology');
  return types;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SkillStoreImpl implements SkillStore {
  private readonly _entries: Map<string, SkillStoreEntry> = new Map();
  private readonly _remoteRegistry?: PluginRegistry;

  constructor(db?: QosDatabase, remoteRegistry?: PluginRegistry) {
    this._remoteRegistry = remoteRegistry;
    // 1. Load built-in plugins
    for (const manifest of BUILTIN_PLUGINS) {
      const toolNames = [
        ...manifest.provides.tools.map((t) => t.name),
        ...manifest.provides.agents.flatMap((a) => a.tools),
      ];
      const uniqueToolNames = [...new Set(toolNames)];

      const entry: SkillStoreEntry = {
        id: `builtin:${manifest.name}`,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        version: manifest.version,
        category: inferPluginCategory(manifest),
        tier: 'builtin',
        types: pluginTypes(manifest),
        tags: [...manifest.tags],
        toolCount: uniqueToolNames.length,
        toolNames: uniqueToolNames,
        installed: true,
        enabled: true,
      };
      this._entries.set(entry.id, entry);
    }

    // 2. Load installed skill packages from DB
    if (db) {
      try {
        const rows = db.query<{
          id: string;
          name: string;
          version: string;
          description: string;
          category: string;
          author_name: string;
          tool_count: number;
          manifest: string;
          status: string;
        }>('SELECT * FROM skill_packages ORDER BY name');

        for (const row of rows) {
          let toolNames: string[] = [];
          try {
            const manifest = JSON.parse(row.manifest);
            toolNames = (manifest.tools ?? []).map((t: { name: string }) => t.name);
          } catch { /* skip parse errors */ }

          const entry: SkillStoreEntry = {
            id: `skill:${row.id}`,
            name: row.name,
            description: row.description,
            author: row.author_name ?? 'Unknown',
            version: row.version,
            category: (row.category as ToolCategory) ?? 'knowledge',
            tier: 'community',
            types: ['skill'],
            tags: [],
            toolCount: row.tool_count,
            toolNames,
            installed: true,
            enabled: row.status === 'active',
          };
          this._entries.set(entry.id, entry);
        }
      } catch {
        // DB may not have skill_packages table yet — graceful degradation
      }

      // 3. Load installed Phase 20 plugins from DB
      try {
        const pluginRows = db.query<{
          id: string;
          name: string;
          version: string;
          description: string;
          types: string;
          enabled: number;
          manifest_json: string;
        }>('SELECT id, name, version, description, types, enabled, manifest_json FROM plugins ORDER BY name');

        for (const row of pluginRows) {
          const pluginId = `plugin:${row.id}`;
          if (this._entries.has(pluginId)) continue;

          let toolNames: string[] = [];
          let tags: string[] = [];
          try {
            const manifest = JSON.parse(row.manifest_json);
            toolNames = (manifest.provides?.tools ?? []).map((t: { name: string }) => t.name);
            tags = manifest.tags ?? [];
          } catch { /* skip */ }

          const types: string[] = [];
          try { types.push(...JSON.parse(row.types)); } catch { /* skip */ }

          const entry: SkillStoreEntry = {
            id: pluginId,
            name: row.name,
            description: row.description,
            author: 'community',
            version: row.version,
            category: 'knowledge',
            tier: 'community',
            types,
            tags,
            toolCount: toolNames.length,
            toolNames,
            installed: true,
            enabled: row.enabled === 1,
          };
          this._entries.set(entry.id, entry);
        }
      } catch {
        // plugins table may not exist yet
      }
    }

    // 4. Merge remote registry entries (community skills not yet installed)
    this.refreshRemote();
  }

  refreshRemote(): void {
    if (!this._remoteRegistry) return;
    try {
      // Remove stale remote entries before re-merging
      for (const key of this._entries.keys()) {
        if (key.startsWith('remote:')) this._entries.delete(key);
      }

      const remoteEntries = this._remoteRegistry.search({});
      for (const remote of remoteEntries) {
        const remoteId = `remote:${remote.id}`;
        // Skip if already present as builtin or installed
        const existsAsBuiltin = this._entries.has(`builtin:${remote.name}`);
        const existsAsPlugin = Array.from(this._entries.values()).some(
          (e) => e.name === remote.name && e.installed,
        );
        if (existsAsBuiltin || existsAsPlugin) continue;

        const remoteAny = remote as unknown as Record<string, unknown>;
        const remoteTools = Array.isArray(remoteAny.tools) ? remoteAny.tools as string[] : [];
        const remoteCat = typeof remoteAny.category === 'string' ? remoteAny.category as ToolCategory : 'knowledge';

        const entry: SkillStoreEntry = {
          id: remoteId,
          name: remote.name,
          description: remote.description,
          author: remote.author,
          version: remote.version,
          category: remoteCat,
          tier: remote.verified ? 'builtin' : 'community',
          types: [...remote.types],
          tags: [...remote.tags],
          toolCount: remoteTools.length,
          toolNames: remoteTools,
          installed: false,
          enabled: false,
        };
        this._entries.set(remoteId, entry);
      }
    } catch {
      // Remote registry may be unavailable — that's fine, local-first
    }
  }

  search(options: SkillStoreSearchOptions): readonly SkillStoreEntry[] {
    let results = Array.from(this._entries.values());

    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        e.toolNames.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (options.category) {
      results = results.filter((e) =>
        e.category === options.category || e.category === 'mixed',
      );
    }

    if (options.type) {
      results = results.filter((e) => e.types.includes(options.type!));
    }

    if (options.installedOnly) {
      results = results.filter((e) => e.installed);
    }

    const sort = options.sort ?? 'name';
    results.sort((a, b) => {
      if (sort === 'toolCount') return b.toolCount - a.toolCount;
      if (sort === 'category') return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  get(id: string): SkillStoreEntry | undefined {
    return this._entries.get(id);
  }

  getInstalled(): readonly SkillStoreEntry[] {
    return Array.from(this._entries.values()).filter((e) => e.installed);
  }

  count(): number {
    return this._entries.size;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSkillStore(db?: QosDatabase, remoteRegistry?: PluginRegistry): SkillStore {
  return new SkillStoreImpl(db, remoteRegistry);
}
