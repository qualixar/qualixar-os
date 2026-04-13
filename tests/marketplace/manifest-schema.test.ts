/**
 * Qualixar OS Phase 20 -- manifest-schema.test.ts
 *
 * 7 tests covering PluginManifestSchema validation.
 */

import { describe, it, expect } from 'vitest';
import { PluginManifestSchema } from '../../src/marketplace/manifest-schema.js';

// ---------------------------------------------------------------------------
// Helper: build a fully valid manifest (all required fields populated)
// ---------------------------------------------------------------------------

function validManifest() {
  return {
    name: 'my-plugin',
    version: '1.0.0',
    author: 'Qualixar',
    description: 'A test plugin that does something useful for Qualixar OS.',
    license: 'MIT',
    provides: {
      agents: [],
      skills: [],
      tools: [],
      topologies: [],
    },
    requires: {
      minVersion: '2.0.0',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginManifestSchema', () => {
  it('1 - valid manifest passes validation', () => {
    const result = PluginManifestSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
  });

  it('2 - name rejects uppercase characters', () => {
    const result = PluginManifestSchema.safeParse({ ...validManifest(), name: 'MyPlugin' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toMatch(/lowercase/i);
    }
  });

  it('2b - name rejects special characters other than hyphens', () => {
    const result = PluginManifestSchema.safeParse({ ...validManifest(), name: 'my_plugin!' });
    expect(result.success).toBe(false);
  });

  it('3 - version rejects non-semver strings', () => {
    const result = PluginManifestSchema.safeParse({ ...validManifest(), version: '1.0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toMatch(/semver/i);
    }
  });

  it('4 - provides defaults to empty arrays when omitted', () => {
    const input = {
      ...validManifest(),
      provides: {
        // agents, skills, tools, topologies all omitted — should default to []
      },
    };
    const result = PluginManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provides.agents).toEqual([]);
      expect(result.data.provides.skills).toEqual([]);
      expect(result.data.provides.tools).toEqual([]);
      expect(result.data.provides.topologies).toEqual([]);
    }
  });

  it('5 - config field type is validated via discriminated union', () => {
    // 'file' is not a valid type — should fail
    const result = PluginManifestSchema.safeParse({
      ...validManifest(),
      config: {
        myField: {
          type: 'file',
          description: 'A file field',
          default: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('5b - config with valid select type passes', () => {
    const result = PluginManifestSchema.safeParse({
      ...validManifest(),
      config: {
        myField: {
          type: 'select',
          description: 'Choose an option.',
          default: 'a',
          enum: ['a', 'b', 'c'],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('6 - tool implementation discriminated union validates correctly', () => {
    const withValidTool = {
      ...validManifest(),
      provides: {
        agents: [],
        skills: [],
        tools: [
          {
            name: 'my-tool',
            description: 'Does something.',
            inputSchema: { type: 'object', properties: {} },
            implementation: { type: 'builtin', handler: 'built-in' },
          },
        ],
        topologies: [],
      },
    };
    expect(PluginManifestSchema.safeParse(withValidTool).success).toBe(true);

    // Invalid implementation type
    const withInvalidImpl = {
      ...validManifest(),
      provides: {
        ...withValidTool.provides,
        tools: [
          {
            name: 'bad-tool',
            description: 'Has bad impl.',
            inputSchema: {},
            implementation: { type: 'grpc', endpoint: 'localhost:50051' },
          },
        ],
      },
    };
    expect(PluginManifestSchema.safeParse(withInvalidImpl).success).toBe(false);
  });

  it('7 - requires defaults providers/tools/plugins to empty arrays', () => {
    const result = PluginManifestSchema.safeParse({
      ...validManifest(),
      requires: { minVersion: '1.2.3' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requires.providers).toEqual([]);
      expect(result.data.requires.tools).toEqual([]);
      expect(result.data.requires.plugins).toEqual([]);
    }
  });
});
