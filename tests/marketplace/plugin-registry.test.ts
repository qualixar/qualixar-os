/**
 * Qualixar OS Phase 20 -- plugin-registry.test.ts
 *
 * 8 tests covering createPluginRegistry() — fetch, cache, search, staleness.
 * Test IDs: 11–18.
 *
 * Strategy:
 *   - global.fetch is mocked via vi.stubGlobal
 *   - Cache files land in os.tmpdir() under a unique per-test path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPluginRegistry } from '../../src/marketplace/plugin-registry.js';
import type { RegistryEntry, RegistryIndex } from '../../src/types/phase20.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'plugin-alpha',
    name: 'plugin-alpha',
    author: 'qualixar',
    description: 'Alpha plugin.',
    type: 'agent',
    types: ['agent'],
    version: '1.0.0',
    stars: 100,
    installs: 500,
    repo: 'https://github.com/qualixar/plugin-alpha',
    tarballUrl: 'https://example.com/plugin-alpha.tar.gz',
    sha256: 'abc123',
    verified: true,
    tags: ['research'],
    minQosVersion: '2.0.0',
    updatedAt: new Date('2026-01-01').toISOString(),
    ...overrides,
  };
}

function makeIndex(plugins: RegistryEntry[]): RegistryIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    plugins,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpCachePath(): string {
  const id = Math.random().toString(36).slice(2);
  return path.join(os.tmpdir(), `qos-test-registry-${id}.json`);
}

function writeCacheFile(cachePath: string, index: RegistryIndex, fetchedAt: number): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt, index }), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPluginRegistry()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('11 - refresh() fetches from network and writes to cache', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([makeEntry()]);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => index,
    });

    const registry = createPluginRegistry(cachePath);
    await registry.refresh();

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(fs.existsSync(cachePath)).toBe(true);

    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(cached.index.plugins).toHaveLength(1);
    expect(cached.index.plugins[0].id).toBe('plugin-alpha');
  });

  it('12 - refresh() falls back to on-disk cache when network fails', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([makeEntry({ id: 'cached-plugin', name: 'cached-plugin' })]);
    writeCacheFile(cachePath, index, Date.now());

    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const registry = createPluginRegistry(cachePath);
    await registry.refresh();

    // Should not throw; search still returns the cache entry
    const results = registry.search({});
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('cached-plugin');
  });

  it('13 - search() filters by query string (name/description/author/tags)', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([
      makeEntry({ id: 'alpha', name: 'alpha', description: 'Alpha plugin.', tags: ['research'] }),
      makeEntry({ id: 'beta', name: 'beta', description: 'Beta plugin.', tags: ['coding'] }),
    ]);
    writeCacheFile(cachePath, index, Date.now());

    const registry = createPluginRegistry(cachePath);
    const results = registry.search({ query: 'alpha' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('alpha');
  });

  it('14 - search() filters by plugin type', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([
      makeEntry({ id: 'agent-1', name: 'agent-1', types: ['agent'] }),
      makeEntry({ id: 'tool-1', name: 'tool-1', types: ['tool'] }),
      makeEntry({ id: 'skill-1', name: 'skill-1', types: ['skill'] }),
    ]);
    writeCacheFile(cachePath, index, Date.now());

    const registry = createPluginRegistry(cachePath);
    const results = registry.search({ type: 'tool' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('tool-1');
  });

  it('15 - search() filters to verified only when verifiedOnly is true', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([
      makeEntry({ id: 'v1', name: 'v1', verified: true }),
      makeEntry({ id: 'c1', name: 'c1', verified: false }),
      makeEntry({ id: 'v2', name: 'v2', verified: true }),
    ]);
    writeCacheFile(cachePath, index, Date.now());

    const registry = createPluginRegistry(cachePath);
    const results = registry.search({ verifiedOnly: true });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.verified)).toBe(true);
  });

  it('16 - search() sorts by stars descending by default', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([
      makeEntry({ id: 'low', name: 'low', stars: 10 }),
      makeEntry({ id: 'high', name: 'high', stars: 999 }),
      makeEntry({ id: 'mid', name: 'mid', stars: 50 }),
    ]);
    writeCacheFile(cachePath, index, Date.now());

    const registry = createPluginRegistry(cachePath);
    const results = registry.search({ sortBy: 'stars' });
    expect(results[0].id).toBe('high');
    expect(results[1].id).toBe('mid');
    expect(results[2].id).toBe('low');
  });

  it('17 - isStale() returns true when fetchedAt is more than 1 hour ago', async () => {
    const cachePath = tmpCachePath();
    const index = makeIndex([]);
    const oneHourAgo = Date.now() - (60 * 60 * 1_000 + 1);
    writeCacheFile(cachePath, index, oneHourAgo);

    const registry = createPluginRegistry(cachePath);
    expect(registry.isStale()).toBe(true);
  });

  it('18 - get() returns the matching entry by plugin ID', async () => {
    const cachePath = tmpCachePath();
    const target = makeEntry({ id: 'target-plugin', name: 'target-plugin' });
    const index = makeIndex([
      makeEntry({ id: 'other', name: 'other' }),
      target,
    ]);
    writeCacheFile(cachePath, index, Date.now());

    const registry = createPluginRegistry(cachePath);
    const found = registry.get('target-plugin');
    expect(found).toBeDefined();
    expect(found?.id).toBe('target-plugin');

    const notFound = registry.get('nonexistent');
    expect(notFound).toBeUndefined();
  });
});
