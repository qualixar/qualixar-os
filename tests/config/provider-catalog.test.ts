/**
 * Qualixar OS Phase 18 -- Provider Catalog Tests
 * Tests for PROVIDER_CATALOG static data and getProviderCatalog() merge function.
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_CATALOG, getProviderCatalog } from '../../src/config/provider-catalog.js';

describe('PROVIDER_CATALOG', () => {
  it('has at least 15 entries', () => {
    expect(PROVIDER_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it('every entry has all required fields', () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('displayName');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('configFields');
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.type).toBe('string');
      expect(Array.isArray(entry.configFields)).toBe(true);
    }
  });

  it('OpenAI entry supports embeddings with correct models', () => {
    const openai = PROVIDER_CATALOG.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai!.supportsEmbeddings).toBe(true);
    const modelIds = openai!.embeddingModels.map((m) => m.modelId);
    expect(modelIds).toContain('text-embedding-3-large');
    expect(modelIds).toContain('text-embedding-3-small');
    expect(modelIds).toContain('text-embedding-ada-002');
  });

  it('Azure entry supports embeddings', () => {
    const azure = PROVIDER_CATALOG.find((p) => p.id === 'azure-openai');
    expect(azure).toBeDefined();
    expect(azure!.supportsEmbeddings).toBe(true);
    expect(azure!.embeddingModels.length).toBeGreaterThan(0);
  });

  it('Ollama entry supports embeddings including nomic-embed-text', () => {
    const ollama = PROVIDER_CATALOG.find((p) => p.id === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama!.supportsEmbeddings).toBe(true);
    const modelIds = ollama!.embeddingModels.map((m) => m.modelId);
    expect(modelIds).toContain('nomic-embed-text');
  });

  it('every provider has at least 1 configField', () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(entry.configFields.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('password fields have supportsEnvRef=true', () => {
    for (const entry of PROVIDER_CATALOG) {
      for (const field of entry.configFields) {
        if (field.type === 'password') {
          expect(field.supportsEnvRef).toBe(true);
        }
      }
    }
  });
});

describe('getProviderCatalog()', () => {
  it('merges configured status from configuredProviders map', () => {
    const configured = new Map([
      ['openai', { type: 'openai' }],
    ]);
    const catalog = getProviderCatalog(configured);
    const openaiEntry = catalog.find((p) => p.id === 'openai');
    expect(openaiEntry).toBeDefined();
    expect(openaiEntry!.configured).toBe(true);
    expect(openaiEntry!.status).toBe('connected');
  });

  it('providers not in configuredProviders show status="not_configured"', () => {
    const configured = new Map<string, { type: string }>();
    const catalog = getProviderCatalog(configured);
    for (const entry of catalog) {
      expect(entry.configured).toBe(false);
      expect(entry.status).toBe('not_configured');
    }
  });

  it('custom provider type allows any endpoint configuration', () => {
    const custom = PROVIDER_CATALOG.find((p) => p.type === 'custom');
    expect(custom).toBeDefined();
    // Custom type has an endpoint configField so any URL can be used
    const endpointField = custom!.configFields.find((f) => f.name === 'endpoint');
    expect(endpointField).toBeDefined();
    expect(endpointField!.type).toBe('url');
    // Also confirms it supports embeddings (pass-through for any endpoint)
    expect(custom!.supportsEmbeddings).toBe(true);
  });
});
