// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Phase 20: Marketplace Ecosystem Types
 *
 * Plugin manifest, registry, lifecycle, sandbox, and dashboard types.
 * HR-1: Every interface is readonly + immutable.
 */

// ---------------------------------------------------------------------------
// Plugin Core Types
// ---------------------------------------------------------------------------

export type PluginType = 'agent' | 'skill' | 'tool' | 'topology';
export type PluginTier = 'verified' | 'community' | 'local';

export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly license: string;
  readonly tags: readonly string[];
  readonly icon: string | null;
  readonly homepage: string | null;
  readonly repository: string | null;
  readonly provides: PluginProvides;
  readonly requires: PluginRequirements;
  readonly config: Readonly<Record<string, PluginConfigField>>;
}

export interface PluginProvides {
  readonly agents: readonly PluginAgentDef[];
  readonly skills: readonly PluginSkillDef[];
  readonly tools: readonly PluginToolDef[];
  readonly topologies: readonly PluginTopologyDef[];
}

export interface PluginAgentDef {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly tools: readonly string[];
  readonly systemPrompt: string;
  readonly role: string;
}

export interface PluginSkillDef {
  readonly name: string;
  readonly description: string;
  readonly promptTemplate: string;
  readonly parameters: readonly PluginSkillParam[];
}

export interface PluginSkillParam {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly required: boolean;
  readonly default: string | number | boolean | null;
  readonly description: string;
}

export interface PluginToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly implementation: PluginToolImplementation;
}

export type PluginToolImplementation =
  | { readonly type: 'builtin'; readonly handler: string }
  | { readonly type: 'http'; readonly url: string; readonly method: 'GET' | 'POST'; readonly headers: Readonly<Record<string, string>> }
  | { readonly type: 'shell'; readonly command: string; readonly timeout: number };

export interface PluginTopologyDef {
  readonly name: string;
  readonly description: string;
  readonly topologyType: string;
  readonly agents: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
}

export interface PluginRequirements {
  readonly minVersion: string;
  readonly providers: readonly string[];
  readonly tools: readonly string[];
  readonly plugins: readonly string[];
}

export interface PluginConfigField {
  readonly type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  readonly description: string;
  readonly default: string | number | boolean | readonly string[] | null;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
}

// ---------------------------------------------------------------------------
// Registry Types
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly type: PluginType;
  readonly types: readonly PluginType[];
  readonly version: string;
  readonly stars: number;
  readonly installs: number;
  readonly repo: string;
  readonly tarballUrl: string;
  readonly sha256: string;
  readonly verified: boolean;
  readonly tags: readonly string[];
  readonly minQosVersion: string;
  readonly updatedAt: string;
}

export interface RegistryIndex {
  readonly version: number;
  readonly updatedAt: string;
  readonly plugins: readonly RegistryEntry[];
}

export interface RegistrySearchOptions {
  readonly query?: string;
  readonly type?: PluginType;
  readonly tags?: readonly string[];
  readonly verifiedOnly?: boolean;
  readonly sortBy?: 'stars' | 'installs' | 'updated' | 'name';
  readonly limit?: number;
  readonly offset?: number;
}

export interface PluginRegistry {
  refresh(): Promise<void>;
  search(options: RegistrySearchOptions): readonly RegistryEntry[];
  get(pluginId: string): RegistryEntry | undefined;
  getIndex(): RegistryIndex;
  isStale(): boolean;
}

// ---------------------------------------------------------------------------
// Installed Plugin Types
// ---------------------------------------------------------------------------

export interface InstalledPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly tier: PluginTier;
  readonly types: readonly PluginType[];
  readonly enabled: boolean;
  readonly manifest: PluginManifest;
  readonly installPath: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface PluginLifecycleManager {
  install(pluginId: string): Promise<InstalledPlugin>;
  installLocal(pluginDir: string): Promise<InstalledPlugin>;
  uninstall(pluginId: string): Promise<void>;
  enable(pluginId: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
  configure(pluginId: string, config: Readonly<Record<string, unknown>>): Promise<void>;
  list(): readonly InstalledPlugin[];
  get(pluginId: string): InstalledPlugin | undefined;
  isInstalled(pluginId: string): boolean;
  validateManifest(manifest: unknown): PluginManifest;
}

// ---------------------------------------------------------------------------
// Sandbox Types
// ---------------------------------------------------------------------------

export interface PluginPermissions {
  readonly tier: PluginTier;
  readonly canExecuteShell: boolean;
  readonly canWriteFiles: boolean;
  readonly canReadFiles: boolean;
  readonly allowedPaths: readonly string[];
  readonly deniedTools: readonly string[];
  readonly maxExecutionTimeMs: number;
}

export interface PluginSandbox {
  getPermissions(tier: PluginTier): PluginPermissions;
  canUseTool(pluginId: string, toolName: string): boolean;
  canAccessPath(pluginId: string, filePath: string): boolean;
  wrapHandler(
    pluginId: string,
    handler: (input: Record<string, unknown>) => Promise<{ readonly content: string; readonly isError?: boolean }>,
  ): (input: Record<string, unknown>) => Promise<{ readonly content: string; readonly isError?: boolean }>;
}

// ---------------------------------------------------------------------------
// Skill Registry Types
// ---------------------------------------------------------------------------

export interface SkillRegistry {
  register(pluginId: string, skill: PluginSkillDef): void;
  unregisterByPlugin(pluginId: string): void;
  get(name: string): PluginSkillDef | undefined;
  list(): readonly { readonly name: string; readonly pluginId: string; readonly skill: PluginSkillDef }[];
  render(name: string, params: Readonly<Record<string, unknown>>): string;
}

// ---------------------------------------------------------------------------
// Dashboard Types
// ---------------------------------------------------------------------------

export interface PluginCard {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly types: readonly PluginType[];
  readonly version: string;
  readonly stars: number;
  readonly installs: number;
  readonly verified: boolean;
  readonly tags: readonly string[];
  readonly isInstalled: boolean;
  readonly isEnabled: boolean;
  readonly hasUpdate: boolean;
}

export interface PluginDetail {
  readonly entry: RegistryEntry;
  readonly installed: InstalledPlugin | null;
  readonly manifest: PluginManifest | null;
  readonly configSchema: Readonly<Record<string, PluginConfigField>>;
  readonly currentConfig: Readonly<Record<string, unknown>>;
}
