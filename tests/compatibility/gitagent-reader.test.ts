/**
 * Qualixar OS Phase 8a -- GitAgentReader Tests
 * TDD: Tests use vi.mock for ESM module mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentSpec } from '../../src/types/common.js';

// ESM mock for node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { GitAgentReader } from '../../src/compatibility/gitagent-reader.js';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const singleAgentYaml = `
name: code-assistant
description: A coding assistant agent
model: claude-sonnet-4-6
system_prompt: You are a helpful coding assistant that writes clean TypeScript.
tools:
  - code_executor
  - file_reader
  - test_runner
dependencies:
  - typescript
  - vitest
`;

const multiAgentYaml = `
name: dev-team
description: A multi-agent development team
agents:
  - role: architect
    model: claude-sonnet-4-6
    system_prompt: Design system architecture.
    tools:
      - diagram_gen
  - role: developer
    model: gpt-4.1
    prompt: Write production-ready code.
    tools:
      - code_executor
      - file_writer
    depends_on:
      - architect
  - name: reviewer
    model: claude-sonnet-4-6
    system_prompt: Review code for quality.
    tools:
      - code_analyzer
`;

const minimalAgentYaml = `
name: mini-agent
`;

const noNameYaml = `
model: claude-sonnet-4-6
system_prompt: I have no name field.
tools:
  - calculator
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitAgentReader', () => {
  let reader: GitAgentReader;

  beforeEach(() => {
    reader = new GitAgentReader();
    vi.clearAllMocks();
  });

  // ---- getFormat() ----

  describe('getFormat()', () => {
    it('returns "gitagent"', () => {
      expect(reader.getFormat()).toBe('gitagent');
    });
  });

  // ---- canRead() ----

  describe('canRead()', () => {
    it('returns true for agent.yaml', () => {
      expect(reader.canRead('/path/to/agent.yaml')).toBe(true);
    });

    it('returns true for agent.yml', () => {
      expect(reader.canRead('/path/to/agent.yml')).toBe(true);
    });

    it('returns true for AGENT.YAML (case-insensitive)', () => {
      expect(reader.canRead('/path/AGENT.YAML')).toBe(true);
    });

    it('returns false for conf.yaml', () => {
      expect(reader.canRead('/path/conf.yaml')).toBe(false);
    });

    it('returns false for SOUL.md', () => {
      expect(reader.canRead('/path/SOUL.md')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(reader.canRead('')).toBe(false);
    });
  });

  // ---- read() ----

  describe('read()', () => {
    it('parses single-agent agent.yaml', async () => {
      mockReadFile.mockResolvedValueOnce(singleAgentYaml as any);

      const spec = await reader.read('/project/agent.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('code-assistant');
      expect(spec.description).toBe('A coding assistant agent');
      expect(spec.source.format).toBe('gitagent');
      expect(spec.source.originalPath).toBe('/project/agent.yaml');
      expect(spec.roles).toHaveLength(1);
      expect(spec.roles[0].model).toBe('claude-sonnet-4-6');
      expect(spec.roles[0].systemPrompt).toContain('helpful coding assistant');
      expect(spec.tools.map(t => t.name)).toContain('code_executor');
      expect(spec.tools.map(t => t.name)).toContain('file_reader');
      expect(spec.tools.map(t => t.name)).toContain('test_runner');
    });

    it('parses multi-agent agent.yaml', async () => {
      mockReadFile.mockResolvedValueOnce(multiAgentYaml as any);

      const spec = await reader.read('/project/agent.yaml');

      expect(spec.name).toBe('dev-team');
      expect(spec.roles).toHaveLength(3);
      expect(spec.roles[0].role).toBe('architect');
      expect(spec.roles[1].role).toBe('developer');
      expect(spec.roles[1].dependsOn).toEqual(['architect']);
      expect(spec.roles[2].role).toBe('reviewer');
    });

    it('handles minimal agent.yaml', async () => {
      mockReadFile.mockResolvedValueOnce(minimalAgentYaml as any);

      const spec = await reader.read('/project/agent.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('mini-agent');
      expect(spec.roles).toHaveLength(0);
    });

    it('uses default name when no name field', async () => {
      mockReadFile.mockResolvedValueOnce(noNameYaml as any);

      const spec = await reader.read('/project/agent.yaml');

      expect(spec.name).toBe('gitagent-agent');
    });

    it('throws when file cannot be read', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(reader.read('/missing/agent.yaml')).rejects.toThrow(
        'GitAgentReader: Cannot read file: /missing/agent.yaml',
      );
    });

    it('throws on malformed YAML', async () => {
      mockReadFile.mockResolvedValueOnce('{{bad yaml' as any);

      await expect(reader.read('/bad/agent.yaml')).rejects.toThrow(
        'GitAgentReader: Malformed YAML',
      );
    });

    it('preserves extra config keys like dependencies', async () => {
      mockReadFile.mockResolvedValueOnce(singleAgentYaml as any);

      const spec = await reader.read('/project/agent.yaml');

      expect(spec.config).toHaveProperty('dependencies');
    });

    it('throws when YAML parses to non-object', async () => {
      mockReadFile.mockResolvedValueOnce('true' as any);

      await expect(reader.read('/bad/agent.yaml')).rejects.toThrow(
        'GitAgentReader: Malformed YAML',
      );
    });
  });
});
