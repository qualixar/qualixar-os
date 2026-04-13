// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Local LLM Auto-Detection
 *
 * Probes well-known ports to discover running local LLM servers
 * (Ollama, LM Studio, llama.cpp, vLLM). Returns a list of detected
 * providers with their available models.
 *
 * Hard Rules:
 * - Import .js extensions
 * - readonly interfaces
 * - Immutable patterns only
 * - 800-line cap
 */

// ================================================================
// Types
// ================================================================

export interface DetectedProvider {
  readonly type: string;
  readonly port: number;
  readonly endpoint: string;
  readonly models: readonly string[];
  readonly healthy: boolean;
}

// ================================================================
// Probe targets
// ================================================================

interface ProbeTarget {
  readonly type: string;
  readonly port: number;
  readonly healthPath: string;
  readonly modelsPath: string;
}

const PROBE_TARGETS: readonly ProbeTarget[] = Object.freeze([
  { type: 'ollama', port: 11434, healthPath: '/api/tags', modelsPath: '/api/tags' },
  { type: 'lmstudio', port: 1234, healthPath: '/v1/models', modelsPath: '/v1/models' },
  { type: 'llamacpp', port: 8080, healthPath: '/health', modelsPath: '/v1/models' },
  { type: 'vllm', port: 8000, healthPath: '/health', modelsPath: '/v1/models' },
]);

// ================================================================
// detectLocalProviders
// ================================================================

/**
 * Probe well-known ports and return all detected local LLM servers.
 *
 * @param timeoutMs - Per-probe timeout in milliseconds (default 3000)
 * @returns Array of detected providers (empty if none found)
 */
export async function detectLocalProviders(
  timeoutMs = 3000,
): Promise<readonly DetectedProvider[]> {
  const results = await Promise.allSettled(
    PROBE_TARGETS.map(async (target): Promise<DetectedProvider | null> => {
      const endpoint = `http://localhost:${target.port}`;

      // Health check
      const healthRes = await fetch(`${endpoint}${target.healthPath}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!healthRes.ok) return null;

      // Attempt to list models
      let models: readonly string[] = [];
      try {
        const modelsRes = await fetch(`${endpoint}${target.modelsPath}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (modelsRes.ok) {
          const data = (await modelsRes.json()) as {
            readonly models?: readonly { readonly name: string }[];
            readonly data?: readonly { readonly id: string }[];
          };
          if (target.type === 'ollama' && data.models) {
            models = data.models.map((m) => m.name);
          } else if (data.data) {
            models = data.data.map((m) => m.id);
          }
        }
      } catch {
        // Models list failed — provider still detected as healthy
      }

      return {
        type: target.type,
        port: target.port,
        endpoint,
        models,
        healthy: true,
      } satisfies DetectedProvider;
    }),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DetectedProvider | null> =>
        r.status === 'fulfilled',
    )
    .map((r) => r.value)
    .filter((v): v is DetectedProvider => v !== null);
}
