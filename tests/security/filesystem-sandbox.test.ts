/**
 * Qualixar OS Phase 2 -- Filesystem Sandbox Tests
 * TDD: Path validation, denylist wins, traversal detection, command validation
 */

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { FilesystemSandboxImpl } from '../../src/security/filesystem-sandbox.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { QosConfig } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: {
  allowed_paths?: string[];
  denied_commands?: string[];
  denied_paths?: string[];
}): ConfigManager {
  const cwd = process.cwd();
  return {
    get: () =>
      ({
        security: {
          container_isolation: false,
          allowed_paths: overrides?.allowed_paths ?? [cwd],
          denied_commands: overrides?.denied_commands ?? ['rm -rf', 'sudo'],
          ...(overrides?.denied_paths !== undefined
            ? { denied_paths: overrides.denied_paths }
            : {}),
        },
      }) as unknown as QosConfig,
    getValue: vi.fn(),
    reload: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilesystemSandboxImpl', () => {
  describe('validate()', () => {
    it('allows paths within allowed directory', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, 'src/index.ts'));
      expect(result.allowed).toBe(true);
      expect(result.layer).toBe('filesystem');
    });

    it('denies /etc/passwd', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validate('/etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('catches path traversal with ..', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validate('../../../etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('traversal');
      expect(result.severity).toBe('critical');
    });

    it('catches null byte injection', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validate('file.txt\0.jpg');
      expect(result.allowed).toBe(false);
      expect(result.severity).toBe('critical');
    });

    it('denies .env files via glob pattern', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, '.env'));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denylist');
    });

    it('denies .pem files via glob pattern', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, 'cert.pem'));
      expect(result.allowed).toBe(false);
    });

    it('denies .key files via glob pattern', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, 'private.key'));
      expect(result.allowed).toBe(false);
    });

    it('denies .git/config via glob pattern', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, '.git/config'));
      expect(result.allowed).toBe(false);
    });

    it('denylist wins over allowlist', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(
        makeConfig({ allowed_paths: [cwd] }),
      );
      // .env is in both allowed dir and deny glob pattern
      const result = sandbox.validate(path.join(cwd, 'project/.env'));
      expect(result.allowed).toBe(false);
    });

    it('denies paths not in any allowed directory', () => {
      const sandbox = new FilesystemSandboxImpl(
        makeConfig({
          allowed_paths: ['/tmp/allowed-only'],
          denied_paths: [], // no deny patterns so we hit the allowlist check
        }),
      );
      const result = sandbox.validate('/var/data/file.txt');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in any allowed');
    });

    it('denies home directory paths via ~ resolution', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const homePath = path.join(os.homedir(), 'Documents/secret.txt');
      const result = sandbox.validate(homePath);
      expect(result.allowed).toBe(false);
    });

    it('denies /usr/ paths', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validate('/usr/local/bin/node');
      expect(result.allowed).toBe(false);
    });

    it('returns severity info for allowed paths', () => {
      const cwd = process.cwd();
      const sandbox = new FilesystemSandboxImpl(makeConfig({ allowed_paths: [cwd] }));
      const result = sandbox.validate(path.join(cwd, 'package.json'));
      expect(result.severity).toBe('info');
    });
  });

  describe('validateCommand()', () => {
    it('denies rm -rf commands', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validateCommand('rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rm -rf');
      expect(result.severity).toBe('critical');
    });

    it('denies sudo commands', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validateCommand('sudo apt-get install');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('sudo');
    });

    it('allows safe commands', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validateCommand('ls -la');
      expect(result.allowed).toBe(true);
      expect(result.layer).toBe('filesystem');
    });

    it('allows npm commands', () => {
      const sandbox = new FilesystemSandboxImpl(makeConfig());
      const result = sandbox.validateCommand('npm install express');
      expect(result.allowed).toBe(true);
    });

    it('uses custom denied_commands from config', () => {
      const sandbox = new FilesystemSandboxImpl(
        makeConfig({ denied_commands: ['DROP TABLE'] }),
      );
      const result = sandbox.validateCommand('DROP TABLE users');
      expect(result.allowed).toBe(false);
    });
  });
});
