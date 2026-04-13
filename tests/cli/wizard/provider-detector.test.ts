/**
 * Qualixar OS Phase 19 -- Provider Detector Tests
 * Tests for createProviderDetector() — detect() and isAvailable().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProviderDetector } from '../../../src/cli/wizard/provider-detector.js';

// ---------------------------------------------------------------------------
// Helpers: save/restore env vars to avoid cross-test pollution
// ---------------------------------------------------------------------------

const PROVIDER_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_AI_API_KEY',
  'GOOGLE_API_KEY',
  'OLLAMA_HOST',
  'AWS_ACCESS_KEY_ID',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'DEEPSEEK_API_KEY',
  'TOGETHER_API_KEY',
  'FIREWORKS_API_KEY',
  'CEREBRAS_API_KEY',
  'COHERE_API_KEY',
];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  // Snapshot current values then delete all provider keys
  savedEnv = {};
  for (const key of PROVIDER_ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  // Restore original values
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

describe('createProviderDetector', () => {
  it('detect() returns empty array when no provider env vars are set', () => {
    const detector = createProviderDetector();
    const result = detector.detect();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('detect() finds anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';

    const detector = createProviderDetector();
    const result = detector.detect();

    expect(result.length).toBe(1);
    expect(result[0]!.provider).toBe('anthropic');
    expect(result[0]!.envVar).toBe('ANTHROPIC_API_KEY');
    expect(result[0]!.isSet).toBe(true);
  });

  it('detect() returns multiple providers sorted by priority (anthropic before openai)', () => {
    process.env['OPENAI_API_KEY'] = 'sk-openai-test';
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

    const detector = createProviderDetector();
    const result = detector.detect();

    expect(result.length).toBeGreaterThanOrEqual(2);
    const providers = result.map((r) => r.provider);
    const anthropicIdx = providers.indexOf('anthropic');
    const openaiIdx = providers.indexOf('openai');
    expect(anthropicIdx).toBeLessThan(openaiIdx);
  });

  it('detect() finds azure-openai when AZURE_AI_API_KEY is set', () => {
    process.env['AZURE_AI_API_KEY'] = 'azure-test-key';

    const detector = createProviderDetector();
    const result = detector.detect();

    expect(result.length).toBe(1);
    expect(result[0]!.provider).toBe('azure-openai');
    expect(result[0]!.envVar).toBe('AZURE_AI_API_KEY');
  });

  it('isAvailable() returns true when the provider env var is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

    const detector = createProviderDetector();

    expect(detector.isAvailable('anthropic')).toBe(true);
  });

  it('detect() returns correct default primary model per provider', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    process.env['OPENAI_API_KEY'] = 'sk-openai-test';
    process.env['GROQ_API_KEY'] = 'gsk-test';

    const detector = createProviderDetector();
    const result = detector.detect();

    const anthropicEntry = result.find((r) => r.provider === 'anthropic');
    const openaiEntry = result.find((r) => r.provider === 'openai');
    const groqEntry = result.find((r) => r.provider === 'groq');

    expect(anthropicEntry?.defaultModel).toBe('claude-sonnet-4-6');
    expect(openaiEntry?.defaultModel).toBe('gpt-4.1');
    expect(groqEntry?.defaultModel).toBe('groq/llama-3.3-70b');
  });
});
