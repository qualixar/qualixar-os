/**
 * Tests for Qualixar OS Phase Pivot-2: Skill Package Format
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 7.6
 * Tests: RED 23-27
 */

import { describe, it, expect } from 'vitest';
import {
  SkillManifestSchema,
  scopeToolName,
  type SkillManifest,
} from '../../src/marketplace/skill-package.js';

// ---------------------------------------------------------------------------
// Valid manifest fixture
// ---------------------------------------------------------------------------

function validManifest(): Record<string, unknown> {
  return {
    name: '@qos/skill-github-pr',
    version: '1.2.0',
    description: 'Create, review, and manage GitHub pull requests',
    author: { name: 'Test Author' },
    license: 'MIT',
    category: 'code-dev',
    tags: ['github', 'pull-request'],
    tools: [
      {
        name: 'create_pr',
        description: 'Create a pull request',
        inputSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    ],
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./dist/index.js'],
    },
  };
}

// ---------------------------------------------------------------------------
// RED 23: Validate valid manifest
// ---------------------------------------------------------------------------

describe('SkillManifestSchema', () => {
  it('should validate a valid skill manifest (RED 23)', () => {
    const result = SkillManifestSchema.parse(validManifest());
    expect(result.name).toBe('@qos/skill-github-pr');
    expect(result.version).toBe('1.2.0');
    expect(result.tools).toHaveLength(1);
    expect(result.transport.type).toBe('stdio');
    expect(result.category).toBe('code-dev');
  });

  it('should apply defaults for optional fields', () => {
    const result = SkillManifestSchema.parse(validManifest());
    expect(result.license).toBe('MIT');
    expect(result.pricing.model).toBe('free');
    expect(result.compatibility.qos).toBe('>=2.0.0');
    expect(result.compatibility.node).toBe('>=20.0.0');
  });

  // ---------------------------------------------------------------------------
  // RED 24: Reject invalid category
  // ---------------------------------------------------------------------------

  it('should reject manifest with invalid category (RED 24)', () => {
    const bad = { ...validManifest(), category: 'invalid-category' };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // RED 25: Reject manifest with no tools
  // ---------------------------------------------------------------------------

  it('should reject manifest with empty tools array (RED 25)', () => {
    const bad = { ...validManifest(), tools: [] };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // RED 27: Enforce semver format
  // ---------------------------------------------------------------------------

  it('should enforce semver format (RED 27)', () => {
    const bad = { ...validManifest(), version: 'not-a-version' };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });

  it('should accept valid semver versions', () => {
    for (const v of ['1.0.0', '0.1.0', '10.20.30', '1.0.0-beta.1']) {
      const m = { ...validManifest(), version: v };
      expect(SkillManifestSchema.parse(m).version).toBe(v);
    }
  });

  // ---------------------------------------------------------------------------
  // Name format
  // ---------------------------------------------------------------------------

  it('should reject names without scope', () => {
    const bad = { ...validManifest(), name: 'no-scope' };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });

  it('should accept scoped names', () => {
    for (const n of ['@qos/skill-test', 'my-org/my-skill', '@scope/name']) {
      const m = { ...validManifest(), name: n };
      expect(SkillManifestSchema.parse(m).name).toBe(n);
    }
  });

  // ---------------------------------------------------------------------------
  // Transport validation
  // ---------------------------------------------------------------------------

  it('should accept stdio transport', () => {
    const m = validManifest();
    const result = SkillManifestSchema.parse(m);
    expect(result.transport.type).toBe('stdio');
    expect(result.transport.command).toBe('node');
  });

  it('should accept streamable-http transport', () => {
    const m = {
      ...validManifest(),
      transport: { type: 'streamable-http', url: 'https://example.com/mcp' },
    };
    const result = SkillManifestSchema.parse(m);
    expect(result.transport.type).toBe('streamable-http');
    expect(result.transport.url).toBe('https://example.com/mcp');
  });

  // ---------------------------------------------------------------------------
  // Description length
  // ---------------------------------------------------------------------------

  it('should reject descriptions over 200 chars', () => {
    const bad = { ...validManifest(), description: 'A'.repeat(201) };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });

  // ---------------------------------------------------------------------------
  // Tags limit
  // ---------------------------------------------------------------------------

  it('should reject more than 10 tags', () => {
    const bad = { ...validManifest(), tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) };
    expect(() => SkillManifestSchema.parse(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RED 26: Scope tool names
// ---------------------------------------------------------------------------

describe('scopeToolName (RED 26)', () => {
  it('should prefix tool name with package name', () => {
    expect(scopeToolName('@qos/skill-github', 'create_pr'))
      .toBe('@qos/skill-github/create_pr');
  });

  it('should handle already-scoped names', () => {
    expect(scopeToolName('@qos/skill-github', '@qos/skill-github/create_pr'))
      .toBe('@qos/skill-github/create_pr');
  });
});
