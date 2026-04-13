/**
 * Qualixar OS Phase 20 -- builtin-catalog.test.ts
 *
 * 4 tests covering BUILTIN_PLUGINS catalog integrity.
 * Test IDs: 47–50.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_PLUGINS } from '../../src/marketplace/builtin-catalog.js';
import { PluginManifestSchema } from '../../src/marketplace/manifest-schema.js';
import type { PluginType } from '../../src/types/phase20.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine all plugin types provided by a manifest by inspecting its `provides` keys.
 */
function resolveTypes(plugin: (typeof BUILTIN_PLUGINS)[number]): PluginType[] {
  const types: PluginType[] = [];
  if (plugin.provides.agents.length > 0) types.push('agent');
  if (plugin.provides.skills.length > 0) types.push('skill');
  if (plugin.provides.tools.length > 0) types.push('tool');
  if (plugin.provides.topologies.length > 0) types.push('topology');
  return types;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BUILTIN_PLUGINS catalog', () => {
  it('47 - catalog has at least 10 entries', () => {
    expect(BUILTIN_PLUGINS.length).toBeGreaterThanOrEqual(10);
  });

  it('48 - every plugin passes PluginManifestSchema validation', () => {
    const failures: string[] = [];

    for (const plugin of BUILTIN_PLUGINS) {
      const result = PluginManifestSchema.safeParse(plugin);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        failures.push(`"${plugin.name}": ${issues}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Manifest validation failures:\n${failures.join('\n')}`);
    }
  });

  it('49 - catalog covers all 4 plugin types (agent, skill, tool, topology)', () => {
    const foundTypes = new Set<PluginType>();

    for (const plugin of BUILTIN_PLUGINS) {
      for (const type of resolveTypes(plugin)) {
        foundTypes.add(type);
      }
    }

    const required: PluginType[] = ['agent', 'skill', 'tool', 'topology'];
    for (const type of required) {
      expect(foundTypes.has(type), `Expected catalog to contain at least one plugin of type "${type}"`).toBe(true);
    }
  });

  it('50 - catalog has no duplicate plugin names', () => {
    const names = BUILTIN_PLUGINS.map((p) => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
