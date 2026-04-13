// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Provider Auto-Detection
 * LLD Section 15 (CROSS-02 fix): derives data from Phase 18 PROVIDER_CATALOG
 *
 * Scans process.env for known API key patterns and returns detected providers
 * sorted by priority (anthropic > openai > azure > google > rest).
 */

import { PROVIDER_CATALOG } from '../../config/provider-catalog.js';
import type { DetectedProvider, ProviderDetector } from '../../types/phase19.js';

// ---------------------------------------------------------------------------
// Priority order for sorting detected providers
// ---------------------------------------------------------------------------

const PRIORITY: readonly string[] = [
  'anthropic', 'openai', 'azure-openai', 'google', 'ollama',
  'bedrock', 'openrouter', 'groq', 'mistral', 'deepseek',
  'together', 'fireworks', 'cerebras', 'cohere',
];

// ---------------------------------------------------------------------------
// Default models per provider (derived from MODEL_CATALOG conventions)
// ---------------------------------------------------------------------------

const MODEL_DEFAULTS: Readonly<Record<string, { primary: string; fallback: string }>> = {
  anthropic: { primary: 'claude-sonnet-4-6', fallback: 'claude-haiku-4-5' },
  openai: { primary: 'gpt-4.1', fallback: 'gpt-4.1-mini' },
  'azure-openai': { primary: 'claude-sonnet-4-6', fallback: 'claude-haiku-4-5' },
  google: { primary: 'gemini-2.5-pro', fallback: 'gemini-2.5-flash' },
  ollama: { primary: 'ollama/llama3', fallback: 'ollama/mistral' },
  bedrock: { primary: 'bedrock/claude-sonnet-4', fallback: 'bedrock/claude-haiku-4' },
  openrouter: { primary: 'openrouter/auto', fallback: 'openrouter/auto' },
  groq: { primary: 'groq/llama-3.3-70b', fallback: 'groq/llama-3.1-8b' },
  mistral: { primary: 'mistral/mistral-large', fallback: 'mistral/mistral-small' },
  deepseek: { primary: 'deepseek/deepseek-chat', fallback: 'deepseek/deepseek-chat' },
  together: { primary: 'together/meta-llama/Llama-3-70b', fallback: 'together/meta-llama/Llama-3-8b' },
  fireworks: { primary: 'fireworks/llama-v3p3-70b', fallback: 'fireworks/llama-v3p1-8b' },
  cerebras: { primary: 'cerebras/llama3.1-70b', fallback: 'cerebras/llama3.1-8b' },
  cohere: { primary: 'cohere/command-r-plus', fallback: 'cohere/command-r' },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProviderDetector(): ProviderDetector {
  return new ProviderDetectorImpl();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ProviderDetectorImpl implements ProviderDetector {
  detect(): readonly DetectedProvider[] {
    const results: DetectedProvider[] = [];

    for (const entry of PROVIDER_CATALOG) {
      if (!entry.defaultApiKeyEnv || entry.id === 'custom') continue;

      const envVar = entry.defaultApiKeyEnv;
      const isSet = Boolean(process.env[envVar]);

      if (isSet) {
        const models = MODEL_DEFAULTS[entry.id] ?? { primary: entry.id, fallback: entry.id };
        results.push({
          provider: entry.id,
          envVar,
          isSet,
          defaultModel: models.primary,
          defaultFallback: models.fallback,
        });
      }
    }

    // Sort by priority
    results.sort((a, b) => {
      const ai = PRIORITY.indexOf(a.provider);
      const bi = PRIORITY.indexOf(b.provider);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return results;
  }

  isAvailable(provider: string): boolean {
    const entry = PROVIDER_CATALOG.find((p) => p.id === provider);
    if (!entry || !entry.defaultApiKeyEnv) return false;
    return Boolean(process.env[entry.defaultApiKeyEnv]);
  }
}
