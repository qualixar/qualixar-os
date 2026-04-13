/**
 * Tests for Qualixar OS Documentation Ingester
 *
 * Tests frontmatter parsing, markdown file discovery,
 * and full documentation ingestion pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseFrontmatter,
  findMarkdownFiles,
  ingestDocs,
} from '../../src/help/docs-ingester.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), 'qos-docs-ingester-test-' + Date.now());

function mockDocumentIngester() {
  let chunkCounter = 0;
  return {
    ingestContent: vi.fn().mockImplementation(async () => ({
      filePath: 'test.md',
      fileName: 'test.md',
      chunkCount: 3,
      totalChars: 100,
      estimatedTokens: 25,
      entryIds: [`chunk-${++chunkCounter}`, `chunk-${++chunkCounter}`, `chunk-${++chunkCounter}`],
    })),
    ingestDocument: vi.fn(),
    hasEmbeddingProvider: vi.fn().mockReturnValue(false),
  };
}

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* cleanup best-effort */ }
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with key-value pairs', () => {
    const content = `---
title: Getting Started
category: guide
priority: 1
---
# Getting Started

This is the body.`;

    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe('Getting Started');
    expect(result.metadata.category).toBe('guide');
    expect(result.metadata.priority).toBe('1');
    expect(result.body).toContain('# Getting Started');
    expect(result.body).toContain('This is the body.');
  });

  it('returns empty metadata and full body when no frontmatter', () => {
    const content = '# No Frontmatter\n\nJust markdown.';
    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe(content);
  });

  it('handles quoted string values', () => {
    const content = `---
title: "Quoted Title"
---
Body`;

    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe('Quoted Title');
  });

  it('handles array values in JSON format', () => {
    const content = `---
tags: ["guide", "getting-started"]
---
Body`;

    const result = parseFrontmatter(content);
    expect(result.metadata.tags).toEqual(['guide', 'getting-started']);
  });

  it('handles empty frontmatter block', () => {
    const content = `---

---
Body content`;

    const result = parseFrontmatter(content);
    expect(result.metadata).toEqual({});
    expect(result.body).toBe('Body content');
  });

  it('handles lines without colons in frontmatter', () => {
    const content = `---
title: Valid
no-colon-here
---
Body`;

    // "no-colon-here" has a hyphen-colon? Actually no. Let me be precise.
    // "no-colon-here" does NOT have a colon... wait it doesn't. Actually
    // it does NOT contain ':'. So it gets skipped.
    const result = parseFrontmatter(content);
    expect(result.metadata.title).toBe('Valid');
    expect(Object.keys(result.metadata)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findMarkdownFiles
// ---------------------------------------------------------------------------

describe('findMarkdownFiles', () => {
  it('finds .md files in a directory', async () => {
    writeFileSync(join(testDir, 'readme.md'), '# README');
    writeFileSync(join(testDir, 'guide.md'), '# Guide');
    writeFileSync(join(testDir, 'notes.txt'), 'not markdown');

    const files = await findMarkdownFiles(testDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('readme.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('guide.md'))).toBe(true);
  });

  it('finds .md files recursively in subdirectories', async () => {
    const subDir = join(testDir, 'sub');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(testDir, 'top.md'), '# Top');
    writeFileSync(join(subDir, 'nested.md'), '# Nested');

    const files = await findMarkdownFiles(testDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('nested.md'))).toBe(true);
  });

  it('returns empty array for non-existent directory', async () => {
    const files = await findMarkdownFiles('/tmp/does-not-exist-' + Date.now());
    expect(files).toEqual([]);
  });

  it('returns empty array for directory with no .md files', async () => {
    writeFileSync(join(testDir, 'data.json'), '{}');
    const files = await findMarkdownFiles(testDir);
    expect(files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ingestDocs
// ---------------------------------------------------------------------------

describe('ingestDocs', () => {
  it('ingests all .md files from a directory', async () => {
    writeFileSync(join(testDir, 'getting-started.md'), `---
title: Getting Started
---
# Getting Started

How to install and run Qualixar OS.`);

    writeFileSync(join(testDir, 'commands.md'), `---
title: Commands
---
# Commands

List of available commands.`);

    const ingester = mockDocumentIngester();
    const result = await ingestDocs(ingester as never, { docsPath: testDir });

    expect(result.totalFiles).toBe(2);
    expect(result.totalChunks).toBe(6); // 3 chunks per file
    expect(result.errors).toHaveLength(0);
    expect(ingester.ingestContent).toHaveBeenCalledTimes(2);

    // Verify metadata was passed correctly
    const firstCall = ingester.ingestContent.mock.calls[0];
    expect(firstCall[3]).toMatchObject({
      layer: 'semantic',
      metadata: expect.objectContaining({
        docType: 'help',
        source: 'qualixar-docs',
      }),
    });
  });

  it('returns empty results for non-existent docs directory', async () => {
    const ingester = mockDocumentIngester();
    const result = await ingestDocs(ingester as never, {
      docsPath: '/tmp/does-not-exist-' + Date.now(),
    });

    expect(result.totalFiles).toBe(0);
    expect(result.totalChunks).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('captures errors from individual file ingestion failures', async () => {
    writeFileSync(join(testDir, 'good.md'), '# Good file');

    const ingester = mockDocumentIngester();
    // Make the second call fail
    ingester.ingestContent
      .mockResolvedValueOnce({
        filePath: 'good.md',
        fileName: 'good.md',
        chunkCount: 2,
        totalChars: 50,
        estimatedTokens: 12,
        entryIds: ['c1', 'c2'],
      });

    // Add a second file that will cause an error
    writeFileSync(join(testDir, 'bad.md'), '# Bad file');
    ingester.ingestContent.mockRejectedValueOnce(new Error('Ingestion failed'));

    const result = await ingestDocs(ingester as never, { docsPath: testDir });

    expect(result.totalFiles).toBe(1); // only the good one
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Ingestion failed');
  });

  it('passes custom chunk size and overlap options', async () => {
    writeFileSync(join(testDir, 'doc.md'), '# Doc');

    const ingester = mockDocumentIngester();
    await ingestDocs(ingester as never, {
      docsPath: testDir,
      chunkSize: 500,
      chunkOverlap: 100,
    });

    const callOptions = ingester.ingestContent.mock.calls[0][3];
    expect(callOptions.chunkSize).toBe(500);
    expect(callOptions.chunkOverlap).toBe(100);
  });
});
