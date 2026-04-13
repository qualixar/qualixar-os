// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Plugin Registry
 *
 * Fetches the official plugin index from GitHub raw URL, caches to
 * ~/.qualixar-os/registry-cache.json with a 1-hour TTL. Falls back to the
 * on-disk cache when the network is unavailable.
 *
 * Pattern: Cache-Aside — always try the network first, write on success,
 * read stale cache on failure so the registry never goes fully dark.
 *
 * Hard Rule HR-17: No shell commands — all I/O via node:fs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PluginRegistry,
  PluginType,
  RegistryEntry,
  RegistryIndex,
  RegistrySearchOptions,
} from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGISTRY_URL =
  'https://raw.githubusercontent.com/qualixar/qos-registry/main/registry.json';

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

function defaultCachePath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return path.join(home, '.qualixar-os', 'registry-cache.json');
}

const EMPTY_INDEX: RegistryIndex = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  plugins: [],
};

// ---------------------------------------------------------------------------
// Disk cache helpers
// ---------------------------------------------------------------------------

interface CacheFile {
  readonly fetchedAt: number; // epoch ms
  readonly index: RegistryIndex;
}

function readCache(cachePath: string): CacheFile | null {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(cachePath: string, data: CacheFile): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Network fetch (Node built-in, no extra deps)
// ---------------------------------------------------------------------------

async function fetchIndex(url: string): Promise<RegistryIndex> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RegistryIndex>;
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

function matchesQuery(entry: RegistryEntry, query: string): boolean {
  const q = query.toLowerCase();
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    entry.author.toLowerCase().includes(q) ||
    entry.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function matchesType(entry: RegistryEntry, type: PluginType): boolean {
  return entry.types.includes(type);
}

function compareEntries(
  a: RegistryEntry,
  b: RegistryEntry,
  sortBy: NonNullable<RegistrySearchOptions['sortBy']>,
): number {
  switch (sortBy) {
    case 'stars':
      return b.stars - a.stars;
    case 'installs':
      return b.installs - a.installs;
    case 'updated':
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    case 'name':
      return a.name.localeCompare(b.name);
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class PluginRegistryImpl implements PluginRegistry {
  private _index: RegistryIndex = EMPTY_INDEX;
  private _fetchedAt = 0;
  private readonly _cachePath: string;

  constructor(cachePath: string) {
    this._cachePath = cachePath;

    // Load from disk immediately so search() works without an explicit refresh
    const cached = readCache(cachePath);
    if (cached) {
      this._index = cached.index;
      this._fetchedAt = cached.fetchedAt;
    }
  }

  async refresh(): Promise<void> {
    try {
      const index = await fetchIndex(REGISTRY_URL);
      this._index = index;
      this._fetchedAt = Date.now();
      writeCache(this._cachePath, { fetchedAt: this._fetchedAt, index });
    } catch {
      // Network error — fall back to whatever is in memory (already loaded from cache)
    }
  }

  search(options: RegistrySearchOptions): readonly RegistryEntry[] {
    let results = [...this._index.plugins];

    if (options.query) {
      results = results.filter((e) => matchesQuery(e, options.query!));
    }

    if (options.type) {
      results = results.filter((e) => matchesType(e, options.type!));
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter((e) =>
        options.tags!.every((tag) => e.tags.includes(tag)),
      );
    }

    if (options.verifiedOnly) {
      results = results.filter((e) => e.verified);
    }

    const sortBy = options.sortBy ?? 'stars';
    results.sort((a, b) => compareEntries(a, b, sortBy));

    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  get(pluginId: string): RegistryEntry | undefined {
    return this._index.plugins.find((p) => p.id === pluginId);
  }

  getIndex(): RegistryIndex {
    return this._index;
  }

  isStale(): boolean {
    return Date.now() - this._fetchedAt > CACHE_TTL_MS;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginRegistry(
  cachePath: string = defaultCachePath(),
): PluginRegistry {
  return new PluginRegistryImpl(cachePath);
}
