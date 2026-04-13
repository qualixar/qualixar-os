// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Directory Scanner
 *
 * Recursively walks a directory, filters by supported extensions,
 * skips common non-content directories, and parses each file.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { SUPPORTED_EXTENSIONS, parseFile } from './parsers.js';
import type { ParseResult } from './parsers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanOptions {
  readonly recursive?: boolean;
  readonly extensions?: readonly string[];
  readonly maxFiles?: number;
}

export interface ScanFileResult {
  readonly filePath: string;
  readonly parseResult: ParseResult;
}

export interface ScanResult {
  readonly files: readonly string[];
  readonly results: readonly ScanFileResult[];
  readonly totalTokens: number;
  readonly skipped: readonly string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', '.venv', '.tox',
]);

const DEFAULT_MAX_FILES = 500;

// ---------------------------------------------------------------------------
// Internal: Recursive File Collection
// ---------------------------------------------------------------------------

async function collectFiles(
  dir: string,
  extensions: ReadonlySet<string>,
  recursive: boolean,
  maxFiles: number,
  files: string[],
  skipped: string[],
): Promise<void> {
  if (files.length >= maxFiles) return;

  let rawEntries: unknown[];
  try {
    rawEntries = await readdir(dir, { withFileTypes: true }) as unknown[];
  } catch {
    skipped.push(dir);
    return;
  }

  // Cast needed for Node 25 Dirent<NonSharedBuffer> typing quirk
  type DirEntry = { name: string; isDirectory(): boolean; isFile(): boolean };

  for (const raw of rawEntries) {
    if (files.length >= maxFiles) return;

    const entry = raw as DirEntry;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        skipped.push(fullPath);
        continue;
      }
      if (recursive) {
        await collectFiles(fullPath, extensions, recursive, maxFiles, files, skipped);
      }
      continue;
    }

    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        files.push(fullPath);
      } else {
        skipped.push(fullPath);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scanDirectory(
  dir: string,
  options?: ScanOptions,
): Promise<ScanResult> {
  const recursive = options?.recursive ?? true;
  const extensions = options?.extensions
    ? new Set(options.extensions.map((e) => e.startsWith('.') ? e : `.${e}`))
    : SUPPORTED_EXTENSIONS;
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;

  // Verify dir exists and is a directory
  const dirStat = await stat(dir);
  if (!dirStat.isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const files: string[] = [];
  const skipped: string[] = [];

  await collectFiles(dir, extensions, recursive, maxFiles, files, skipped);

  // Parse each file
  const results: ScanFileResult[] = [];
  let totalTokens = 0;

  for (const filePath of files) {
    try {
      const parseResult = await parseFile(filePath);
      results.push({ filePath, parseResult });
      totalTokens += parseResult.tokens;
    } catch {
      skipped.push(filePath);
    }
  }

  return { files, results, totalTokens, skipped };
}
