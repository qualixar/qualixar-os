/**
 * Tests for Qualixar OS File Tools (Real Implementation)
 *
 * Tests file_read and file_write with sandbox enforcement,
 * symlink detection, error handling, and input validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileRead, fileWrite } from '../../src/tools/file-tools.js';
import type { FileToolsConfig } from '../../src/tools/file-tools.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), 'qos-file-tools-test-' + Date.now());

function mockSandbox(allowResult: boolean, reason = 'test') {
  return {
    validate: vi.fn().mockReturnValue({
      allowed: allowResult,
      reason,
      layer: 'filesystem' as const,
      severity: allowResult ? 'info' as const : 'critical' as const,
    }),
    validateCommand: vi.fn().mockReturnValue({
      allowed: true,
      reason: 'ok',
      layer: 'filesystem' as const,
      severity: 'info' as const,
    }),
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
// file_read Tests
// ---------------------------------------------------------------------------

describe('fileRead', () => {
  it('reads a file successfully without sandbox', async () => {
    const testFile = join(testDir, 'read-test.txt');
    writeFileSync(testFile, 'Hello Qualixar OS');

    const config: FileToolsConfig = { sandbox: null };
    const result = await fileRead({ path: testFile }, config);

    expect(result.content).toBe('Hello Qualixar OS');
    expect(result.isError).toBeUndefined();
  });

  it('reads a file with sandbox allowing', async () => {
    const testFile = join(testDir, 'sandboxed-read.txt');
    writeFileSync(testFile, 'Allowed content');

    const sandbox = mockSandbox(true);
    const config: FileToolsConfig = { sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl };
    const result = await fileRead({ path: testFile }, config);

    expect(result.content).toBe('Allowed content');
    expect(sandbox.validate).toHaveBeenCalledTimes(1);
  });

  it('blocks read when sandbox denies', async () => {
    const sandbox = mockSandbox(false, 'Path not in allowed directory');
    const config: FileToolsConfig = { sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl };
    const result = await fileRead({ path: '/etc/passwd' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Security');
    expect(result.content).toContain('blocked');
  });

  it('returns error when path is missing', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileRead({}, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('path is required');
  });

  it('returns error when path is not a string', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileRead({ path: 123 }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('path is required');
  });

  it('returns error for non-existent file', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileRead({ path: join(testDir, 'nonexistent.txt') }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Error reading file');
  });

  it('rejects symlinks', async () => {
    const realFile = join(testDir, 'real.txt');
    const linkFile = join(testDir, 'link.txt');
    writeFileSync(realFile, 'real content');
    symlinkSync(realFile, linkFile);

    const config: FileToolsConfig = { sandbox: null };
    const result = await fileRead({ path: linkFile }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('symlink');
  });

  it('enforces max read size', async () => {
    const testFile = join(testDir, 'big.txt');
    writeFileSync(testFile, 'x'.repeat(1000));

    const config: FileToolsConfig = { sandbox: null, maxReadSizeBytes: 500 };
    const result = await fileRead({ path: testFile }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('exceeds max read size');
  });
});

// ---------------------------------------------------------------------------
// file_write Tests
// ---------------------------------------------------------------------------

describe('fileWrite', () => {
  it('writes a file successfully without sandbox', async () => {
    const testFile = join(testDir, 'write-test.txt');

    const config: FileToolsConfig = { sandbox: null };
    const result = await fileWrite({ path: testFile, content: 'Written by Qualixar OS' }, config);

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('Successfully wrote');
    expect(result.content).toContain('22 bytes');
  });

  it('writes with sandbox allowing', async () => {
    const testFile = join(testDir, 'sandboxed-write.txt');
    const sandbox = mockSandbox(true);
    const config: FileToolsConfig = { sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl };
    const result = await fileWrite({ path: testFile, content: 'data' }, config);

    expect(result.isError).toBeUndefined();
    expect(sandbox.validate).toHaveBeenCalledTimes(1);
  });

  it('blocks write when sandbox denies', async () => {
    const sandbox = mockSandbox(false, 'Path in denied directory');
    const config: FileToolsConfig = { sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl };
    const result = await fileWrite({ path: '/etc/bad', content: 'bad' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Security');
  });

  it('returns error when path is missing', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileWrite({ content: 'data' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('path is required');
  });

  it('returns error when content is missing', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileWrite({ path: '/tmp/test.txt' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('content is required');
  });

  it('rejects symlinks on write', async () => {
    const realFile = join(testDir, 'real-w.txt');
    const linkFile = join(testDir, 'link-w.txt');
    writeFileSync(realFile, 'original');
    symlinkSync(realFile, linkFile);

    const config: FileToolsConfig = { sandbox: null };
    const result = await fileWrite({ path: linkFile, content: 'hijack' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('symlink');
  });

  it('auto-creates parent directories on write', async () => {
    const config: FileToolsConfig = { sandbox: null };
    const result = await fileWrite({
      path: join(testDir, 'nonexistent-dir', 'sub', 'file.txt'),
      content: 'data',
    }, config);

    // file_write now auto-creates parent dirs (agents write to nested paths like src/backend/app.py)
    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('Successfully wrote');
  });
});
