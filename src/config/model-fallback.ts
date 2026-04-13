// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Model Fallback Chain
 *
 * Auto-detects available LLM models when no provider is configured.
 * Probes Ollama first (most common local provider), then other local servers.
 *
 * Fallback order:
 * 1. Configured model (from config.yaml / Settings)
 * 2. Ollama — any available model (prefer gemma4, llama3, mistral)
 * 3. LM Studio — /v1/models on port 1234
 * 4. None — returns null with setup instructions
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedModel {
  readonly name: string;
  readonly provider: string;
  readonly endpoint: string;
  readonly size?: string;
  readonly sizeBytes?: number;
}

export type ModelTier = 'large' | 'small' | 'none';

export interface FallbackResult {
  readonly model: DetectedModel | null;
  readonly tier: ModelTier;
  readonly available: readonly DetectedModel[];
  readonly setupNeeded: boolean;
  readonly setupInstructions: string;
}

/**
 * Determine the capability tier of a model based on its size.
 * - large (7B+): Full RAG with complex system prompt
 * - small (<7B): Simplified prompt, fewer chunks
 * - none: No model, direct doc display
 */
export function getModelTier(model: DetectedModel | null): ModelTier {
  if (!model) return 'none';
  const bytes = model.sizeBytes ?? 0;
  // 7B models are typically 4-5GB in Q4 quantization
  if (bytes >= 4_000_000_000) return 'large';
  // Check model name for known large models
  const name = model.name.toLowerCase();
  if (name.includes('70b') || name.includes('34b') || name.includes('13b') || name.includes('8b') || name.includes('7b')) return 'large';
  return 'small';
}

// ---------------------------------------------------------------------------
// Model preference order (best for help chat first)
// ---------------------------------------------------------------------------

const PREFERRED_MODELS: readonly string[] = [
  'qwen2.5', 'qwen3',
  'gemma4', 'gemma3', 'gemma2',
  'llama3', 'llama4', 'llama3.1', 'llama3.2',
  'mistral', 'mixtral',
  'phi', 'deepseek',
];

function scoreModel(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < PREFERRED_MODELS.length; i++) {
    if (lower.includes(PREFERRED_MODELS[i])) return PREFERRED_MODELS.length - i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Ollama Detection
// ---------------------------------------------------------------------------

async function detectOllamaModels(
  endpoint = 'http://localhost:11434',
  timeoutMs = 3000,
): Promise<readonly DetectedModel[]> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      readonly models?: readonly { readonly name: string; readonly size?: number }[];
    };

    return (data.models ?? []).map((m) => ({
      name: m.name,
      provider: 'ollama',
      endpoint,
      size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : undefined,
      sizeBytes: m.size ?? 0,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// LM Studio Detection
// ---------------------------------------------------------------------------

async function detectLMStudioModels(
  endpoint = 'http://localhost:1234',
  timeoutMs = 3000,
): Promise<readonly DetectedModel[]> {
  try {
    const res = await fetch(`${endpoint}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      readonly data?: readonly { readonly id: string }[];
    };

    return (data.data ?? []).map((m) => ({
      name: m.id,
      provider: 'lmstudio',
      endpoint,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main Fallback
// ---------------------------------------------------------------------------

/**
 * Detect available local models and pick the best one.
 * Results are cached for 60 seconds to avoid hammering local servers.
 */
let cachedResult: FallbackResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function detectAvailableModels(): Promise<FallbackResult> {
  const now = Date.now();
  if (cachedResult && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedResult;
  }

  const [ollamaModels, lmStudioModels] = await Promise.all([
    detectOllamaModels(),
    detectLMStudioModels(),
  ]);

  const allModels = [...ollamaModels, ...lmStudioModels];

  if (allModels.length === 0) {
    const result: FallbackResult = {
      model: null,
      tier: 'none',
      available: [],
      setupNeeded: true,
      setupInstructions: [
        'No LLM provider detected. To use the help chatbot, set up one of:',
        '',
        '1. Ollama (recommended, free):',
        '   curl -fsSL https://ollama.com/install.sh | sh',
        '   ollama pull gemma3:4b    # 3GB, fast, good quality',
        '',
        '2. Cloud provider (paid):',
        '   Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AZURE_AI_API_KEY',
        '   Then configure in Settings → Providers',
        '',
        '3. LM Studio (GUI):',
        '   Download from https://lmstudio.ai',
        '   Load any model and start the server',
      ].join('\n'),
    };
    cachedResult = result;
    cacheTimestamp = now;
    return result;
  }

  // Sort by preference score (descending), pick best
  const sorted = [...allModels].sort((a, b) => scoreModel(b.name) - scoreModel(a.name));
  const best = sorted[0];

  const result: FallbackResult = {
    model: best,
    tier: getModelTier(best),
    available: sorted,
    setupNeeded: false,
    setupInstructions: '',
  };

  cachedResult = result;
  cacheTimestamp = now;
  return result;
}

/**
 * Clear the detection cache (call after provider config changes).
 */
export function clearModelCache(): void {
  cachedResult = null;
  cacheTimestamp = 0;
}
