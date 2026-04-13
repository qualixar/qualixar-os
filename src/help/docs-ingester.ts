// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Documentation Ingester
 *
 * Reads all .md files from the /docs directory, extracts YAML frontmatter,
 * chunks them via DocumentIngester, and stores in the memory store.
 * Call once on startup; results are cached in the DB.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { DocumentIngester } from '../memory/document-ingester.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocsIngestResult {
  readonly totalFiles: number;
  readonly totalChunks: number;
  readonly files: readonly { readonly path: string; readonly chunks: number }[];
  readonly errors: readonly string[];
}

export interface DocsIngesterOptions {
  readonly docsPath: string;
  readonly chunkSize?: number;
  readonly chunkOverlap?: number;
}

// ---------------------------------------------------------------------------
// Frontmatter Parser
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from markdown content.
 * Returns metadata object and body text.
 */
export function parseFrontmatter(content: string): {
  readonly metadata: Record<string, unknown>;
  readonly body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };

  const yamlBlock = match[1];
  const body = match[2];

  // Simple YAML parser for frontmatter (key: value pairs)
  const metadata: Record<string, unknown> = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    // Handle quoted strings
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // Handle arrays like ["tag1", "tag2"]
    if (typeof value === 'string' && value.startsWith('[')) {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep as string */
      }
    }
    metadata[key] = value;
  }

  return { metadata, body };
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find all .md files in a directory.
 */
export async function findMarkdownFiles(dir: string): Promise<readonly string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest all documentation files into the memory store.
 * Call once on startup; results are cached in the DB.
 */
export async function ingestDocs(
  ingester: DocumentIngester,
  options: DocsIngesterOptions,
): Promise<DocsIngestResult> {
  const { docsPath, chunkSize = 800, chunkOverlap = 200 } = options;

  const files = await findMarkdownFiles(docsPath);
  const results: { path: string; chunks: number }[] = [];
  const errors: string[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { metadata, body } = parseFrontmatter(content);
      const relativePath = relative(docsPath, filePath);

      const result = await ingester.ingestContent(body, relativePath, filePath, {
        chunkSize,
        chunkOverlap,
        layer: 'semantic',
        metadata: {
          ...metadata,
          docType: 'help',
          source: 'qualixar-docs',
          relativePath,
        },
      });

      results.push({ path: relativePath, chunks: result.chunkCount });
    } catch (err) {
      errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    totalFiles: results.length,
    totalChunks: results.reduce((sum, r) => sum + r.chunks, 0),
    files: results,
    errors,
  };
}
