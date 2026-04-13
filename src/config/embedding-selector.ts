// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Embedding Provider Selector
 * LLD Section 3.1 Component #5, Algorithm 8.4
 *
 * Filters configured providers that support embeddings,
 * tests embedding generation, and saves embedding config.
 */

import type {
  EmbeddingProviderConfig,
  EmbeddingTestResult,
  EmbeddingModelInfo,
} from '../types/phase18.js';
import type { CredentialStore } from '../types/phase18.js';
import { PROVIDER_CATALOG } from './provider-catalog.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EmbeddingSelector {
  listEmbeddingProviders(
    configuredProviders: ReadonlyMap<string, { readonly type: string }>,
  ): readonly { providerName: string; displayName: string; models: readonly EmbeddingModelInfo[] }[];

  getModelsForProvider(providerType: string): readonly EmbeddingModelInfo[];

  testEmbedding(
    providerName: string,
    providerType: string,
    modelId: string,
    credentialStore: CredentialStore,
  ): Promise<EmbeddingTestResult>;

  getCurrentConfig(): EmbeddingProviderConfig | null;

  saveEmbeddingConfig(
    provider: string,
    model: string,
    dimensions: number,
  ): EmbeddingProviderConfig;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmbeddingSelector(): EmbeddingSelector {
  return new EmbeddingSelectorImpl();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class EmbeddingSelectorImpl implements EmbeddingSelector {
  private _currentConfig: EmbeddingProviderConfig | null = null;

  listEmbeddingProviders(
    configuredProviders: ReadonlyMap<string, { readonly type: string }>,
  ): readonly { providerName: string; displayName: string; models: readonly EmbeddingModelInfo[] }[] {
    const result: { providerName: string; displayName: string; models: readonly EmbeddingModelInfo[] }[] = [];

    for (const [name, config] of configuredProviders) {
      const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === config.type);
      if (catalogEntry && catalogEntry.supportsEmbeddings && catalogEntry.embeddingModels.length > 0) {
        result.push({
          providerName: name,
          displayName: catalogEntry.displayName,
          models: catalogEntry.embeddingModels,
        });
      }
    }

    return result;
  }

  getModelsForProvider(providerType: string): readonly EmbeddingModelInfo[] {
    const entry = PROVIDER_CATALOG.find((p) => p.id === providerType);
    if (!entry || !entry.supportsEmbeddings) return [];
    return entry.embeddingModels;
  }

  async testEmbedding(
    providerName: string,
    providerType: string,
    modelId: string,
    credentialStore: CredentialStore,
  ): Promise<EmbeddingTestResult> {
    const start = Date.now();

    // Resolve API key
    const apiKey = credentialStore.resolve(providerName);
    if (!apiKey && providerType !== 'ollama') {
      return {
        success: false,
        dimensions: null,
        latencyMs: Date.now() - start,
        error: `API key not configured for ${providerName}`,
        testedAt: new Date().toISOString(),
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const dimensions = await this._callEmbeddingAPI(
        providerType,
        apiKey ?? '',
        modelId,
        'hello world',
        controller.signal,
      );

      clearTimeout(timeoutId);

      return {
        success: true,
        dimensions,
        latencyMs: Date.now() - start,
        error: null,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Embedding API timed out after 30000ms' : err.message)
        : 'Unknown error';
      return {
        success: false,
        dimensions: null,
        latencyMs: Date.now() - start,
        error: message,
        testedAt: new Date().toISOString(),
      };
    }
  }

  getCurrentConfig(): EmbeddingProviderConfig | null {
    return this._currentConfig;
  }

  saveEmbeddingConfig(
    provider: string,
    model: string,
    dimensions: number,
  ): EmbeddingProviderConfig {
    const config: EmbeddingProviderConfig = {
      provider,
      model,
      dimensions,
      tested: true,
      lastTestResult: null,
    };
    this._currentConfig = config;
    return config;
  }

  private async _callEmbeddingAPI(
    providerType: string,
    apiKey: string,
    modelId: string,
    text: string,
    signal: AbortSignal,
  ): Promise<number> {
    const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === providerType);
    const endpoint = catalogEntry?.defaultEndpoint;

    switch (providerType) {
      case 'openai':
      case 'azure-openai': {
        const url = providerType === 'azure-openai'
          ? `${endpoint}/openai/deployments/${modelId}/embeddings?api-version=2024-10-21`
          : 'https://api.openai.com/v1/embeddings';
        const headers: Record<string, string> = providerType === 'azure-openai'
          ? { 'api-key': apiKey, 'Content-Type': 'application/json' }
          : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        const body = providerType === 'azure-openai'
          ? JSON.stringify({ input: text })
          : JSON.stringify({ model: modelId, input: text });
        const res = await fetch(url, { method: 'POST', headers, body, signal });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const data = await res.json() as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding.length;
      }
      case 'google': {
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelId}:embedContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
          signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const data = await res.json() as { embedding: { values: number[] } };
        return data.embedding.values.length;
      }
      case 'cohere': {
        const res = await fetch('https://api.cohere.com/v2/embed', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: [text], model: modelId, input_type: 'search_document' }),
          signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const data = await res.json() as { embeddings: { float: number[][] } };
        return data.embeddings.float[0].length;
      }
      case 'ollama': {
        const baseUrl = endpoint ?? 'http://localhost:11434';
        const res = await fetch(`${baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId, input: text }),
          signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const data = await res.json() as { embeddings: number[][] };
        return data.embeddings[0].length;
      }
      default: {
        // Custom/generic OpenAI-compatible endpoint
        const baseUrl = endpoint ?? 'http://localhost:8080/v1';
        const res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId, input: text }),
          signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const data = await res.json() as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding.length;
      }
    }
  }
}
