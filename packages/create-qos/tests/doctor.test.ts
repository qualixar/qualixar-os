/**
 * Tests for doctor.ts — Environment diagnostics.
 *
 * Covers: all 3 tiers of checks, version parsing, mocked fs/spawn,
 * summary aggregation, non-blocking behavior (all checks report).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mock homedir() to use temp directory
// ---------------------------------------------------------------------------

const TEST_HOME = join(tmpdir(), `qos-test-doctor-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => TEST_HOME };
});

// Import AFTER mocks
import { runDoctor, _testExports } from '../src/doctor.js';
import type { CheckResult } from '../src/doctor.js';

const {
  checkNodeVersion,
  checkNpm,
  checkQosDir,
  checkConfigYaml,
  checkEnvFile,
  checkApiKeyValid,
  checkMcpConfigured,
  isVersionAtLeast,
  parseVersion,
} = _testExports;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Version utilities
// ---------------------------------------------------------------------------

describe('parseVersion', () => {
  it('parses "v22.13.0" correctly', () => {
    expect(parseVersion('v22.13.0')).toEqual([22, 13, 0]);
  });

  it('parses "22.0.0" without v prefix', () => {
    expect(parseVersion('22.0.0')).toEqual([22, 0, 0]);
  });

  it('handles single digit version', () => {
    expect(parseVersion('22')).toEqual([22]);
  });
});

describe('isVersionAtLeast', () => {
  it('v25.8.2 >= 22.0.0 returns true', () => {
    expect(isVersionAtLeast('v25.8.2', '22.0.0')).toBe(true);
  });

  it('v22.0.0 >= 22.0.0 returns true (equal)', () => {
    expect(isVersionAtLeast('v22.0.0', '22.0.0')).toBe(true);
  });

  it('v20.9.0 >= 22.0.0 returns false', () => {
    expect(isVersionAtLeast('v20.9.0', '22.0.0')).toBe(false);
  });

  it('v22.1.0 >= 22.0.0 returns true (minor higher)', () => {
    expect(isVersionAtLeast('v22.1.0', '22.0.0')).toBe(true);
  });

  it('v22.0.1 >= 22.0.0 returns true (patch higher)', () => {
    expect(isVersionAtLeast('v22.0.1', '22.0.0')).toBe(true);
  });

  it('v21.99.99 >= 22.0.0 returns false (major lower)', () => {
    expect(isVersionAtLeast('v21.99.99', '22.0.0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tier 1: Environment checks
// ---------------------------------------------------------------------------

describe('Tier 1: checkNodeVersion', () => {
  it('passes on current Node (>= 22)', () => {
    const result = checkNodeVersion();

    // We're running tests on Node >= 22 (project requirement)
    expect(result.status).toBe('pass');
    expect(result.tier).toBe(1);
    expect(result.name).toBe('Node.js version');
    expect(result.message).toContain(process.version);
  });
});

describe('Tier 1: checkNpm', () => {
  it('passes when npm is available', () => {
    const result = checkNpm();

    expect(result.status).toBe('pass');
    expect(result.tier).toBe(1);
    expect(result.message).toContain('npm');
  });
});

describe('Tier 1: checkQosDir', () => {
  it('warns when ~/.qualixar-os/ does not exist', () => {
    const result = checkQosDir();

    expect(result.status).toBe('warn');
    expect(result.tier).toBe(1);
    expect(result.message).toContain('not found');
  });

  it('passes when ~/.qualixar-os/ exists', () => {
    mkdirSync(join(TEST_HOME, '.qualixar-os'), { recursive: true });

    const result = checkQosDir();

    expect(result.status).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// Tier 2: Qualixar OS Specific checks
// ---------------------------------------------------------------------------

describe('Tier 2: checkConfigYaml', () => {
  it('fails when config.yaml does not exist', () => {
    const result = checkConfigYaml();

    expect(result.status).toBe('fail');
    expect(result.tier).toBe(2);
    expect(result.message).toContain('Not found');
  });

  it('passes when config.yaml exists with version field', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, 'config.yaml'), 'version: "0.1.0"\nprovider: azure\n');

    const result = checkConfigYaml();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('Valid');
  });

  it('warns when config.yaml exists but lacks version field', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, 'config.yaml'), 'provider: azure\n');

    const result = checkConfigYaml();

    expect(result.status).toBe('warn');
    expect(result.message).toContain('malformed');
  });

  it('fails when config.yaml is empty', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, 'config.yaml'), '');

    const result = checkConfigYaml();

    expect(result.status).toBe('fail');
    expect(result.message).toContain('empty');
  });
});

describe('Tier 2: checkEnvFile', () => {
  it('fails when .env does not exist', () => {
    const result = checkEnvFile();

    expect(result.status).toBe('fail');
    expect(result.tier).toBe(2);
  });

  it('passes when .env has an API key set', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=sk-test123\n');

    const result = checkEnvFile();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('API key configured');
  });

  it('warns when .env exists but API key is just a placeholder', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), '# Qualixar OS secrets\n# LLM_API_KEY=your-key-here\n');

    const result = checkEnvFile();

    expect(result.status).toBe('warn');
    expect(result.message).toContain('no API key set');
  });

  it('warns when .env has empty API key value', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=\n');

    const result = checkEnvFile();

    expect(result.status).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// Tier 3: AI/MCP checks
// ---------------------------------------------------------------------------

describe('Tier 3: checkApiKeyValid', () => {
  it('fails when no .env file exists', () => {
    const result = checkApiKeyValid();

    expect(result.status).toBe('fail');
    expect(result.tier).toBe(3);
  });

  it('passes with sk- prefix key', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=sk-abc123def456\n');

    const result = checkApiKeyValid();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('looks valid');
  });

  it('warns with unknown prefix', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=custom-abc123\n');

    const result = checkApiKeyValid();

    expect(result.status).toBe('warn');
    expect(result.message).toContain('unrecognized prefix');
  });

  it('fails when LLM_API_KEY line not present', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'SOME_OTHER_VAR=value\n');

    const result = checkApiKeyValid();

    expect(result.status).toBe('fail');
    expect(result.message).toContain('not set');
  });

  it('fails when LLM_API_KEY is empty', () => {
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=\n');

    const result = checkApiKeyValid();

    expect(result.status).toBe('fail');
    expect(result.message).toContain('empty');
  });
});

describe('Tier 3: checkMcpConfigured', () => {
  it('warns when no IDE config exists', async () => {
    const result = await checkMcpConfigured();

    expect(result.status).toBe('warn');
    expect(result.tier).toBe(3);
    expect(result.message).toContain('not configured');
  });

  it('passes when at least one IDE is configured', async () => {
    // Write a claude-code config with qos entry
    const claudeConfig = join(TEST_HOME, '.claude.json');
    writeFileSync(
      claudeConfig,
      JSON.stringify({ mcpServers: { qos: { command: 'npx' } } }),
    );

    const result = await checkMcpConfigured();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('claude-code');
  });

  it('lists all configured IDEs', async () => {
    // Configure both claude-code and cursor-global
    const claudeConfig = join(TEST_HOME, '.claude.json');
    writeFileSync(
      claudeConfig,
      JSON.stringify({ mcpServers: { qos: { command: 'npx' } } }),
    );

    const cursorDir = join(TEST_HOME, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { qos: { command: 'npx' } } }),
    );

    const result = await checkMcpConfigured();

    expect(result.status).toBe('pass');
    expect(result.message).toContain('claude-code');
    expect(result.message).toContain('cursor-global');
  });
});

// ---------------------------------------------------------------------------
// runDoctor — integration
// ---------------------------------------------------------------------------

describe('runDoctor', () => {
  it('returns summary with all check counts', async () => {
    const summary = await runDoctor();

    expect(summary.passed).toBeGreaterThanOrEqual(0);
    expect(summary.failed).toBeGreaterThanOrEqual(0);
    expect(summary.warnings).toBeGreaterThanOrEqual(0);
    expect(summary.passed + summary.failed + summary.warnings).toBe(summary.checks.length);
  });

  it('includes checks from all 3 tiers', async () => {
    const summary = await runDoctor();

    const tiers = new Set(summary.checks.map((c) => c.tier));
    expect(tiers.has(1)).toBe(true);
    expect(tiers.has(2)).toBe(true);
    expect(tiers.has(3)).toBe(true);
  });

  it('runs all 8 checks', async () => {
    const summary = await runDoctor();

    expect(summary.checks.length).toBe(8);
  });

  it('is non-blocking — reports all results even when some fail', async () => {
    // With no ~/.qualixar-os setup, several checks will fail/warn
    const summary = await runDoctor();

    // Node and npm should still pass
    const nodeCheck = summary.checks.find((c) => c.name === 'Node.js version');
    const npmCheck = summary.checks.find((c) => c.name === 'npm available');

    expect(nodeCheck?.status).toBe('pass');
    expect(npmCheck?.status).toBe('pass');

    // Config checks should fail since we haven't set anything up
    const configCheck = summary.checks.find((c) => c.name === 'Qualixar OS config.yaml');
    expect(configCheck?.status).toBe('fail');
  });

  it('all checks have required fields', async () => {
    const summary = await runDoctor();

    for (const check of summary.checks) {
      expect(check.name).toBeTruthy();
      expect(['pass', 'fail', 'warn']).toContain(check.status);
      expect(check.message).toBeTruthy();
      expect([1, 2, 3]).toContain(check.tier);
    }
  });

  it('improves when Qualixar OS is properly set up', async () => {
    // Run once without setup
    const before = await runDoctor();

    // Set up ~/.qualixar-os
    const qosDir = join(TEST_HOME, '.qualixar-os');
    mkdirSync(qosDir, { recursive: true });
    writeFileSync(
      join(qosDir, 'config.yaml'),
      'version: "0.1.0"\nprovider: azure\n',
    );
    writeFileSync(join(qosDir, '.env'), 'LLM_API_KEY=sk-test123456\n');

    // Configure claude-code MCP
    writeFileSync(
      join(TEST_HOME, '.claude.json'),
      JSON.stringify({ mcpServers: { qos: { command: 'npx' } } }),
    );

    const after = await runDoctor();

    // More passes after setup
    expect(after.passed).toBeGreaterThan(before.passed);
    expect(after.failed).toBeLessThan(before.failed);
  });
});

// ---------------------------------------------------------------------------
// CheckResult structure
// ---------------------------------------------------------------------------

describe('CheckResult immutability', () => {
  it('check results are frozen', async () => {
    const summary = await runDoctor();

    for (const check of summary.checks) {
      expect(Object.isFrozen(check)).toBe(true);
    }
  });
});
