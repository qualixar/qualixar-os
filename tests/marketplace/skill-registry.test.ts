/**
 * Qualixar OS Phase 20 -- skill-registry.test.ts
 *
 * 5 tests covering createSkillRegistry() — CRUD + render.
 * Test IDs: 1–5.
 */

import { describe, it, expect } from 'vitest';
import { createSkillRegistry } from '../../src/marketplace/skill-registry.js';
import type { PluginSkillDef } from '../../src/types/phase20.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeSkill(name: string, template = 'Hello {{name}}!'): PluginSkillDef {
  return {
    name,
    description: `Skill: ${name}`,
    promptTemplate: template,
    parameters: [
      { name: 'name', type: 'string', required: true, default: null, description: 'The name.' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSkillRegistry()', () => {
  it('1 - register() then get() returns the registered skill', () => {
    const registry = createSkillRegistry();
    const skill = makeSkill('summarize', 'Summarise: {{text}}');

    registry.register('plugin-a', skill);
    const retrieved = registry.get('summarize');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('summarize');
    expect(retrieved?.promptTemplate).toBe('Summarise: {{text}}');
  });

  it('2 - unregisterByPlugin() removes all skills belonging to the given plugin', () => {
    const registry = createSkillRegistry();

    registry.register('plugin-a', makeSkill('skill-a1'));
    registry.register('plugin-a', makeSkill('skill-a2'));
    registry.register('plugin-b', makeSkill('skill-b1'));

    registry.unregisterByPlugin('plugin-a');

    expect(registry.get('skill-a1')).toBeUndefined();
    expect(registry.get('skill-a2')).toBeUndefined();
    // plugin-b skill is unaffected
    expect(registry.get('skill-b1')).toBeDefined();
  });

  it('3 - list() returns all currently registered skills', () => {
    const registry = createSkillRegistry();

    registry.register('plugin-a', makeSkill('skill-1'));
    registry.register('plugin-b', makeSkill('skill-2'));
    registry.register('plugin-b', makeSkill('skill-3'));

    const all = registry.list();
    expect(all).toHaveLength(3);

    const names = all.map((e) => e.name);
    expect(names).toContain('skill-1');
    expect(names).toContain('skill-2');
    expect(names).toContain('skill-3');
  });

  it('4 - render() substitutes {{parameter}} placeholders in the template', () => {
    const registry = createSkillRegistry();
    const skill = makeSkill('greet', 'Hello {{name}}, you are {{age}} years old!');
    registry.register('plugin-a', skill);

    const rendered = registry.render('greet', { name: 'Varun', age: 35 });
    expect(rendered).toBe('Hello Varun, you are 35 years old!');
  });

  it('5 - get() returns undefined for an unregistered skill name', () => {
    const registry = createSkillRegistry();
    registry.register('plugin-a', makeSkill('known-skill'));

    expect(registry.get('unknown-skill')).toBeUndefined();
  });
});
