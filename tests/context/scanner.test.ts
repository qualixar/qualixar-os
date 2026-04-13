/**
 * Phase 12 -- Scanner Tests
 * Tests directory scanning with real temp filesystem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory } from '../../src/context/scanner.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), 'qos-scanner-test-' + Date.now());

beforeAll(async () => {
  await mkdir(join(TEST_DIR, 'docs'), { recursive: true });
  await mkdir(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(join(TEST_DIR, '.git'), { recursive: true });
  await mkdir(join(TEST_DIR, 'sub', 'nested'), { recursive: true });

  // Supported files
  await writeFile(join(TEST_DIR, 'readme.md'), '# Readme');
  await writeFile(join(TEST_DIR, 'docs', 'guide.txt'), 'A guide');
  await writeFile(join(TEST_DIR, 'docs', 'config.yaml'), 'key: val');
  await writeFile(join(TEST_DIR, 'sub', 'data.json'), '{"a":1}');
  await writeFile(join(TEST_DIR, 'sub', 'nested', 'deep.csv'), 'x,y\n1,2');

  // Unsupported files (should be skipped)
  await writeFile(join(TEST_DIR, 'script.ts'), 'const x = 1;');
  await writeFile(join(TEST_DIR, 'image.png'), 'fake-png');

  // Files in skipped dirs
  await writeFile(join(TEST_DIR, 'node_modules', 'pkg', 'index.md'), '# Dep');
  await writeFile(join(TEST_DIR, '.git', 'config'), 'git config');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scanDirectory', () => {
  it('finds all supported files recursively', async () => {
    const result = await scanDirectory(TEST_DIR);
    expect(result.files.length).toBe(5);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.results).toHaveLength(5);
  });

  it('skips node_modules and .git directories', async () => {
    const result = await scanDirectory(TEST_DIR);
    const allPaths = result.files.join(' ');
    expect(allPaths).not.toContain('node_modules');
    expect(allPaths).not.toContain('.git');
  });

  it('records skipped files and directories', async () => {
    const result = await scanDirectory(TEST_DIR);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('respects recursive=false option', async () => {
    const result = await scanDirectory(TEST_DIR, { recursive: false });
    // Only root-level files: readme.md
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain('readme.md');
  });

  it('filters by custom extensions', async () => {
    const result = await scanDirectory(TEST_DIR, { extensions: ['.yaml'] });
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain('config.yaml');
  });

  it('handles extension with or without dot prefix', async () => {
    const result = await scanDirectory(TEST_DIR, { extensions: ['json'] });
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain('data.json');
  });

  it('returns parse results with correct formats', async () => {
    const result = await scanDirectory(TEST_DIR);
    const formats = result.results.map((r) => r.parseResult.format);
    expect(formats).toContain('markdown');
    expect(formats).toContain('text');
    expect(formats).toContain('yaml');
    expect(formats).toContain('json');
    expect(formats).toContain('csv');
  });

  it('throws for non-directory path', async () => {
    await expect(
      scanDirectory(join(TEST_DIR, 'readme.md')),
    ).rejects.toThrow('Not a directory');
  });

  it('respects maxFiles limit', async () => {
    const result = await scanDirectory(TEST_DIR, { maxFiles: 2 });
    expect(result.files.length).toBeLessThanOrEqual(2);
  });
});
