// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Shell Tool (Real Implementation)
 *
 * shell_exec with SecurityEngine command validation.
 * Uses child_process.execSync with timeout and denied command checks.
 * Graceful degradation: returns stub if SecurityEngine is not available.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolResult } from './tool-registry.js';

const execAsync = promisify(exec);
import type { FilesystemSandboxImpl } from '../security/filesystem-sandbox.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShellToolConfig {
  readonly sandbox: FilesystemSandboxImpl | null;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  /** Working directory forced for all shell commands. Defaults to process.cwd(). */
  readonly workingDirectory?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1 MB

/**
 * Environment variable keys stripped from child process to prevent
 * credential leakage and environment manipulation by agents.
 */
const SANITIZED_ENV_KEYS: readonly string[] = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'DATABASE_URL',
  'DB_PASSWORD',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'JWT_SECRET',
];

// ---------------------------------------------------------------------------
// shell_exec Implementation
// ---------------------------------------------------------------------------

export async function shellExec(
  input: Record<string, unknown>,
  config: ShellToolConfig,
): Promise<ToolResult> {
  const command = input.command as string | undefined;

  if (!command || typeof command !== 'string') {
    return { content: 'Error: command is required and must be a string', isError: true };
  }

  if (command.trim().length === 0) {
    return { content: 'Error: command must not be empty', isError: true };
  }

  // Security validation via sandbox denied_commands list
  if (config.sandbox) {
    const decision = config.sandbox.validateCommand(command);
    if (!decision.allowed) {
      return {
        content: `Security: shell_exec blocked — ${decision.reason}`,
        isError: true,
      };
    }
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const cwd = config.workingDirectory ?? process.cwd();

  // Build sanitized environment — strip sensitive keys from child process
  const sanitizedEnv = { ...process.env };
  for (const key of SANITIZED_ENV_KEYS) {
    delete sanitizedEnv[key];
  }

  try {
    const { stdout } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: maxOutput,
      encoding: 'utf-8',
      cwd,
      env: sanitizedEnv,
    });

    return { content: stdout || '(no output)' };
  } catch (error: unknown) {
    // exec rejects on non-zero exit code — capture stdout+stderr
    if (error && typeof error === 'object' && 'stdout' in error) {
      const execError = error as {
        stdout: string | null;
        stderr: string | null;
        code: number | null;
        message: string;
      };
      const stdout = execError.stdout ?? '';
      const stderr = execError.stderr ?? '';
      const exitCode = execError.code ?? 1;

      // Check for timeout
      if (execError.message.includes('TIMEOUT') || execError.message.includes('timed out')) {
        return {
          content: `Error: command timed out after ${timeoutMs}ms`,
          isError: true,
        };
      }

      return {
        content: `Exit code: ${exitCode}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`.trim(),
        isError: exitCode !== 0,
      };
    }

    const msg = error instanceof Error ? error.message : String(error);
    return { content: `Error executing command: ${msg}`, isError: true };
  }
}
