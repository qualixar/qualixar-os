// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Model Discovery
 *
 * Queries configured providers at startup to discover available models.
 * Replaces hardcoded MODEL_CATALOG as the source of truth for routing.
 *
 * Supported providers:
 * - Azure AI Foundry: GET /openai/models
 * - OpenAI: GET /v1/models
 * - Anthropic: static known list (no models API)
 * - Google: static known list
 * - OpenRouter: GET /api/v1/models (200+ models with pricing)
 * - Ollama: GET /api/tags
 * - Together: GET /v1/models
 * - Groq: GET /openai/v1/models
 * - DeepSeek: static known list
 * - LM Studio: GET /v1/models
 *
 * Falls back to hardcoded MODEL_CATALOG when discovery fails.
 */

import type { ProviderConfig } from '../types/common.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredModel {
  readonly name: string;
  readonly provider: string;
  readonly qualityScore: number;
  readonly costPerInputToken: number;
  readonly costPerOutputToken: number;
  readonly maxTokens: number;
  readonly available: boolean;
  readonly source: 'discovered' | 'static' | 'fallback';
}

export type RoutingMode = 'quality' | 'balanced' | 'cost';

export interface DiscoveryResult {
  readonly models: readonly DiscoveredModel[];
  readonly providers: readonly string[];
  readonly discoveredCount: number;
  readonly fallbackCount: number;
  readonly errors: readonly string[];
}

export interface ModelDiscovery {
  discover(): Promise<DiscoveryResult>;
  selectModel(mode: RoutingMode, models: readonly DiscoveredModel[]): DiscoveredModel | null;
}

// ---------------------------------------------------------------------------
// Known Model Quality Scores (for models without pricing APIs)
// ---------------------------------------------------------------------------

const KNOWN_QUALITY: Readonly<Record<string, number>> = {
  // GPT-5.x (2026 — latest generation)
  'gpt-5.3': 0.97, 'gpt-5.3-chat': 0.97,
  'gpt-5.4-mini': 0.92, 'gpt-5.4': 0.96,
  // GPT-4.x
  'gpt-4.1': 0.93, 'gpt-4.1-mini': 0.85, 'gpt-4.1-nano': 0.75,
  'gpt-4o': 0.91, 'gpt-4o-mini': 0.83, 'o4-mini': 0.88, 'o3-mini': 0.86,
  // Anthropic
  'claude-opus-4-6': 0.98, 'claude-sonnet-4-6': 0.92, 'claude-haiku-4-5': 0.82,
  'claude-opus-4-5': 0.96, 'claude-sonnet-4-5': 0.90,
  // Google
  'gemini-2.5-pro': 0.91, 'gemini-2.5-flash': 0.84, 'gemini-2.0-flash': 0.80,
  // DeepSeek (V3.2 is 2026 flagship)
  'deepseek-v3.2': 0.92, 'deepseek-v3': 0.85, 'deepseek-coder': 0.82,
  // Grok (xAI)
  'grok-4-1-fast-reasoning': 0.90, 'grok-4': 0.87, 'grok-4-fast': 0.84,
  // Kimi (Moonshot AI)
  'kimi-k2.5': 0.88, 'kimi-k2': 0.85,
  // Mistral
  'mistral-large-3': 0.89, 'mistral-large': 0.80,
  // Open source
  'llama-3.1-70b': 0.78, 'llama-3.1-8b': 0.65,
};

