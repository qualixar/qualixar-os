// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Text Chunker
 *
 * Splits text into token-bounded chunks with configurable overlap.
 * Split priority: paragraph boundaries (\n\n) > sentence boundaries (. ! ?) > character split.
 *
 * Token estimation: Math.ceil(content.length / 4)
 */

import { estimateTokens } from './parsers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chunk {
  readonly content: string;
  readonly index: number;
  readonly tokens: number;
  readonly startOffset: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 4000;
const DEFAULT_OVERLAP_TOKENS = 200;
const CHARS_PER_TOKEN = 4;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function splitOnParagraphs(text: string): readonly string[] {
  return text.split(/\n\n+/);
}

function splitOnSentences(text: string): readonly string[] {
  // Split on sentence-ending punctuation followed by space or end-of-string
  return text.split(/(?<=[.!?])\s+/);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function chunkText(
  text: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP_TOKENS,
): readonly Chunk[] {
  const totalTokens = estimateTokens(text);

  // If the entire text fits in one chunk, return it directly
  if (totalTokens <= maxTokens) {
    return [{
      content: text,
      index: 0,
      tokens: totalTokens,
      startOffset: 0,
    }];
  }

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;
  const chunks: Chunk[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < text.length) {
    const remaining = text.slice(offset);
    let chunkContent: string;

    if (remaining.length <= maxChars) {
      chunkContent = remaining;
    } else {
      // Try paragraph boundary within maxChars window
      chunkContent = fitToBoundary(
        remaining,
        maxChars,
        splitOnParagraphs,
        '\n\n',
      );

      // Fall back to sentence boundary if paragraph split yielded nothing useful
      if (chunkContent.length < maxChars * 0.3) {
        chunkContent = fitToBoundary(
          remaining,
          maxChars,
          splitOnSentences,
          ' ',
        );
      }

      // Final fallback: hard character split
      if (chunkContent.length < maxChars * 0.1) {
        chunkContent = remaining.slice(0, maxChars);
      }
    }

    chunks.push({
      content: chunkContent,
      index: chunkIndex,
      tokens: estimateTokens(chunkContent),
      startOffset: offset,
    });

    chunkIndex += 1;
    const advance = chunkContent.length - overlapChars;
    offset += advance > 0 ? advance : chunkContent.length;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Boundary Fitting
// ---------------------------------------------------------------------------

function fitToBoundary(
  text: string,
  maxChars: number,
  splitter: (t: string) => readonly string[],
  joiner: string,
): string {
  const window = text.slice(0, maxChars);
  const segments = splitter(window);
  let result = '';

  for (const segment of segments) {
    const candidate = result.length === 0
      ? segment
      : result + joiner + segment;
    if (candidate.length > maxChars) break;
    result = candidate;
  }

  return result;
}
