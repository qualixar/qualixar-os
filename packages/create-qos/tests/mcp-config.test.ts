/**
 * Tests for mcp-config.ts — IDE MCP configuration writer.
 *
 * Covers: all 6 IDE paths, file creation, merge with existing config,
 * backup creation, parse error handling, VS Code "servers" key difference.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mock homedir() and process.cwd() to use temp directories
// ---------------------------------------------------------------------------

const TEST_HOME = join(tmpdir(), `qos-test-mcp-${Date.now()}`);
const TEST_CWD = join(TEST_HOME, 'project');

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => TEST_HOME };
});

// Override process.cwd for path resolution
const originalCwd = process.cwd;

// Import AFTER mocks are set up
import {
  configureMcp,
  isMcpConfigured,
  getConfigPath,
  getServerKey,
  getAllIdeConfigPaths,
  SUPPORTED_IDES,
} from '../src/mcp-config.js';
import type { SupportedIde } from '../src/mcp-config.js';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
  mkdirSync(TEST_CWD, { recursive: true });
  process.cwd = () => TEST_CWD;
});

afterEach(() => {
  process.cwd = originalCwd;
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// getConfigPath tests
// ---------------------------------------------------------------------------

describe('getConfigPath', () => {
  it('returns ~/.claude.json for claude-code', () => {
    expect(getConfigPath('claude-code')).toBe(join(TEST_HOME, '.claude.json'));
  });

  it('returns project-level .cursor/mcp.json for cursor', () => {
    expect(getConfigPath('cursor')).toBe(join(TEST_CWD, '.cursor', 'mcp.json'));
  });

  it('returns global ~/.cursor/mcp.json for cursor-global', () => {
    expect(getConfigPath('cursor-global')).toBe(join(TEST_HOME, '.cursor', 'mcp.json'));
  });

  it('returns windsurf global path', () => {
    expect(getConfigPath('windsurf')).toBe(
      join(TEST_HOME, '.codeium', 'windsurf', 'mcp_config.json'),
    );
  });

  it('returns project-level .vscode/mcp.json for vscode', () => {
    expect(getConfigPath('vscode')).toBe(join(TEST_CWD, '.vscode', 'mcp.json'));
  });

  it('returns antigravity global path', () => {
    expect(getConfigPath('antigravity')).toBe(
      join(TEST_HOME, '.gemini', 'antigravity', 'mcp_config.json'),
    );
  });
});

// ---------------------------------------------------------------------------
// getServerKey tests
// ---------------------------------------------------------------------------

describe('getServerKey', () => {
  it('returns "servers" for vscode', () => {
    expect(getServerKey('vscode')).toBe('servers');
  });

  it('returns "mcpServers" for all other IDEs', () => {
    const others: SupportedIde[] = ['claude-code', 'cursor', 'cursor-global', 'windsurf', 'antigravity'];
    for (const ide of others) {
      expect(getServerKey(ide)).toBe('mcpServers');
    }
  });
});

// ---------------------------------------------------------------------------
// configureMcp — file creation (no existing file)
// ---------------------------------------------------------------------------

describe('configureMcp — new file creation', () => {
  it('creates config file with qos entry for claude-code', async () => {
    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);
    expect(result.path).toBe(join(TEST_HOME, '.claude.json'));
    expect(result.backedUp).toBe(false); // No file to back up

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os).toEqual({
      command: 'npx',
      args: ['-y', 'qualixar-os', 'mcp'],
      env: {},
    });
  });

  it('creates nested parent directories for windsurf', async () => {
    const result = await configureMcp('windsurf');

    expect(result.success).toBe(true);
    expect(existsSync(result.path)).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os.command).toBe('npx');
  });

  it('creates nested parent directories for antigravity', async () => {
    const result = await configureMcp('antigravity');

    expect(result.success).toBe(true);
    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os.command).toBe('npx');
  });

  it('uses "servers" key for vscode and includes type:stdio', async () => {
    const result = await configureMcp('vscode');

    expect(result.success).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));

    // VS Code uses "servers" not "mcpServers"
    expect(written.servers).toBeDefined();
    expect(written.mcpServers).toBeUndefined();

    // VS Code entries include "type": "stdio"
    expect(written.servers.qualixar-os.type).toBe('stdio');
    expect(written.servers.qualixar-os.command).toBe('npx');
  });

  it('creates project-level .cursor/mcp.json for cursor', async () => {
    const result = await configureMcp('cursor');

    expect(result.success).toBe(true);
    expect(result.path).toBe(join(TEST_CWD, '.cursor', 'mcp.json'));

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// configureMcp — merge with existing config
// ---------------------------------------------------------------------------

describe('configureMcp — merge with existing', () => {
  it('preserves existing MCP server entries', async () => {
    const configPath = getConfigPath('claude-code');
    mkdirSync(join(TEST_HOME), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          'other-server': { command: 'node', args: ['server.js'] },
        },
        someOtherKey: 'preserved',
      }),
    );

    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);
    expect(result.backedUp).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));

    // Existing server preserved
    expect(written.mcpServers['other-server']).toEqual({ command: 'node', args: ['server.js'] });
    // Qualixar OS added
    expect(written.mcpServers.qualixar-os).toBeDefined();
    // Other top-level keys preserved
    expect(written.someOtherKey).toBe('preserved');
  });

  it('updates existing qos entry without duplicating', async () => {
    const configPath = getConfigPath('cursor-global');
    mkdirSync(join(TEST_HOME, '.cursor'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          qos: { command: 'old-command', args: ['old'] },
        },
      }),
    );

    const result = await configureMcp('cursor-global');

    expect(result.success).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os.command).toBe('npx');
    expect(written.mcpServers.qualixar-os.args).toEqual(['-y', 'qualixar-os', 'mcp']);
  });

  it('handles existing file with no mcpServers key', async () => {
    const configPath = getConfigPath('claude-code');
    writeFileSync(configPath, JSON.stringify({ theme: 'dark' }));

    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.theme).toBe('dark');
    expect(written.mcpServers.qualixar-os).toBeDefined();
  });

  it('merges into VS Code "servers" key preserving other servers', async () => {
    const configPath = getConfigPath('vscode');
    mkdirSync(join(TEST_CWD, '.vscode'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        servers: {
          'my-server': { command: 'python', args: ['serve.py'] },
        },
      }),
    );

    const result = await configureMcp('vscode');

    expect(result.success).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.servers['my-server']).toEqual({ command: 'python', args: ['serve.py'] });
    expect(written.servers.qualixar-os.type).toBe('stdio');
  });
});

// ---------------------------------------------------------------------------
// configureMcp — backup behavior
// ---------------------------------------------------------------------------

describe('configureMcp — backup', () => {
  it('creates .bak file when modifying existing config', async () => {
    const configPath = getConfigPath('claude-code');
    const original = { mcpServers: { existing: { command: 'test' } } };
    writeFileSync(configPath, JSON.stringify(original));

    const result = await configureMcp('claude-code');

    expect(result.backedUp).toBe(true);
    expect(existsSync(`${configPath}.bak`)).toBe(true);

    // Backup contains original content
    const backup = JSON.parse(readFileSync(`${configPath}.bak`, 'utf-8'));
    expect(backup.mcpServers.existing.command).toBe('test');
    expect(backup.mcpServers.qualixar-os).toBeUndefined();
  });

  it('does not create .bak when no existing file', async () => {
    const result = await configureMcp('windsurf');

    expect(result.backedUp).toBe(false);
    expect(existsSync(`${result.path}.bak`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// configureMcp — error handling
// ---------------------------------------------------------------------------

describe('configureMcp — error handling', () => {
  it('handles corrupted JSON by starting fresh', async () => {
    const configPath = getConfigPath('claude-code');
    writeFileSync(configPath, '{ this is not valid json !!!');

    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);
    expect(result.backedUp).toBe(true); // Backed up the corrupted file

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os).toBeDefined();
  });

  it('handles non-object JSON (array) by starting fresh', async () => {
    const configPath = getConfigPath('claude-code');
    writeFileSync(configPath, '[1, 2, 3]');

    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);

    const written = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(written.mcpServers.qualixar-os).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isMcpConfigured
// ---------------------------------------------------------------------------

describe('isMcpConfigured', () => {
  it('returns false when no config file exists', async () => {
    expect(await isMcpConfigured('claude-code')).toBe(false);
  });

  it('returns true after configureMcp', async () => {
    await configureMcp('claude-code');
    expect(await isMcpConfigured('claude-code')).toBe(true);
  });

  it('returns false when config exists but no qos entry', async () => {
    const configPath = getConfigPath('cursor-global');
    mkdirSync(join(TEST_HOME, '.cursor'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: 'test' } } }),
    );

    expect(await isMcpConfigured('cursor-global')).toBe(false);
  });

  it('checks "servers" key for vscode', async () => {
    const configPath = getConfigPath('vscode');
    mkdirSync(join(TEST_CWD, '.vscode'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ servers: { qos: { command: 'npx' } } }),
    );

    expect(await isMcpConfigured('vscode')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAllIdeConfigPaths
// ---------------------------------------------------------------------------

describe('getAllIdeConfigPaths', () => {
  it('returns entries for all supported IDEs', () => {
    const paths = getAllIdeConfigPaths();

    expect(paths).toHaveLength(SUPPORTED_IDES.length);

    const ides = paths.map((p) => p.ide);
    for (const ide of SUPPORTED_IDES) {
      expect(ides).toContain(ide);
    }
  });

  it('each entry has a non-empty path', () => {
    const paths = getAllIdeConfigPaths();

    for (const entry of paths) {
      expect(entry.path.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// SUPPORTED_IDES constant
// ---------------------------------------------------------------------------

describe('SUPPORTED_IDES', () => {
  it('contains exactly 6 IDEs', () => {
    expect(SUPPORTED_IDES).toHaveLength(6);
  });

  it('includes claude-code (our competitive advantage)', () => {
    expect(SUPPORTED_IDES).toContain('claude-code');
  });
});
