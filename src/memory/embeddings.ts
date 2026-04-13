// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Session 15 -- Embedding Generation (C-12)
 *
 * Azure OpenAI / OpenAI embedding generation for vector search.
 * Uses the OpenAI SDK pointed at Azure endpoint for embeddings.
 *
 * Graceful degradation: if no API key is configured, all methods
 * return null instead of throwing. This allows the memory store
 * to fall back to FTS5/LIKE search transparently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  readonly generateEmbedding: (text: string) => Promise<readonly number[] | null>;
  readonly generateEmbeddings: (texts: readonly string[]) => Promise<readonly (readonly number[])[] | null>;
  readonly isAvailable: () => boolean;
  readonly getDimensions: () => number;
}

export interface EmbeddingConfig {
  readonly provider: 'azure' | 'openai' | 'ollama' | 'local' | 'none';
  readonly model: string;
  readonly dimensions: number;
  readonly endpoint?: string;
  readonly apiKeyEnv?: string;
  readonly apiVersion?: string;
}

// ---------------------------------------------------------------------------
// Cosine Similarity (pure math, no external deps)
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

export function getDefaultEmbeddingConfig(): EmbeddingConfig {
  return {
    provider: 'azure',
    model: 'text-embedding-3-large',
    dimensions: 3072,
    endpoint: process.env.AZURE_AI_ENDPOINT ?? '',
    apiKeyEnv: 'AZURE_AI_API_KEY',
    apiVersion: '2024-06-01',
  };
}

// ---------------------------------------------------------------------------
// Azure / OpenAI Implementation
// ---------------------------------------------------------------------------

class AzureEmbeddingProvider implements EmbeddingProvider {
  private readonly _config: EmbeddingConfig;
  private readonly _apiKey: string | undefined;

  constructor(config: EmbeddingConfig) {
    this._config = config;
    this._apiKey = config.apiKeyEnv
      ? process.env[config.apiKeyEnv]
      : undefined;
  }

  isAvailable(): boolean {
    return Boolean(this._apiKey && this._config.endpoint);
  }

  getDimensions(): number {
    return this._config.dimensions;
  }

  /* v8 ignore start -- requires real Azure API call */
  async generateEmbedding(text: string): Promise<readonly number[] | null> {
    if (!this.isAvailable()) return null;
    try {
      const results = await this._callApi([text]);
      return results ? results[0] : null;
    } catch (err) {
      console.warn('Embedding operation failed:', err);
      return null;
    }
  }

  async generateEmbeddings(texts: readonly string[]): Promise<readonly (readonly number[])[] | null> {
    if (!this.isAvailable()) return null;
    if (texts.length === 0) return [];
    try {
      return await this._callApi([...texts]);
    } catch (err) {
      console.warn('Embedding batch operation failed:', err);
      return null;
    }
  }

  private async _callApi(inputs: readonly string[]): Promise<readonly (readonly number[])[] | null> {
    const { AzureOpenAI } = await import('openai');
    const client = new AzureOpenAI({
      endpoint: this._config.endpoint!,
      apiKey: this._apiKey!,
      apiVersion: this._config.apiVersion ?? '2024-06-01',
    });

    const deployment = process.env.AZURE_EMBEDDING_DEPLOYMENT ?? this._config.model;
    const response = await client.embeddings.create({
      model: deployment,
      input: [...inputs],
    });

    return response.data.map((d) => d.embedding);
  }
  /* v8 ignore stop */
}

// ---------------------------------------------------------------------------
// Ollama Implementation
// ---------------------------------------------------------------------------

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly _config: EmbeddingConfig;
  private readonly _endpoint: string;
  private readonly _model: string;

  constructor(config: EmbeddingConfig) {
    this._config = config;
    this._endpoint = config.endpoint
      ?? process.env.OLLAMA_HOST
      ?? 'http://localhost:11434';
    this._model = config.model || 'nomic-embed-text';
  }

  isAvailable(): boolean {
    return true;
  }

  getDimensions(): number {
    return this._config.dimensions || 768;
  }

  /* v8 ignore start -- requires running Ollama instance */
  async generateEmbedding(text: string): Promise<readonly number[] | null> {
    try {
      const results = await this._callOllama([`search_document: ${text}`]);
      return results ? results[0] : null;
    } catch (err) {
      console.warn('Embedding operation failed:', err);
      return null;
    }
  }

  async generateQueryEmbedding(text: string): Promise<readonly number[] | null> {
    try {
      const results = await this._callOllama([`search_query: ${text}`]);
      return results ? results[0] : null;
    } catch (err) {
      console.warn('Embedding query operation failed:', err);
      return null;
    }
  }

  async generateEmbeddings(texts: readonly string[]): Promise<readonly (readonly number[])[] | null> {
    if (texts.length === 0) return [];
    try {
      const prefixed = texts.map((t) => `search_document: ${t}`);
      return await this._callOllama([...prefixed]);
    } catch (err) {
      console.warn('Embedding batch operation failed:', err);
      return null;
    }
  }

  private async _callOllama(inputs: readonly string[]): Promise<readonly (readonly number[])[] | null> {
    // For single input, send as string; for batch, send as array
    const input = inputs.length === 1 ? inputs[0] : [...inputs];
    const res = await fetch(`${this._endpoint}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this._model,
        input,
        options: { num_ctx: 8192 },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings || data.embeddings.length === 0) return null;
    return data.embeddings;
  }
  /* v8 ignore stop */
}

// ---------------------------------------------------------------------------
// Null (no-op) Implementation
// ---------------------------------------------------------------------------

class NullEmbeddingProvider implements EmbeddingProvider {
  isAvailable(): boolean {
    return false;
  }

  getDimensions(): number {
    return 0;
  }

  async generateEmbedding(): Promise<readonly number[] | null> {
    return null;
  }

  async generateEmbeddings(): Promise<readonly (readonly number[])[] | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmbeddingProvider(config?: Partial<EmbeddingConfig>): EmbeddingProvider {
  const resolved: EmbeddingConfig = {
    ...getDefaultEmbeddingConfig(),
    ...config,
  };

  if (resolved.provider === 'none') {
    return new NullEmbeddingProvider();
  }

  if (resolved.provider === 'azure' || resolved.provider === 'openai') {
    return new AzureEmbeddingProvider(resolved);
  }

  if (resolved.provider === 'ollama') {
    return new OllamaEmbeddingProvider(resolved);
  }

  // local or unknown provider — return null provider for now
  return new NullEmbeddingProvider();
}