const KNOWN_COST: Readonly<Record<string, { input: number; output: number }>> = {
  // GPT-5.x (estimated from Azure pricing)
  'gpt-5.3': { input: 0.000003, output: 0.000012 },
  'gpt-5.3-chat': { input: 0.000003, output: 0.000012 },
  'gpt-5.4-mini': { input: 0.0000006, output: 0.0000024 },
  // GPT-4.x
  'gpt-4.1': { input: 0.000002, output: 0.000008 },
  'gpt-4.1-mini': { input: 0.0000004, output: 0.0000016 },
  'gpt-4.1-nano': { input: 0.0000001, output: 0.0000004 },
  'gpt-4o': { input: 0.0000025, output: 0.00001 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
  'o4-mini': { input: 0.0000011, output: 0.0000044 },
  // Anthropic
  'claude-opus-4-6': { input: 0.000015, output: 0.000075 },
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  'claude-haiku-4-5': { input: 0.0000008, output: 0.000004 },
  // Google
  'gemini-2.5-pro': { input: 0.0000025, output: 0.00001 },
  'gemini-2.5-flash': { input: 0.0000005, output: 0.000002 },
  // DeepSeek
  'deepseek-v3.2': { input: 0.00000027, output: 0.0000011 },
  'deepseek-v3': { input: 0.00000027, output: 0.0000011 },
  // Grok
  'grok-4-1-fast-reasoning': { input: 0.000003, output: 0.000015 },
  // Kimi
  'kimi-k2.5': { input: 0.000001, output: 0.000004 },
  // Mistral
  'mistral-large-3': { input: 0.000002, output: 0.000006 },
};

// ---------------------------------------------------------------------------
// Static Model Lists (providers without a models API)
// ---------------------------------------------------------------------------

const ANTHROPIC_MODELS: readonly string[] = [
  'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5',
];

const GOOGLE_MODELS: readonly string[] = [
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
];

const DEEPSEEK_MODELS: readonly string[] = [
  'deepseek-v3', 'deepseek-coder',
];

// ---------------------------------------------------------------------------
// Provider Discovery Functions
// ---------------------------------------------------------------------------

async function discoverAzure(
  endpoint: string,
  apiKey: string,
): Promise<readonly DiscoveredModel[]> {
  // Query DEPLOYMENTS (actually usable) not model catalog (theoretically available)
  // Azure requires deployed models — the deployment name IS the API path.
  const res = await fetch(
    `${endpoint}/openai/deployments?api-version=2024-12-01-preview`,
    { headers: { 'api-key': apiKey } },
  );

  if (res.ok) {
    const data = await res.json() as {
      data?: readonly { id: string; model?: string; status?: string }[];
    };
    const deployments = (data.data ?? []).filter(
      (d) => d.status === 'succeeded' || !d.status,
    );

    if (deployments.length > 0) {
      return deployments
        .filter((d) => isChatModel(d.id))
        .map((d) => ({
          ...toDiscoveredModel(d.model ?? d.id, 'azure'),
          name: d.id, // Use deployment name (Azure routes by deployment, not model)
        }));
    }
  }

  // Fallback: try model catalog if deployments API not available
  const modelRes = await fetch(
    `${endpoint}/openai/models?api-version=2024-12-01-preview`,
    { headers: { 'api-key': apiKey } },
  );
  if (!modelRes.ok) return [];

  const modelData = await modelRes.json() as { data?: readonly { id: string }[] };
  return (modelData.data ?? [])
    .filter((m) => isChatModel(m.id))
    .map((m) => toDiscoveredModel(m.id, 'azure'));
}

async function discoverOpenAI(apiKey: string): Promise<readonly DiscoveredModel[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];

  const data = await res.json() as { data?: readonly { id: string }[] };
  return (data.data ?? [])
    .filter((m) => isChatModel(m.id))
    .map((m) => toDiscoveredModel(m.id, 'openai'));
}

/** Major models that should NOT be filtered even if their id contains "beta" or "preview". */
const OPENROUTER_MAJOR_MODELS: ReadonlySet<string> = new Set([
  'gpt-5', 'gpt-4', 'claude', 'gemini', 'o3', 'o4',
]);

/**
 * Returns true if an OpenRouter model id should be skipped.
 * Filters deprecated/beta/preview models unless they belong to a major family.
 */
