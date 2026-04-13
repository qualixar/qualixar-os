/**
 * Qualixar OS Phase 8a -- OpenClawReader Tests
 * TDD: Tests use vi.mock for ESM module mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentSpec } from '../../src/types/common.js';

// ESM mock for node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { OpenClawReader } from '../../src/compatibility/openclaw-reader.js';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const sampleSoulMd = `---
name: TestAgent
description: A test agent for unit testing.
model: claude-sonnet-4-6
personality: helpful
---
# TestAgent

## Description
A test agent for unit testing.

## Roles
- researcher: Finds information
- writer: Creates content

## Tools
- web_search: Search the web
- file_reader: Read files from disk

## Config
model: claude-sonnet-4-6
temperature: 0.7
`;

const minimalSoulMd = `---
name: MinimalAgent
---
Just a minimal agent.
`;

const noFrontmatterSoulMd = `# SimpleAgent

## Description
An agent with no YAML frontmatter.

## Tools
- calculator: Do math
`;

const emptyBodySoulMd = `---
name: EmptyBody
description: Agent with no body
model: gpt-4.1
---
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenClawReader', () => {
  let reader: OpenClawReader;

  beforeEach(() => {
    reader = new OpenClawReader();
    vi.clearAllMocks();
  });

  // ---- getFormat() ----

  describe('getFormat()', () => {
    it('returns "openclaw"', () => {
      expect(reader.getFormat()).toBe('openclaw');
    });
  });

  // ---- canRead() ----

  describe('canRead()', () => {
    it('returns true for SOUL.md', () => {
      expect(reader.canRead('/path/to/SOUL.md')).toBe(true);
    });

    it('returns true for soul.md (case-insensitive)', () => {
      expect(reader.canRead('/agents/soul.md')).toBe(true);
    });

    it('returns true for custom.soul.md', () => {
      expect(reader.canRead('/agents/custom.soul.md')).toBe(true);
    });

    it('returns false for README.md', () => {
      expect(reader.canRead('/path/README.md')).toBe(false);
    });

    it('returns false for conf.yaml', () => {
      expect(reader.canRead('/path/conf.yaml')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(reader.canRead('')).toBe(false);
    });
  });

  // ---- read() ----

  describe('read()', () => {
    it('parses full SOUL.md with frontmatter and body', async () => {
      mockReadFile.mockResolvedValueOnce(sampleSoulMd as any);

      const spec = await reader.read('/project/SOUL.md');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('TestAgent');
      expect(spec.description).toBe('A test agent for unit testing.');
      expect(spec.source.format).toBe('openclaw');
      expect(spec.source.originalPath).toBe('/project/SOUL.md');
      expect(spec.roles.length).toBeGreaterThanOrEqual(1);
      expect(spec.roles[0].model).toBe('claude-sonnet-4-6');
      expect(spec.tools.length).toBeGreaterThanOrEqual(2);
      expect(spec.tools.map(t => t.name)).toContain('web_search');
      expect(spec.tools.map(t => t.name)).toContain('file_reader');
    });

    it('parses minimal SOUL.md with only name in frontmatter', async () => {
      mockReadFile.mockResolvedValueOnce(minimalSoulMd as any);

      const spec = await reader.read('/project/SOUL.md');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('MinimalAgent');
      expect(spec.description).toBe('');
      expect(spec.roles.length).toBe(1);
    });

    it('parses SOUL.md with no YAML frontmatter', async () => {
      mockReadFile.mockResolvedValueOnce(noFrontmatterSoulMd as any);

      const spec = await reader.read('/project/agents/SOUL.md');

      expect(spec.version).toBe(1);
      // Name falls back to parent directory name
      expect(spec.name).toBe('agents');
      expect(spec.tools.map(t => t.name)).toContain('calculator');
    });

    it('handles SOUL.md with empty body', async () => {
      mockReadFile.mockResolvedValueOnce(emptyBodySoulMd as any);

      const spec = await reader.read('/project/SOUL.md');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('EmptyBody');
      expect(spec.roles[0].model).toBe('gpt-4.1');
    });

    it('throws when file cannot be read', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(reader.read('/missing/SOUL.md')).rejects.toThrow(
        'OpenClawReader: Cannot read file: /missing/SOUL.md',
      );
    });

    it('returns valid AgentSpec structure', async () => {
      mockReadFile.mockResolvedValueOnce(sampleSoulMd as any);

      const spec = await reader.read('/project/SOUL.md');

      // Structural assertions
      expect(spec).toHaveProperty('version', 1);
      expect(spec).toHaveProperty('name');
      expect(spec).toHaveProperty('description');
      expect(spec).toHaveProperty('roles');
      expect(spec).toHaveProperty('tools');
      expect(spec).toHaveProperty('config');
      expect(spec).toHaveProperty('source');
      expect(spec.source).toHaveProperty('format', 'openclaw');
    });

    it('stores extra frontmatter fields in config', async () => {
      mockReadFile.mockResolvedValueOnce(sampleSoulMd as any);

      const spec = await reader.read('/project/SOUL.md');

      expect(spec.config).toHaveProperty('personality', 'helpful');
    });

    it('handles frontmatter with only opening --- delimiter', async () => {
      const brokenFrontmatter = `---
name: BrokenAgent
No closing delimiter here
`;
      mockReadFile.mockResolvedValueOnce(brokenFrontmatter as any);

      const spec = await reader.read('/project/agents/SOUL.md');

      // Falls back to treating the whole thing as body (no frontmatter)
      expect(spec.name).toBe('agents');
    });

    it('handles frontmatter with tools array containing non-string items', async () => {
      const weirdTools = `---
name: WeirdTools
tools:
  - valid_tool
  - 42
  - true
---
Body content here.
`;
      mockReadFile.mockResolvedValueOnce(weirdTools as any);

      const spec = await reader.read('/project/SOUL.md');

      // Should only include the string tool
      expect(spec.tools.map(t => t.name)).toContain('valid_tool');
      expect(spec.tools).toHaveLength(1);
    });
  });
});
