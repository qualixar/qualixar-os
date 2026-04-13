// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Skill Registry
 *
 * In-memory registry for plugin-contributed skills. Skills are identified by
 * name and scoped to a plugin ID so they can be bulk-unregistered when a
 * plugin is disabled or removed.
 *
 * render() replaces {{param}} placeholders in a skill's promptTemplate with
 * caller-supplied values. Missing params are left as-is (not an error) so
 * partial rendering is possible during preview.
 */

import type { PluginSkillDef, SkillRegistry } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Entry type
// ---------------------------------------------------------------------------

interface SkillEntry {
  readonly name: string;
  readonly pluginId: string;
  readonly skill: PluginSkillDef;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SkillRegistryImpl implements SkillRegistry {
  /** skill name -> entry */
  private readonly _skills = new Map<string, SkillEntry>();

  /** pluginId -> Set of skill names (for fast bulk unregister) */
  private readonly _byPlugin = new Map<string, Set<string>>();

  register(pluginId: string, skill: PluginSkillDef): void {
    const entry: SkillEntry = { name: skill.name, pluginId, skill };
    this._skills.set(skill.name, entry);

    const existing = this._byPlugin.get(pluginId) ?? new Set<string>();
    existing.add(skill.name);
    this._byPlugin.set(pluginId, existing);
  }

  unregisterByPlugin(pluginId: string): void {
    const names = this._byPlugin.get(pluginId);
    if (!names) {
      return;
    }
    for (const name of names) {
      this._skills.delete(name);
    }
    this._byPlugin.delete(pluginId);
  }

  get(name: string): PluginSkillDef | undefined {
    return this._skills.get(name)?.skill;
  }

  list(): readonly SkillEntry[] {
    return [...this._skills.values()];
  }

  /**
   * Render a skill's promptTemplate, substituting {{param}} placeholders.
   *
   * @param name - Registered skill name.
   * @param params - Values to substitute.
   * @returns Rendered string.
   * @throws Error if the skill is not registered.
   */
  render(name: string, params: Readonly<Record<string, unknown>>): string {
    const entry = this._skills.get(name);
    if (!entry) {
      throw new Error(`Skill '${name}' is not registered`);
    }

    return entry.skill.promptTemplate.replace(
      /\{\{([^}]+)\}\}/g,
      (match, key: string) => {
        const trimmed = key.trim();
        const value = params[trimmed];
        if (value === undefined || value === null) {
          // Leave placeholder intact — partial rendering is intentional
          return match;
        }
        return String(value);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistryImpl();
}