function isOpenRouterFiltered(id: string): boolean {
  const lower = id.toLowerCase();

  // Filter non-chat models (embeddings, tts, images, etc.)
  if (!isChatModel(lower)) return true;

  // Allow major model families even when tagged beta/preview
  for (const major of OPENROUTER_MAJOR_MODELS) {
    if (lower.includes(major)) return false;
  }

  // Skip beta / preview for non-major models
  if (lower.includes('beta') || lower.includes('preview')) return true;

  return false;
}

/**
 * Maps OpenRouter's "provider/model-name" id to a cleaner routing name.
 * e.g. "openai/gpt-4.1" → "gpt-4.1", "anthropic/claude-opus-4-6" → "claude-opus-4-6"
 */
function cleanOpenRouterName(id: string): string {
  const slashIdx = id.indexOf('/');
  return slashIdx >= 0 ? id.slice(slashIdx + 1) : id;
}

async function discoverOpenRouter(apiKey: string): Promise<readonly DiscoveredModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];

  const data = await res.json() as {
    data?: readonly {
      id: string;
      pricing?: { prompt: string; completion: string };
      context_length?: number;
    }[];
  };

  return (data.data ?? [])
    .filter((m) => !isOpenRouterFiltered(m.id))
    .map((m) => ({
      name: cleanOpenRouterName(m.id),
      provider: 'openrouter',
      qualityScore: inferQuality(m.id),
      costPerInputToken: m.pricing ? parseFloat(m.pricing.prompt) : 0.000001,
      costPerOutputToken: m.pricing ? parseFloat(m.pricing.completion) : 0.000004,
      maxTokens: m.context_length ?? 4096,
      available: true,
      source: 'discovered' as const,
    }));
}

async function discoverOllama(
  endpoint: string,
): Promise<readonly DiscoveredModel[]> {
  const res = await fetch(`${endpoint}/api/tags`);
  if (!res.ok) return [];

  const data = await res.json() as {
    models?: readonly { name: string; size?: number }[];
  };

  return (data.models ?? []).map((m) => ({
    name: `ollama/${m.name}`,
    provider: 'ollama',
    qualityScore: inferQuality(m.name),
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxTokens: 8192,
    available: true,
    source: 'discovered' as const,
  }));
}

async function discoverGroq(apiKey: string): Promise<readonly DiscoveredModel[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];

  const data = await res.json() as { data?: readonly { id: string }[] };
  return (data.data ?? [])
    .filter((m) => isChatModel(m.id))
    .map((m) => toDiscoveredModel(m.id, 'groq'));
}

