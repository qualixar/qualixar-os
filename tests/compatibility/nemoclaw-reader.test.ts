/**
 * Qualixar OS Phase 8a -- NemoClawReader Tests
 * TDD: Tests use vi.mock for ESM module mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentSpec } from '../../src/types/common.js';

// ESM mock for node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { NemoClawReader } from '../../src/compatibility/nemoclaw-reader.js';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const sampleNemoPolicy = `
name: security-agent
description: A security-focused NemoClaw agent
agent:
  role: guardian
  model: claude-sonnet-4-6
  instructions: Enforce security policies on all incoming requests.
  tools:
    - policy_checker
    - audit_logger
security:
  level: strict
  allowed_origins:
    - "*.example.com"
rules:
  - name: no-shell-access
    action: deny
    pattern: "shell_*"
  - name: allow-read
    action: allow
    pattern: "file_read"
`;

const multiAgentNemo = `
name: team-nemo
description: Multi-agent NemoClaw policy
agents:
  - role: scanner
    model: gpt-4.1
    instructions: Scan for vulnerabilities
    tools:
      - vuln_scanner
  - role: reporter
    model: claude-sonnet-4-6
    instructions: Generate security reports
    tools:
      - report_gen
rules:
  - name: rate-limit
    action: deny
    pattern: "api_call_*"
    max_per_minute: 60
`;

const minimalNemo = `
name: minimal-nemo
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NemoClawReader', () => {
  let reader: NemoClawReader;

  beforeEach(() => {
    reader = new NemoClawReader();
    vi.clearAllMocks();
  });

  // ---- getFormat() ----

  describe('getFormat()', () => {
    it('returns "nemoclaw"', () => {
      expect(reader.getFormat()).toBe('nemoclaw');
    });
  });

  // ---- canRead() ----

  describe('canRead()', () => {
    it('returns true for nemoclaw-policy.yaml', () => {
      expect(reader.canRead('/path/nemoclaw-policy.yaml')).toBe(true);
    });

    it('returns true for nemo-config.yml', () => {
      expect(reader.canRead('/path/nemo-config.yml')).toBe(true);
    });

    it('returns true for NEMOCLAW.YAML (case-insensitive)', () => {
      expect(reader.canRead('/path/NEMOCLAW.YAML')).toBe(true);
    });

    it('returns false for conf.yaml (no nemo in name)', () => {
      expect(reader.canRead('/path/conf.yaml')).toBe(false);
    });

    it('returns false for nemoclaw.md (wrong extension)', () => {
      expect(reader.canRead('/path/nemoclaw.md')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(reader.canRead('')).toBe(false);
    });
  });

  // ---- read() ----

  describe('read()', () => {
    it('parses single-agent NemoClaw policy', async () => {
      mockReadFile.mockResolvedValueOnce(sampleNemoPolicy as any);

      const spec = await reader.read('/policies/nemoclaw-policy.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('security-agent');
      expect(spec.description).toBe('A security-focused NemoClaw agent');
      expect(spec.source.format).toBe('nemoclaw');
      expect(spec.source.originalPath).toBe('/policies/nemoclaw-policy.yaml');
      expect(spec.roles).toHaveLength(1);
      expect(spec.roles[0].role).toBe('guardian');
      expect(spec.roles[0].model).toBe('claude-sonnet-4-6');
      expect(spec.tools.map(t => t.name)).toContain('policy_checker');
      expect(spec.tools.map(t => t.name)).toContain('audit_logger');
    });

    it('parses multi-agent NemoClaw policy', async () => {
      mockReadFile.mockResolvedValueOnce(multiAgentNemo as any);

      const spec = await reader.read('/policies/nemo-team.yaml');

      expect(spec.name).toBe('team-nemo');
      expect(spec.roles).toHaveLength(2);
      expect(spec.roles[0].role).toBe('scanner');
      expect(spec.roles[1].role).toBe('reporter');
    });

    it('preserves security config and rules', async () => {
      mockReadFile.mockResolvedValueOnce(sampleNemoPolicy as any);

      const spec = await reader.read('/policies/nemoclaw-policy.yaml');

      expect(spec.config).toHaveProperty('security');
      expect(spec.config).toHaveProperty('rules');
    });

    it('handles minimal NemoClaw config', async () => {
      mockReadFile.mockResolvedValueOnce(minimalNemo as any);

      const spec = await reader.read('/policies/nemo-min.yaml');

      expect(spec.version).toBe(1);
      expect(spec.name).toBe('minimal-nemo');
      expect(spec.roles).toHaveLength(0);
    });

    it('throws when file cannot be read', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(reader.read('/missing/nemoclaw.yaml')).rejects.toThrow(
        'NemoClawReader: Cannot read file: /missing/nemoclaw.yaml',
      );
    });

    it('throws on malformed YAML', async () => {
      mockReadFile.mockResolvedValueOnce('{{bad yaml' as any);

      await expect(reader.read('/bad/nemoclaw.yaml')).rejects.toThrow(
        'NemoClawReader: Malformed YAML',
      );
    });

    it('throws when YAML parses to non-object', async () => {
      mockReadFile.mockResolvedValueOnce('just a scalar string' as any);

      await expect(reader.read('/bad/nemoclaw.yaml')).rejects.toThrow(
        'NemoClawReader: Malformed YAML',
      );
    });
  });
});
