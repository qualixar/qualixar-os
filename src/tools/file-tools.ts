// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- File Tools (Real Implementation)
 *
 * file_read and file_write with FilesystemSandbox validation.
 * Rejects symlink attacks, path traversal, and denylist violations.
 * Graceful degradation: returns stub if sandbox is not available.
 */

import { readFile, writeFile, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ToolResult } from './tool-registry.js';
import type { FilesystemSandboxImpl } from '../security/filesystem-sandbox.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileToolsConfig {
  readonly sandbox: FilesystemSandboxImpl | null;
  readonly maxReadSizeBytes?: number;
  readonly maxWriteSizeBytes?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_READ_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_WRITE_SIZE = 10 * 1024 * 1024; // 10 MB — prevents disk-filling attacks

// ---------------------------------------------------------------------------
// Symlink Check
// ---------------------------------------------------------------------------

async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stat = await lstat(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// file_read Implementation
// ---------------------------------------------------------------------------

export async function fileRead(
  input: Record<string, unknown>,
  config: FileToolsConfig,
): Promise<ToolResult> {
  const filePath = input.path as string | undefined;

  if (!filePath || typeof filePath !== 'string') {
    return { content: 'Error: path is required and must be a string', isError: true };
  }

  const resolved = path.resolve(filePath);

  // Sandbox validation
  if (config.sandbox) {
    const decision = config.sandbox.validate(resolved);
    if (!decision.allowed) {
      return {
        content: `Security: file_read blocked — ${decision.reason}`,
        isError: true,
      };
    }
  }

  // Symlink attack prevention
  if (await isSymlink(resolved)) {
    return {
      content: `Security: file_read blocked — symlink detected at ${resolved}`,
      isError: true,
    };
  }

  const maxSize = config.maxReadSizeBytes ?? DEFAULT_MAX_READ_SIZE;

  try {
    const buffer = await readFile(resolved);
    if (buffer.length > maxSize) {
      return {
        content: `Error: file exceeds max read size (${buffer.length} > ${maxSize} bytes)`,
        isError: true,
      };
    }
    return { content: buffer.toString('utf-8') };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: `Error reading file: ${msg}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// file_write Implementation
// ---------------------------------------------------------------------------

export async function fileWrite(
  input: Record<string, unknown>,
  config: FileToolsConfig,
): Promise<ToolResult> {
  const filePath = input.path as string | undefined;
  const content = input.content as string | undefined;

  if (!filePath || typeof filePath !== 'string') {
    return { content: 'Error: path is required and must be a string', isError: true };
  }

  if (content === undefined || content === null) {
    return { content: 'Error: content is required', isError: true };
  }

  const resolved = path.resolve(filePath);

  // Sandbox validation
  if (config.sandbox) {
    const decision = config.sandbox.validate(resolved);
    if (!decision.allowed) {
      return {
        content: `Security: file_write blocked — ${decision.reason}`,
        isError: true,
      };
    }
  }

  // Symlink attack prevention on existing file
  if (await isSymlink(resolved)) {
    return {
      content: `Security: file_write blocked — symlink detected at ${resolved}`,
      isError: true,
    };
  }

  // File size limit — prevents disk-filling attacks from malicious agents
  const maxWriteSize = config.maxWriteSizeBytes ?? DEFAULT_MAX_WRITE_SIZE;
  const contentStr = String(content);
  const contentBytes = Buffer.byteLength(contentStr, 'utf-8');
  if (contentBytes > maxWriteSize) {
    return {
      content: `Security: file_write blocked — content size ${contentBytes} bytes exceeds max write size ${maxWriteSize} bytes`,
      isError: true,
    };
  }

  try {
    // Auto-create parent directories (agents write to nested paths like src/backend/app.py)
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, contentStr, 'utf-8');
    return { content: `Successfully wrote ${contentStr.length} bytes to ${resolved}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: `Error writing file: ${msg}`, isError: true };
  }
}
