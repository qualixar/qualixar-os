/**
 * Qualixar OS Phase 19 -- Wizard Runner Tests
 * Tests for createWizardRunner(), generateConfig(), and writeConfig().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createWizardRunner,
  generateConfig,
  writeConfig,
  type PromptFunctions,
} from '../../../src/cli/wizard/wizard-runner.js';
import type { WizardResult } from '../../../src/types/phase19.js';

// ---------------------------------------------------------------------------
// Provider env vars to clean up between tests
// ---------------------------------------------------------------------------

const PROVIDER_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_AI_API_KEY',
  'GOOGLE_API_KEY',
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
// Helpers
// ---------------------------------------------------------------------------

function makeMockPromptFn(overrides: Partial<PromptFunctions> = {}): PromptFunctions {
  return {
    select: vi.fn().mockResolvedValue('anthropic'),
    input: vi.fn().mockResolvedValue('.'),
    confirm: vi.fn().mockResolvedValue(true),
    password: vi.fn().mockResolvedValue('sk-test-key-12345'),
    checkbox: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeCompleteWizardResult(overrides: Partial<WizardResult> = {}): WizardResult {
  return {
    mode: 'quick',
    provider: 'anthropic',
    apiKeyMode: 'env_ref',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-6',
    fallbackModel: 'claude-haiku-4-5',
    embeddingProvider: 'anthropic',
    embeddingModel: null,
    dashboardEnabled: true,
    dashboardPort: 3333,
    channels: [],
    budgetUsd: 10,
    memoryEnabled: true,
    securityContainerIsolation: false,
    allowedPaths: ['./'],
    deniedCommands: ['rm -rf', 'sudo'],
    workspaceDir: process.cwd(),
    mcpServers: [],
    a2aEndpoints: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWizardRunner', () => {
  it('quick wizard completes with all required fields in WizardResult', async () => {
    // No provider env vars set — wizard will use defaults from mocked prompts
    const mockFn = makeMockPromptFn({
      select: vi.fn()
        .mockResolvedValueOnce('anthropic')  // provider
        .mockResolvedValueOnce('env_ref')    // api key mode
        .mockResolvedValueOnce('same'),      // embedding
      input: vi.fn()
        .mockResolvedValueOnce('ANTHROPIC_API_KEY') // api key env
        .mockResolvedValueOnce('./'),               // workspace
      confirm: vi.fn().mockResolvedValue(true),
      checkbox: vi.fn().mockResolvedValue([]),
      password: vi.fn().mockResolvedValue('sk-test-12345'),
    });

    const runner = createWizardRunner(mockFn);
    const result = await runner.run('quick');

    expect(result).toBeDefined();
    expect(result.mode).toBe('quick');
    expect(typeof result.provider).toBe('string');
    expect(result.provider.length).toBeGreaterThan(0);
    expect(typeof result.model).toBe('string');
    expect(typeof result.dashboardEnabled).toBe('boolean');
    expect(Array.isArray(result.channels)).toBe(true);
    expect(typeof result.workspaceDir).toBe('string');
  });

  it('quick wizard uses detected provider as default when ANTHROPIC_API_KEY is set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-detected-key';

    const mockFn = makeMockPromptFn({
      select: vi.fn()
        .mockResolvedValueOnce('anthropic')  // provider (default is detected)
        .mockResolvedValueOnce('same'),      // embedding
      confirm: vi.fn().mockResolvedValue(true), // use detected key
      input: vi.fn().mockResolvedValue('./'),   // workspace
      checkbox: vi.fn().mockResolvedValue([]),
      password: vi.fn().mockResolvedValue('sk-test-12345'),
    });

    const runner = createWizardRunner(mockFn);
    const result = await runner.run('quick');

    expect(result.provider).toBe('anthropic');
    // When a key is detected, apiKeyMode should be env_ref
    expect(result.apiKeyMode).toBe('env_ref');
  });

  it('generateConfig() produces a valid config object without throwing', () => {
    const wizardResult = makeCompleteWizardResult();

    expect(() => generateConfig(wizardResult)).not.toThrow();

    const config = generateConfig(wizardResult);
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('generateConfig() includes discord/telegram/webhook channels from result', () => {
    const wizardResult = makeCompleteWizardResult({
      channels: ['discord', 'telegram', 'webhook'],
    });

    const config = generateConfig(wizardResult);
    const channels = config['channels'] as Record<string, unknown>;

    expect(channels).toHaveProperty('discord');
    expect(channels).toHaveProperty('telegram');
    expect(channels).toHaveProperty('webhook');
  });

  it('runNonInteractive() completes without calling any prompt function', () => {
    const mockFn = makeMockPromptFn();
    const runner = createWizardRunner(mockFn);

    const result = runner.runNonInteractive({ provider: 'openai', model: 'gpt-4.1' });

    expect(result).toBeDefined();
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4.1');

    // None of the prompt functions should have been called
    expect(mockFn.select).not.toHaveBeenCalled();
    expect(mockFn.input).not.toHaveBeenCalled();
    expect(mockFn.confirm).not.toHaveBeenCalled();
    expect(mockFn.password).not.toHaveBeenCalled();
    expect(mockFn.checkbox).not.toHaveBeenCalled();
  });

  it('runNonInteractive() uses passed flags for provider, model, and dashboard', () => {
    const mockFn = makeMockPromptFn();
    const runner = createWizardRunner(mockFn);

    const result = runner.runNonInteractive({
      provider: 'groq',
      model: 'groq/llama-3.3-70b',
      dashboard: false,
      budget: 25,
    });

    expect(result.provider).toBe('groq');
    expect(result.model).toBe('groq/llama-3.3-70b');
    expect(result.dashboardEnabled).toBe(false);
    expect(result.budgetUsd).toBe(25);
  });

  it('writeConfig() creates the directory and writes config.yaml', () => {
    const tmpDir = path.join(os.tmpdir(), `qos-test-write-${crypto.randomUUID()}`);

    try {
      const config = generateConfig(makeCompleteWizardResult());
      writeConfig(config, tmpDir);

      const configPath = path.join(tmpDir, 'config.yaml');
      expect(fs.existsSync(tmpDir)).toBe(true);
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    } finally {
      // Clean up
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    }
  });

  it('generateConfig() with empty provider falls back gracefully and does not throw', () => {
    // provider is empty string — should still produce a config (uses defaults)
    const wizardResult = makeCompleteWizardResult({ provider: '' });

    expect(() => generateConfig(wizardResult)).not.toThrow();
  });
});
