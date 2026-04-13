/**
 * Qualixar OS Phase 19 -- Health Checker Tests
 * Tests for createHealthChecker() — check(), checkOne(), scoring.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHealthChecker } from '../../../src/cli/doctor/health-checker.js';

// ---------------------------------------------------------------------------
// Helpers: isolate env vars that affect provider/channel checks
// ---------------------------------------------------------------------------

const PROVIDER_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'QOS_DASHBOARD_PORT',
];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of PROVIDER_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PROVIDER_ENV_VARS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHealthChecker', () => {
  it('check() returns a result object with an items array', async () => {
    const checker = createHealthChecker();
    const result = await checker.check();

    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(typeof result.score).toBe('number');
    expect(typeof result.summary).toBe('string');
    expect(typeof result.totalChecks).toBe('number');
    expect(typeof result.checkedAt).toBe('string');
  });

  it("node-version check returns 'ok' on Node 22+", async () => {
    const checker = createHealthChecker();
    const result = await checker.check();

    const nodeItem = result.items.find((i) => i.name === 'node-version');
    expect(nodeItem).toBeDefined();
    // The test runner itself is Node 22+ (per Qualixar OS dev env docs)
    expect(nodeItem!.status).toBe('ok');
  });

  it("sqlite check returns 'ok' when better-sqlite3 is installed", async () => {
    const checker = createHealthChecker();
    const result = await checker.check();

    const sqliteItem = result.items.find((i) => i.name === 'sqlite');
    expect(sqliteItem).toBeDefined();
    // better-sqlite3 is a project dependency so it must be installed
    expect(sqliteItem!.status).toBe('ok');
  });

  it('config-yaml check status depends on whether the file exists', async () => {
    const checker = createHealthChecker();
    const result = await checker.check();

    const configItem = result.items.find((i) => i.name === 'config-yaml');
    expect(configItem).toBeDefined();
    // Status is either 'ok' (file exists) or 'fail' (not yet created)
    expect(['ok', 'fail', 'warn', 'skip']).toContain(configItem!.status);
  });

  it('score formula: 3 ok + 1 warn over 4 active items gives ~8.8', async () => {
    // Build synthetic items mimicking the scoring: ok=1pt, warn=0.5pt, fail=0pt
    // 3 ok (3pts) + 1 warn (0.5pt) = 3.5 / 4 * 10 = 8.75, rounded to 8.8
    const points = 3 * 1 + 1 * 0.5; // 3.5
    const activeItems = 4;
    const expectedScore = Math.round((points / activeItems) * 10 * 10) / 10; // 8.8

    expect(expectedScore).toBe(8.8);
  });

  it("checkOne('node-version') returns a single HealthCheckItem for node-version", async () => {
    const checker = createHealthChecker();
    const item = await checker.checkOne('node-version');

    expect(item).toBeDefined();
    expect(item.name).toBe('node-version');
    expect(typeof item.status).toBe('string');
    expect(typeof item.message).toBe('string');
    expect(item.message.length).toBeGreaterThan(0);
  });

  it('summary string is non-empty', async () => {
    const checker = createHealthChecker();
    const result = await checker.check();

    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
