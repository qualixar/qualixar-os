// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Document Ingester
 *
 * Ingest documents (.txt, .md, .json, .csv) into the memory store
 * via chunking + embedding. Supports fixed-size chunks with overlap.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryStore } from './store.js';
import type { EmbeddingProvider } from './embeddings.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestOptions {
  readonly chunkSize?: number;
  readonly chunkOverlap?: number;
  readonly layer?: 'episodic' | 'semantic' | 'procedural';
  readonly metadata?: Record<string, unknown>;
}

export interface IngestResult {
  readonly filePath: string;
  readonly fileName: string;
  readonly chunkCount: number;
  readonly totalChars: number;
  readonly estimatedTokens: number;
  readonly entryIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv']);
const CHARS_PER_TOKEN_ESTIMATE = 4;

// ---------------------------------------------------------------------------
// Chunking (DEF-044: simple fixed-size char splitter)
// For token-aware boundary splitting, use context/chunker.ts instead.
// ---------------------------------------------------------------------------

export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): readonly string[] {
  if (text.length === 0) return [];
  if (chunkSize <= 0) return [text];
  if (overlap >= chunkSize) {
    // Overlap must be less than chunk size
    overlap = Math.floor(chunkSize / 2);
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DocumentIngester {
  private readonly memoryStore: MemoryStore;
  private readonly embeddingProvider: EmbeddingProvider | null;

  constructor(
    memoryStore: MemoryStore,
    embeddingProvider?: EmbeddingProvider | null,
  ) {
    this.memoryStore = memoryStore;
    this.embeddingProvider = embeddingProvider ?? null;
  }

  /**
   * Ingest a document from a file path.
   */
  async ingestDocument(
    filePath: string,
    options?: IngestOptions,
  ): Promise<IngestResult> {
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    const fileName = path.basename(resolved);

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
      );
    }

    const content = await readFile(resolved, 'utf-8');
    return this.ingestContent(content, fileName, resolved, options);
  }

  /**
   * Ingest raw text content directly.
   */
  async ingestContent(
    content: string,
    fileName: string,
    source: string,
    options?: IngestOptions,
  ): Promise<IngestResult> {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
    const layer = options?.layer ?? 'semantic';
    const userMeta = options?.metadata ?? {};

    const chunks = chunkText(content, chunkSize, chunkOverlap);
    const entryIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const entryId = await this.memoryStore.store({
        content: chunk,
        layer,
        source: 'user',
        metadata: {
          ...userMeta,
          documentSource: source,
          documentName: fileName,
          chunkIndex: i,
          chunkTotal: chunks.length,
          ingested: true,
        },
      });
      entryIds.push(entryId);
    }

    return {
      filePath: source,
      fileName,
      chunkCount: chunks.length,
      totalChars: content.length,
      estimatedTokens: Math.ceil(content.length / CHARS_PER_TOKEN_ESTIMATE),
      entryIds,
    };
  }

  /**
   * Check if embedding provider is available for vector search.
   */
  hasEmbeddingProvider(): boolean {
    return this.embeddingProvider !== null && this.embeddingProvider.isAvailable();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDocumentIngester(
  memoryStore: MemoryStore,
  embeddingProvider?: EmbeddingProvider | null,
): DocumentIngester {
  return new DocumentIngester(memoryStore, embeddingProvider);
}