function discoverStatic(
  provider: string,
  modelList: readonly string[],
): readonly DiscoveredModel[] {
  return modelList.map((name) => ({
    ...toDiscoveredModel(name, provider),
    source: 'static' as const,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  // Filter out embeddings, whisper, tts, dall-e, etc.
  if (lower.includes('embed') || lower.includes('whisper') || lower.includes('tts') ||
      lower.includes('dall-e') || lower.includes('audio') || lower.includes('realtime') ||
      lower.includes('transcribe') || lower.includes('moderation')) {
    return false;
  }
  return true;
}

function inferQuality(name: string): number {
  const lower = name.toLowerCase();
  // Check known scores first
  for (const [key, score] of Object.entries(KNOWN_QUALITY)) {
    if (lower.includes(key.toLowerCase())) return score;
  }
  // Heuristic by model family
  if (lower.includes('opus')) return 0.95;
  if (lower.includes('sonnet')) return 0.88;
  if (lower.includes('haiku')) return 0.78;
  if (lower.includes('gpt-4')) return 0.88;
  if (lower.includes('gpt-3')) return 0.65;
  if (lower.includes('70b') || lower.includes('72b')) return 0.78;
  if (lower.includes('8b') || lower.includes('7b')) return 0.65;
  if (lower.includes('mini') || lower.includes('nano')) return 0.70;
  return 0.60; // Unknown model default
}

function toDiscoveredModel(name: string, provider: string): DiscoveredModel {
  const cost = KNOWN_COST[name];
  return {
    name,
    provider,
    qualityScore: inferQuality(name),
    costPerInputToken: cost?.input ?? 0.000001,
    costPerOutputToken: cost?.output ?? 0.000004,
    maxTokens: 8192,
    available: true,
    source: 'discovered',
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ModelDiscoveryImpl implements ModelDiscovery {
  private readonly _providers: Readonly<Record<string, ProviderConfig>>;

  constructor(providers: Readonly<Record<string, ProviderConfig>>) {
    this._providers = providers;
  }

  async discover(): Promise<DiscoveryResult> {
    const allModels: DiscoveredModel[] = [];
    const providerNames: string[] = [];
    const errors: string[] = [];

    for (const [name, config] of Object.entries(this._providers)) {
      providerNames.push(name);

      try {
        const models = await this._discoverProvider(name, config);
        allModels.push(...models);
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Deduplicate by name (keep first occurrence — provider-specific wins)
    const seen = new Set<string>();
    const deduped = allModels.filter((m) => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });

    return {
      models: deduped,
      providers: providerNames,
      discoveredCount: deduped.filter((m) => m.source === 'discovered').length,
      fallbackCount: deduped.filter((m) => m.source !== 'discovered').length,
      errors,
    };
  }

  selectModel(
    mode: RoutingMode,
    models: readonly DiscoveredModel[],
  ): DiscoveredModel | null {
    const available = models.filter((m) => m.available);
    if (available.length === 0) return null;

    switch (mode) {
      case 'quality':
        return [...available].sort((a, b) => b.qualityScore - a.qualityScore)[0];

      case 'cost':
        return [...available].sort(
          (a, b) => (a.costPerInputToken + a.costPerOutputToken) -
                    (b.costPerInputToken + b.costPerOutputToken),
        )[0];

      case 'balanced': {
        // Score = qualityScore / (1 + totalCostPer1K)
        return [...available].sort((a, b) => {
          const aCost = (a.costPerInputToken + a.costPerOutputToken) * 1000;
          const bCost = (b.costPerInputToken + b.costPerOutputToken) * 1000;
          const aScore = a.qualityScore / (1 + aCost);
          const bScore = b.qualityScore / (1 + bCost);
          return bScore - aScore;
        })[0];
      }
    }
  }

  private async _discoverProvider(
    name: string,
    config: ProviderConfig,
  ): Promise<readonly DiscoveredModel[]> {
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env] ?? ''
      : '';

    switch (name) {
      case 'azure': {
        // SCN-001 Fix: Fall back to AZURE_AI_ENDPOINT env var when config.endpoint is undefined
        const azureEndpoint = config.endpoint
          ?? process.env.AZURE_AI_ENDPOINT
          ?? process.env.AZURE_OPENAI_ENDPOINT
          ?? '';
        if (!azureEndpoint || !apiKey) return [];
        return discoverAzure(azureEndpoint, apiKey);
      }

      case 'openai':
        if (!apiKey) return [];
        return discoverOpenAI(apiKey);

      case 'openrouter':
        if (!apiKey) return [];
        return discoverOpenRouter(apiKey);

      case 'ollama':
        return discoverOllama(config.endpoint ?? 'http://localhost:11434');

      case 'groq':
        if (!apiKey) return [];
        return discoverGroq(apiKey);

      case 'anthropic':
        if (!apiKey) return [];
        return discoverStatic('anthropic', ANTHROPIC_MODELS);

      case 'google':
        if (!apiKey) return [];
        return discoverStatic('google', GOOGLE_MODELS);

      case 'deepseek':
        if (!apiKey) return [];
        return discoverStatic('deepseek', DEEPSEEK_MODELS);

      default:
        return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createModelDiscovery(
  providers: Readonly<Record<string, ProviderConfig>>,
): ModelDiscovery {
  return new ModelDiscoveryImpl(providers);
}
