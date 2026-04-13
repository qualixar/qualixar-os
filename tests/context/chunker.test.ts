/**
 * Phase 12 -- Chunker Tests
 * Tests text chunking with various sizes, overlap, and boundary detection.
 */
import { describe, it, expect } from 'vitest';
import { chunkText } from '../../src/context/chunker.js';
import type { Chunk } from '../../src/context/chunker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalContent(chunks: readonly Chunk[]): number {
  return chunks.reduce((sum, c) => sum + c.content.length, 0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const text = 'Hello world';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].tokens).toBeGreaterThan(0);
  });

  it('returns single chunk when text fits within maxTokens', () => {
    const text = 'a'.repeat(1000); // 250 tokens
    const chunks = chunkText(text, 4000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
  });

  it('splits long text into multiple chunks', () => {
    // Create text that exceeds 4000 tokens (16000 chars)
    const paragraph = 'This is a test paragraph with some content.\n\n';
    const text = paragraph.repeat(500); // ~22500 chars = ~5625 tokens
    const chunks = chunkText(text, 1000, 50);
    expect(chunks.length).toBeGreaterThan(1);

    // All chunks should have valid indices
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
      expect(chunks[i].tokens).toBeGreaterThan(0);
      expect(chunks[i].startOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects maxTokens limit per chunk', () => {
    const maxTokens = 500;
    const text = 'word '.repeat(5000); // 25000 chars = ~6250 tokens
    const chunks = chunkText(text, maxTokens, 0);

    for (const chunk of chunks) {
      // Each chunk should not exceed maxTokens (with some tolerance for boundary fitting)
      expect(chunk.tokens).toBeLessThanOrEqual(maxTokens + 10);
    }
  });

  it('handles overlap correctly', () => {
    const maxTokens = 100;
    const overlap = 20;
    const text = 'A sentence here. '.repeat(200); // 3400 chars = ~850 tokens
    const chunks = chunkText(text, maxTokens, overlap);

    expect(chunks.length).toBeGreaterThan(1);

    // With overlap, chunks should have overlapping offsets
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].startOffset + chunks[i - 1].content.length;
      // Current chunk should start before previous chunk ends (overlap)
      expect(chunks[i].startOffset).toBeLessThan(prevEnd);
    }
  });

  it('splits on paragraph boundaries', () => {
    const text = 'Paragraph one content here.\n\nParagraph two content here.\n\n' +
      'Paragraph three with more text.\n\nParagraph four final.';
    // Use small maxTokens to force splitting
    const chunks = chunkText(text, 20, 0);

    // Should have split at paragraph boundaries
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should not contain partial paragraphs from second chunk
    if (chunks.length >= 2) {
      expect(chunks[0].content).not.toContain('Paragraph four');
    }
  });

  it('handles empty text', () => {
    const chunks = chunkText('');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('');
    expect(chunks[0].tokens).toBe(0);
  });

  it('chunks have sequential indices', () => {
    const text = 'x'.repeat(20000);
    const chunks = chunkText(text, 500, 0);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it('uses default maxTokens of 4000 and overlap of 200', () => {
    // Text of exactly 4000 tokens (16000 chars) should be single chunk
    const text = 'a'.repeat(16000);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);

    // Text of 4001 tokens (16004 chars) should be multiple chunks
    const text2 = 'a'.repeat(16004);
    const chunks2 = chunkText(text2);
    expect(chunks2.length).toBeGreaterThan(1);
  });
});
