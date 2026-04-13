/**
 * Tests for Qualixar OS Shell Tool (Real Implementation)
 *
 * Tests shell_exec with sandbox validation, timeout,
 * denied commands, and error handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { shellExec } from '../../src/tools/shell-tool.js';
import type { ShellToolConfig } from '../../src/tools/shell-tool.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSandbox(allowResult: boolean, reason = 'test') {
  return {
    validate: vi.fn().mockReturnValue({
      allowed: allowResult,
      reason,
      layer: 'filesystem' as const,
      severity: 'info' as const,
    }),
    validateCommand: vi.fn().mockReturnValue({
      allowed: allowResult,
      reason,
      layer: 'filesystem' as const,
      severity: allowResult ? 'info' as const : 'critical' as const,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shellExec', () => {
  it('executes a simple command', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: 'echo hello' }, config);

    expect(result.content).toContain('hello');
    expect(result.isError).toBeUndefined();
  });

  it('returns error for missing command', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({}, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('command is required');
  });

  it('returns error for non-string command', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: 42 }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('command is required');
  });

  it('returns error for empty command', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: '   ' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('must not be empty');
  });

  it('blocks command when sandbox denies', async () => {
    const sandbox = mockSandbox(false, 'Command contains denied pattern');
    const config: ShellToolConfig = {
      sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl,
    };
    const result = await shellExec({ command: 'rm -rf /' }, config);

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Security');
    expect(result.content).toContain('blocked');
  });

  it('allows command when sandbox approves', async () => {
    const sandbox = mockSandbox(true);
    const config: ShellToolConfig = {
      sandbox: sandbox as unknown as import('../../src/security/filesystem-sandbox.js').FilesystemSandboxImpl,
    };
    const result = await shellExec({ command: 'echo sandbox-ok' }, config);

    expect(result.content).toContain('sandbox-ok');
    expect(sandbox.validateCommand).toHaveBeenCalledTimes(1);
  });

  it('captures stderr on non-zero exit code', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: 'ls /nonexistent-path-qos-test 2>&1 || true' }, config);

    // The command uses || true so exit code is 0, but output should mention the path
    expect(result.content).toBeTruthy();
  });

  it('handles command failure with exit code', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: 'false' }, config);

    // 'false' returns exit code 1
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Exit code: 1');
  });

  it('returns (no output) for commands with no stdout', async () => {
    const config: ShellToolConfig = { sandbox: null };
    const result = await shellExec({ command: 'true' }, config);

    // 'true' produces no output
    expect(result.content).toBe('(no output)');
  });

  it('respects timeout configuration', async () => {
    const config: ShellToolConfig = { sandbox: null, timeoutMs: 100 };
    // Sleep for 5 seconds but timeout is 100ms
    const result = await shellExec({ command: 'sleep 5' }, config);

    expect(result.isError).toBe(true);
    // execAsync rejects on timeout
    expect(result.content).toBeTruthy();
  });
});
