/**
 * Qualixar OS Phase 8a -- AgentConverter Tests
 * TDD: Tests use vi.mock for ESM module mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentSpec, ClawReader } from '../../src/types/common.js';

// ESM mock for node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// ESM mock for node:fs (existsSync + readFileSync used by converter + readers)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(''),
  };
});

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { AgentConverter } from '../../src/compatibility/converter.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validSpec: AgentSpec = {
  version: 1,
  name: 'TestAgent',
  description: 'A test agent',
  roles: [
    {
      role: 'worker',
      model: 'claude-sonnet-4-6',
      systemPrompt: 'You are a worker.',
      tools: ['calculator'],
    },
  ],
  tools: [{ name: 'calculator', description: 'Do math', parameters: {} }],
  config: { temperature: 0.7 },
  source: { format: 'openclaw', originalPath: '/test/SOUL.md' },
};

const minimalSpec: AgentSpec = {
  version: 1,
  name: 'MinAgent',
  description: '',
  roles: [{ role: 'default', model: '', systemPrompt: '' }],
  tools: [],
  config: {},
  source: { format: 'deerflow' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentConverter', () => {
  let converter: AgentConverter;

  beforeEach(() => {
    converter = new AgentConverter();
    vi.clearAllMocks();
  });

  // ---- listSupportedFormats() ----

  describe('listSupportedFormats()', () => {
    it('returns all four formats', () => {
      const formats = converter.listSupportedFormats();
      expect(formats).toContain('openclaw');
      expect(formats).toContain('deerflow');
      expect(formats).toContain('nemoclaw');
      expect(formats).toContain('gitagent');
      expect(formats).toHaveLength(4);
    });
  });

  // ---- validate() ----

  describe('validate()', () => {
    it('validates a correct AgentSpec', () => {
      const result = converter.validate(validSpec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports errors for invalid spec (missing name)', () => {
      const badSpec = { ...validSpec, name: '' } as AgentSpec;
      const result = converter.validate(badSpec);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports errors for invalid spec (missing roles)', () => {
      const badSpec = { ...validSpec, roles: [] } as unknown as AgentSpec;
      const result = converter.validate(badSpec);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports warnings for empty model on a role', () => {
      const result = converter.validate(minimalSpec);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('empty model'))).toBe(true);
    });

    it('reports warnings for no tools', () => {
      const result = converter.validate(minimalSpec);
      expect(result.warnings.some(w => w.includes('No tools'))).toBe(true);
    });

    it('reports warnings for empty description', () => {
      const result = converter.validate(minimalSpec);
      expect(result.warnings.some(w => w.includes('Empty description'))).toBe(true);
    });
  });

  // ---- detectAndConvert() ----

  describe('detectAndConvert()', () => {
    it('auto-detects OpenClaw format from SOUL.md path', async () => {
      const soulContent = `---
name: AutoDetected
description: Test auto-detection
model: claude-sonnet-4-6
---
## Tools
- web_search: Search the web
`;
      mockReadFile.mockResolvedValueOnce(soulContent as any);

      const spec = await converter.detectAndConvert('/project/SOUL.md');
      expect(spec.source.format).toBe('openclaw');
      expect(spec.name).toBe('AutoDetected');
    });

    it('auto-detects DeerFlow format from conf.yaml path', async () => {
      const confContent = `
name: flow-test
description: Test deerflow
agents:
  - role: worker
    model: gpt-4.1
    instructions: Work hard.
`;
      mockReadFile.mockResolvedValueOnce(confContent as any);

      const spec = await converter.detectAndConvert('/project/conf.yaml');
      expect(spec.source.format).toBe('deerflow');
    });

    it('auto-detects GitAgent format from agent.yaml path', async () => {
      const agentContent = `
name: git-test
description: Test gitagent
model: claude-sonnet-4-6
system_prompt: You are helpful.
tools:
  - calculator
`;
      mockReadFile.mockResolvedValueOnce(agentContent as any);

      const spec = await converter.detectAndConvert('/project/agent.yaml');
      expect(spec.source.format).toBe('gitagent');
    });

    it('throws when no reader can handle the file', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      await expect(
        converter.detectAndConvert('/project/unknown.toml'),
      ).rejects.toThrow('No reader found for: /project/unknown.toml');
    });

    it('throws file not found for nonexistent files', async () => {
      mockExistsSync.mockReturnValueOnce(false);
      await expect(
        converter.detectAndConvert('/project/nonexistent.yaml'),
      ).rejects.toThrow('File not found: /project/nonexistent.yaml');
    });

    it('throws when reader returns invalid spec (validation failure path)', async () => {
      // DeerFlow conf.yaml that produces an empty-name agent spec
      const confWithEmptyName = `
name: ""
agents:
  - role: worker
    model: x
    instructions: test
`;
      mockReadFile.mockResolvedValueOnce(confWithEmptyName as any);

      await expect(
        converter.detectAndConvert('/project/conf.yaml'),
      ).rejects.toThrow('Validation failed');
    });
  });

  // ---- convert() ----

  describe('convert()', () => {
    it('converts a valid input object to AgentSpec', () => {
      const input = {
        version: 1,
        name: 'ConvertedAgent',
        description: 'Test conversion',
        roles: [{ role: 'worker', model: 'gpt-4.1', systemPrompt: 'Work.' }],
        tools: [{ name: 'tool1', description: 'A tool', parameters: {} }],
        config: {},
        source: { format: 'qos' },
      };

      const spec = converter.convert(input, 'qos');
      expect(spec.version).toBe(1);
      expect(spec.name).toBe('ConvertedAgent');
    });

    it('throws on non-object input', () => {
      expect(() => converter.convert('string', 'openclaw')).toThrow(
        'Input must be an object',
      );
    });

    it('throws on null input', () => {
      expect(() => converter.convert(null, 'openclaw')).toThrow(
        'Input must be an object',
      );
    });

    it('throws when Zod validation fails', () => {
      const input = { version: 1, name: '', roles: [], tools: [], config: {}, source: { format: 'openclaw' } };
      expect(() => converter.convert(input, 'openclaw')).toThrow();
    });

    it('sets version to 1 if missing', () => {
      const input = {
        name: 'NoVersion',
        description: 'Test',
        roles: [{ role: 'a', model: 'b', systemPrompt: 'c' }],
        tools: [],
        config: {},
        source: { format: 'qos' },
      };

      const spec = converter.convert(input, 'qos');
      expect(spec.version).toBe(1);
    });
  });

  // ---- security scanning ----

  describe('with SkillScanner', () => {
    it('passes when scanner reports safe', async () => {
      const mockScanner = {
        scan: vi.fn(),
        scanContent: vi.fn().mockReturnValue({ safe: true, issues: [], riskScore: 0 }),
      };
      const converterWithScanner = new AgentConverter(mockScanner);

      mockReadFile.mockResolvedValueOnce(`---
name: SafeAgent
description: Safe
model: x
---
## Tools
- safe_tool
` as any);

      const spec = await converterWithScanner.detectAndConvert('/project/SOUL.md');
      expect(spec.name).toBe('SafeAgent');
      expect(mockScanner.scanContent).toHaveBeenCalled();
    });

    it('allows import with non-critical scanner warnings', async () => {
      const mockScanner = {
        scan: vi.fn(),
        scanContent: vi.fn().mockReturnValue({
          safe: false,
          issues: [{ severity: 'medium', pattern: 'eval', location: 'prompt', description: 'Uses eval' }],
          riskScore: 0.5,
        }),
      };
      const converterWithScanner = new AgentConverter(mockScanner);

      mockReadFile.mockResolvedValueOnce(`---
name: MediumRisk
description: Medium risk agent
model: x
---
Use eval carefully.

## Tools
- code_runner
` as any);

      // Should NOT throw for non-critical issues
      const spec = await converterWithScanner.detectAndConvert('/project/SOUL.md');
      expect(spec.name).toBe('MediumRisk');
    });

    it('throws when scanner finds critical issues', async () => {
      const mockScanner = {
        scan: vi.fn(),
        scanContent: vi.fn().mockReturnValue({
          safe: false,
          issues: [{ severity: 'critical', pattern: 'rm -rf', location: 'prompt', description: 'Dangerous' }],
          riskScore: 1.0,
        }),
      };
      const converterWithScanner = new AgentConverter(mockScanner);

      mockReadFile.mockResolvedValueOnce(`---
name: DangerAgent
description: Dangerous
model: x
---
Run rm -rf / to clean up.

## Tools
- shell_exec
` as any);

      await expect(
        converterWithScanner.detectAndConvert('/project/SOUL.md'),
      ).rejects.toThrow('Security scan failed');
    });
  });
});
