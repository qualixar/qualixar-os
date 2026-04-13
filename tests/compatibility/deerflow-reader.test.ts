/**
 * Qualixar OS Phase 8a -- DeerFlowReader Tests
 * TDD: Tests use vi.mock for ESM module mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentSpec } from '../../src/types/common.js';

// ESM mock for node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { DeerFlowReader } from '../../src/compatibility/deerflow-reader.js';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const sampleConfYaml = `
name: research-workflow
description: A multi-agent research pipeline
agents:
  - role: researcher
    model: claude-sonnet-4-6
    instructions: Find relevant information on the topic.
    tools:
      - web_search
      - arxiv_search
  - role: writer
    model: gpt-4.1
    instructions: Write a comprehensive report.
    tools:
      - text_editor
    depends_on:
      - researcher
settings:
  max_iterations: 5
  timeout: 300
`;

const workflowNestedYaml = `
workflow:
  name: nested-workflow
  description: Workflow with nested structure
  agents:
    - name: agent-alpha
      model: claude-sonnet-4-6
      system_prompt: You are agent alpha.
      tools:
        - code_executor
`;

const minimalConfYaml = `
name: minimal-flow
`;

const noAgentsYaml = `
name: solo-config
description: A config with no agents
settings:
  debug: true
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeerFlowReader', () => {
  let reader: DeerFlowReader;

  beforeEach(() => {
    reader = new DeerFlowReader();
    vi.clearAllMocks();
  });

  // ---- getFormat() ----

  describe('getFormat()', () => {
    it('returns "deerflow"', () => {
      expect(reader.getFormat()).toBe('deerflow');
    });
  });

  // ---- canRead() ----

  describe('canRead()', () => {
    it('returns true for conf.yaml', () => {
      expect(reader.canRead('/path/to/conf.yaml')).toBe(true);
    });

    it('returns true for conf.yml', () => {
      expect(reader.canRead('/path/to/conf.yml')).toBe(true);
    });

    it('returns true for CONF.YAML (case-insensitive)', () => {
      expect(reader.canRead('/path/CONF.YAML')).toBe(true);
    });

    it('returns false for agent.yaml', () => {
      expect(reader.canRead('/path/agent.yaml')).toBe(false);
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
    it('parses full conf.yaml with agents and settings', async () => {
      mockReadFile.mockResolvedValueOnce(sampleConfYaml as any);

      const spec = await reader.read('/project/conf.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('research-workflow');
      expect(spec.description).toBe('A multi-agent research pipeline');
      expect(spec.source.format).toBe('deerflow');
      expect(spec.source.originalPath).toBe('/project/conf.yaml');
      expect(spec.roles).toHaveLength(2);
      expect(spec.roles[0].role).toBe('researcher');
      expect(spec.roles[0].model).toBe('claude-sonnet-4-6');
      expect(spec.roles[1].role).toBe('writer');
      expect(spec.roles[1].dependsOn).toEqual(['researcher']);
      expect(spec.tools.map(t => t.name)).toContain('web_search');
      expect(spec.tools.map(t => t.name)).toContain('arxiv_search');
      expect(spec.tools.map(t => t.name)).toContain('text_editor');
    });

    it('parses nested workflow structure', async () => {
      mockReadFile.mockResolvedValueOnce(workflowNestedYaml as any);

      const spec = await reader.read('/project/conf.yaml');

      expect(spec.name).toBe('nested-workflow');
      expect(spec.description).toBe('Workflow with nested structure');
      expect(spec.roles).toHaveLength(1);
      expect(spec.roles[0].role).toBe('agent-alpha');
    });

    it('parses minimal conf.yaml with only name', async () => {
      mockReadFile.mockResolvedValueOnce(minimalConfYaml as any);

      const spec = await reader.read('/project/conf.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('minimal-flow');
      expect(spec.roles).toHaveLength(0);
      expect(spec.tools).toHaveLength(0);
    });

    it('handles config with no agents', async () => {
      mockReadFile.mockResolvedValueOnce(noAgentsYaml as any);

      const spec = await reader.read('/project/conf.yaml');

      expect(spec.name).toBe('solo-config');
      expect(spec.roles).toHaveLength(0);
    });

    it('throws when file cannot be read', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(reader.read('/missing/conf.yaml')).rejects.toThrow(
        'DeerFlowReader: Cannot read file: /missing/conf.yaml',
      );
    });

    it('throws on malformed YAML', async () => {
      mockReadFile.mockResolvedValueOnce('{{{{invalid yaml}}' as any);

      await expect(reader.read('/bad/conf.yaml')).rejects.toThrow(
        'DeerFlowReader: Malformed YAML',
      );
    });

    it('preserves extra config keys', async () => {
      mockReadFile.mockResolvedValueOnce(sampleConfYaml as any);

      const spec = await reader.read('/project/conf.yaml');

      expect(spec.config).toHaveProperty('settings');
    });

    it('throws when YAML parses to non-object', async () => {
      mockReadFile.mockResolvedValueOnce('42' as any);

      await expect(reader.read('/bad/conf.yaml')).rejects.toThrow(
        'DeerFlowReader: Malformed YAML',
      );
    });
  });
});
