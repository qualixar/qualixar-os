// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- MODEL_CATALOG: Hardcoded Model Registry
 *
 * Extracted from model-call.ts (DEF-022: 800-line cap).
 *
 * Hardcoded catalog of known models with pricing and quality scores.
 * Pattern: Value Object array -- immutable, frozen at runtime.
 *
 * NOTE (H3): Pricing is hardcoded for v2.0.0 initial release.
 * Phase 7 will add runtime pricing overrides via config.
 */

import type { ModelInfo } from './strategies/types.js';

export const MODEL_CATALOG: readonly ModelInfo[] = Object.freeze([
  // Anthropic
  {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    qualityScore: 0.92,
    maxTokens: 64000,
    available: true,
  },
  {
    name: 'claude-opus-4-6',
    provider: 'anthropic',
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    qualityScore: 0.98,
    maxTokens: 32000,
    available: true,
  },
  {
    name: 'claude-haiku-4-5',
    provider: 'anthropic',
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
    qualityScore: 0.82,
    maxTokens: 8192,
    available: true,
  },
  // OpenAI
  {
    name: 'gpt-4.1',
    provider: 'openai',
    costPerInputToken: 0.000002,
    costPerOutputToken: 0.000008,
    qualityScore: 0.93,
    maxTokens: 32768,
    available: true,
  },
  {
    name: 'gpt-4.1-mini',
    provider: 'openai',
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.0000016,
    qualityScore: 0.85,
    maxTokens: 16384,
    available: true,
  },
  // Google
  {
    name: 'gemini-2.5-pro',
    provider: 'google',
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
    qualityScore: 0.91,
    maxTokens: 8192,
    available: true,
  },
  {
    name: 'gemini-2.5-flash',
    provider: 'google',
    costPerInputToken: 0.0000005,
    costPerOutputToken: 0.000002,
    qualityScore: 0.84,
    maxTokens: 8192,
    available: true,
  },
  // Ollama (local -- zero cost)
  {
    name: 'ollama/llama3',
    provider: 'ollama',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    qualityScore: 0.60,
    maxTokens: 8192,
    available: true,
  },
  {
    name: 'ollama/mistral',
    provider: 'ollama',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    qualityScore: 0.55,
    maxTokens: 8192,
    available: true,
  },
  // AWS Bedrock (H-21: stub provider)
  {
    name: 'bedrock/claude-sonnet-4',
    provider: 'bedrock',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    qualityScore: 0.92,
    maxTokens: 64000,
    available: true,
  },
  {
    name: 'bedrock/claude-haiku-4',
    provider: 'bedrock',
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
    qualityScore: 0.82,
    maxTokens: 8192,
    available: true,
  },
]) as readonly ModelInfo[];
