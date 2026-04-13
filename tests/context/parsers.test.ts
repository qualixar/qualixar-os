/**
 * Phase 12 -- Parser Tests
 * Tests each format parser with sample content.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile, estimateTokens, SUPPORTED_EXTENSIONS } from '../../src/context/parsers.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), 'qos-parser-test-' + Date.now());

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });

  await writeFile(join(TEST_DIR, 'doc.md'), '# Hello\n\nWorld');
  await writeFile(join(TEST_DIR, 'doc.txt'), 'Plain text content');
  await writeFile(join(TEST_DIR, 'data.json'), '{"key": "value", "num": 42}');
  await writeFile(join(TEST_DIR, 'config.yaml'), 'name: test\nversion: 1');
  await writeFile(join(TEST_DIR, 'config.yml'), 'items:\n  - a\n  - b');
  await writeFile(join(TEST_DIR, 'data.csv'), 'name,age\nAlice,30\nBob,25');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates tokens as ceil(length / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('SUPPORTED_EXTENSIONS', () => {
  it('contains all 9 supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS.size).toBe(9);
    expect(SUPPORTED_EXTENSIONS.has('.md')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.pdf')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.docx')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.xlsx')).toBe(true);
  });
});

describe('parseFile', () => {
  it('parses .md files as markdown', async () => {
    const result = await parseFile(join(TEST_DIR, 'doc.md'));
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('# Hello');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.metadata).toHaveProperty('charCount');
  });

  it('parses .txt files as text', async () => {
    const result = await parseFile(join(TEST_DIR, 'doc.txt'));
    expect(result.format).toBe('text');
    expect(result.content).toBe('Plain text content');
    expect(result.tokens).toBe(estimateTokens('Plain text content'));
  });

  it('parses .json files', async () => {
    const result = await parseFile(join(TEST_DIR, 'data.json'));
    expect(result.format).toBe('json');
    expect(result.content).toContain('"key"');
    expect(result.content).toContain('"value"');
    expect(result.metadata).toHaveProperty('type');
    expect(result.metadata).toHaveProperty('isArray');
  });

  it('parses .yaml files', async () => {
    const result = await parseFile(join(TEST_DIR, 'config.yaml'));
    expect(result.format).toBe('yaml');
    expect(result.content).toContain('name');
    expect(result.content).toContain('test');
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('parses .yml files', async () => {
    const result = await parseFile(join(TEST_DIR, 'config.yml'));
    expect(result.format).toBe('yaml');
    expect(result.content).toContain('items');
  });

  it('parses .csv files', async () => {
    const result = await parseFile(join(TEST_DIR, 'data.csv'));
    expect(result.format).toBe('csv');
    expect(result.content).toContain('Alice');
    expect(result.metadata).toHaveProperty('lineCount');
    expect(result.metadata.lineCount).toBe(3);
  });

  it('returns placeholder for .pdf files', async () => {
    // PDF is a placeholder — no real file needed
    const result = await parseFile('/fake/doc.pdf');
    expect(result.format).toBe('pdf');
    expect(result.tokens).toBe(0);
    expect(result.metadata).toHaveProperty('placeholder', true);
  });

  it('returns placeholder for .xlsx files', async () => {
    const result = await parseFile('/fake/data.xlsx');
    expect(result.format).toBe('xlsx');
    expect(result.tokens).toBe(0);
    expect(result.metadata).toHaveProperty('placeholder', true);
  });

  it('returns placeholder for .docx when mammoth is not installed', async () => {
    // mammoth may or may not be installed — either way should not throw
    const result = await parseFile('/fake/doc.docx');
    expect(result.format).toBe('docx');
    // If mammoth IS installed, this would fail to find the file and fall back to placeholder.
    // Either way, result should be valid.
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('tokens');
  });

  it('throws for unsupported extensions', async () => {
    await expect(parseFile('/fake/script.rb')).rejects.toThrow('Unsupported file format');
  });
});
