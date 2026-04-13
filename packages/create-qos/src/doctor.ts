/**
 * doctor.ts — Environment diagnostics for Qualixar OS.
 *
 * Runs tiered checks (Environment, Qualixar OS Specific, AI/MCP) and reports
 * pass/fail/warn for each. Non-blocking — all checks run and report
 * even if some fail.
 *
 * Usage: `qos doctor` or programmatically via `runDoctor()`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isMcpConfigured, SUPPORTED_IDES } from './mcp-config.js';
import type { SupportedIde } from './mcp-config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly tier: 1 | 2 | 3;
}

export interface DoctorSummary {
  readonly passed: number;
  readonly failed: number;
  readonly warnings: number;
  readonly checks: readonly CheckResult[];
}

// ---------------------------------------------------------------------------
// Check helpers
// ---------------------------------------------------------------------------

function makeResult(
  name: string,
  tier: 1 | 2 | 3,
  status: CheckStatus,
  message: string,
): CheckResult {
  return Object.freeze({ name, tier, status, message });
}

function execSafe(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

function parseVersion(versionStr: string): number[] {
  return versionStr
    .replace(/^v/, '')
    .split('.')
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

function isVersionAtLeast(current: string, minimum: string): boolean {
  const cur = parseVersion(current);
  const min = parseVersion(minimum);

  for (let i = 0; i < min.length; i++) {
    const c = cur[i] ?? 0;
    const m = min[i] ?? 0;
    if (c > m) return true;
    if (c < m) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tier 1: Environment checks
// ---------------------------------------------------------------------------

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const minVersion = '22.0.0';

  if (isVersionAtLeast(version, minVersion)) {
    return makeResult('Node.js version', 1, 'pass', `${version} (>= ${minVersion} required)`);
  }
  return makeResult(
    'Node.js version',
    1,
    'fail',
    `${version} found, but >= ${minVersion} required. Upgrade: https://nodejs.org`,
  );
}

function checkNpm(): CheckResult {
  const version = execSafe('npm --version');

  if (version) {
    return makeResult('npm available', 1, 'pass', `npm ${version}`);
  }
  return makeResult('npm available', 1, 'fail', 'npm not found. Install Node.js from https://nodejs.org');
}

function checkQosDir(): CheckResult {
  const qosDir = join(homedir(), '.qualixar-os');

  if (existsSync(qosDir)) {
    return makeResult('~/.qualixar-os/ directory', 1, 'pass', 'Directory exists');
  }
  return makeResult(
    '~/.qualixar-os/ directory',
    1,
    'warn',
    'Directory not found. Run `npx create-qualixar-os` to set up.',
  );
}

// ---------------------------------------------------------------------------
// Tier 2: Qualixar OS Specific checks
// ---------------------------------------------------------------------------

function checkConfigYaml(): CheckResult {
  const configPath = join(homedir(), '.qualixar-os', 'config.yaml');

  if (!existsSync(configPath)) {
    return makeResult(
      'Qualixar OS config.yaml',
      2,
      'fail',
      'Not found at ~/.qualixar-os/config.yaml. Run `npx create-qualixar-os` to generate.',
    );
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    if (content.length === 0) {
      return makeResult('Qualixar OS config.yaml', 2, 'fail', 'File is empty');
    }
    // Basic YAML structure check — must contain "version:"
    if (!content.includes('version:')) {
      return makeResult('Qualixar OS config.yaml', 2, 'warn', 'File exists but may be malformed (no version field)');
    }
    return makeResult('Qualixar OS config.yaml', 2, 'pass', 'Valid config found');
  } catch {
    return makeResult('Qualixar OS config.yaml', 2, 'fail', 'Could not read config file');
  }
}

function checkEnvFile(): CheckResult {
  const envPath = join(homedir(), '.qualixar-os', '.env');

  if (!existsSync(envPath)) {
    return makeResult(
      'Qualixar OS .env file',
      2,
      'fail',
      'Not found at ~/.qualixar-os/.env. Run `npx create-qualixar-os` to generate.',
    );
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    // Check if an API key is actually set (not just the placeholder comment)
    const hasKey = content.split('\n').some((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('#') && trimmed.includes('API_KEY=') && !trimmed.endsWith('=');
    });

    if (hasKey) {
      return makeResult('Qualixar OS .env file', 2, 'pass', 'API key configured');
    }
    return makeResult(
      'Qualixar OS .env file',
      2,
      'warn',
      '.env exists but no API key set. Add your LLM_API_KEY.',
    );
  } catch {
    return makeResult('Qualixar OS .env file', 2, 'fail', 'Could not read .env file');
  }
}

function checkQclawPackage(): CheckResult {
  const version = execSafe('npx -y qualixar-os --version');

  if (version) {
    return makeResult('qualixar-os package', 2, 'pass', `Version ${version}`);
  }
  return makeResult(
    'qualixar-os package',
    2,
    'warn',
    'Could not verify qualixar-os. It will be fetched on first MCP use.',
  );
}

// ---------------------------------------------------------------------------
// Tier 3: AI/MCP checks
// ---------------------------------------------------------------------------

function checkApiKeyValid(): CheckResult {
  const envPath = join(homedir(), '.qualixar-os', '.env');

  if (!existsSync(envPath)) {
    return makeResult('API key validation', 3, 'fail', 'No .env file — cannot validate API key');
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    const keyLine = content.split('\n').find((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('#') && trimmed.startsWith('LLM_API_KEY=');
    });

    if (!keyLine) {
      return makeResult('API key validation', 3, 'fail', 'LLM_API_KEY not set in .env');
    }

    const key = keyLine.split('=').slice(1).join('=').trim();

    if (key.length === 0) {
      return makeResult('API key validation', 3, 'fail', 'LLM_API_KEY is empty');
    }

    // Format check — known prefixes
    const knownPrefixes = ['sk-', 'pk-', 'gsk_', 'AIza'];
    const hasKnownPrefix = knownPrefixes.some((prefix) => key.startsWith(prefix));

    if (hasKnownPrefix) {
      return makeResult('API key validation', 3, 'pass', 'Key format looks valid');
    }
    return makeResult(
      'API key validation',
      3,
      'warn',
      'Key is set but has unrecognized prefix. May still work.',
    );
  } catch {
    return makeResult('API key validation', 3, 'fail', 'Could not read .env for API key check');
  }
}

async function checkMcpConfigured(): Promise<CheckResult> {
  const configured: SupportedIde[] = [];

  for (const ide of SUPPORTED_IDES) {
    const isConfigured = await isMcpConfigured(ide);
    if (isConfigured) {
      configured.push(ide);
    }
  }

  if (configured.length > 0) {
    return makeResult(
      'MCP IDE configuration',
      3,
      'pass',
      `Configured in: ${configured.join(', ')}`,
    );
  }
  return makeResult(
    'MCP IDE configuration',
    3,
    'warn',
    'Qualixar OS not configured in any IDE. Run `npx create-qualixar-os` with --mcp flag.',
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all doctor checks and return a summary.
 * Checks are non-blocking — all results are reported even if some fail.
 */
export async function runDoctor(): Promise<DoctorSummary> {
  const checks: CheckResult[] = [];

  // Tier 1: Environment
  checks.push(checkNodeVersion());
  checks.push(checkNpm());
  checks.push(checkQosDir());

  // Tier 2: Qualixar OS Specific
  checks.push(checkConfigYaml());
  checks.push(checkEnvFile());
  checks.push(checkQclawPackage());

  // Tier 3: AI/MCP
  checks.push(checkApiKeyValid());
  checks.push(await checkMcpConfigured());

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;

  return Object.freeze({ passed, failed, warnings, checks: Object.freeze(checks) });
}

/**
 * Returns the list of individual check functions for testing.
 * Each returns a CheckResult (some async, some sync).
 */
export const _testExports = {
  checkNodeVersion,
  checkNpm,
  checkQosDir,
  checkConfigYaml,
  checkEnvFile,
  checkQclawPackage,
  checkApiKeyValid,
  checkMcpConfigured,
  isVersionAtLeast,
  parseVersion,
} as const;
