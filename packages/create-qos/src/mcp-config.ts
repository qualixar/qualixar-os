/**
 * mcp-config.ts — IDE MCP configuration writer.
 * Supports: claude-code, cursor, cursor-global, windsurf, vscode, antigravity.
 *
 * Pattern: merge, don't overwrite — read existing config, add Qualixar OS entry, write back.
 * Always backs up existing config before modifying (.bak).
 *
 * Competitive advantage: Claude Code support (Mastra doesn't have this).
 */

import { existsSync, copyFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SUPPORTED_IDES = [
  'claude-code',
  'cursor',
  'cursor-global',
  'windsurf',
  'vscode',
  'antigravity',
] as const;

export type SupportedIde = (typeof SUPPORTED_IDES)[number];

export interface McpConfigResult {
  readonly success: boolean;
  readonly path: string;
  readonly error?: string;
  readonly backedUp?: boolean;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function getConfigPath(ide: SupportedIde): string {
  const home = homedir();
  const paths: Record<SupportedIde, string> = {
    'claude-code': join(home, '.claude.json'),
    cursor: join(process.cwd(), '.cursor', 'mcp.json'),
    'cursor-global': join(home, '.cursor', 'mcp.json'),
    windsurf: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    vscode: join(process.cwd(), '.vscode', 'mcp.json'),
    antigravity: join(home, '.gemini', 'antigravity', 'mcp_config.json'),
  };
  return paths[ide];
}

/**
 * Returns the JSON key that holds MCP server entries.
 * VS Code uses "servers"; all others use "mcpServers".
 */
export function getServerKey(ide: SupportedIde): string {
  return ide === 'vscode' ? 'servers' : 'mcpServers';
}

// ---------------------------------------------------------------------------
// Qualixar OS MCP entry builders
// ---------------------------------------------------------------------------

function buildQosEntry(ide: SupportedIde): Record<string, unknown> {
  const base = {
    command: 'npx',
    args: ['-y', 'qualixar-os', 'mcp'],
    env: {},
  };

  // VS Code entries include "type": "stdio"
  if (ide === 'vscode') {
    return { ...base, type: 'stdio' };
  }

  return base;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function readJsonSafe(
  filePath: string,
): Promise<{ data: Record<string, unknown> | null; parseError: boolean }> {
  if (!existsSync(filePath)) {
    return { data: null, parseError: false };
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { data: null, parseError: true };
    }
    return { data: parsed as Record<string, unknown>, parseError: false };
  } catch {
    return { data: null, parseError: true };
  }
}

function backupFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;

  try {
    copyFileSync(filePath, `${filePath}.bak`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Injects the Qualixar OS MCP server entry into the given IDE's config file.
 *
 * 1. Read existing config (if present)
 * 2. Parse JSON
 * 3. Back up existing file (.bak)
 * 4. Add/update `qos` entry in the correct object key
 * 5. Write back with pretty-printed JSON
 * 6. Create parent directories if needed
 *
 * Never overwrites existing MCP entries for OTHER servers.
 */
export async function configureMcp(ide: SupportedIde): Promise<McpConfigResult> {
  const configPath = getConfigPath(ide);
  const key = getServerKey(ide);
  const entry = buildQosEntry(ide);

  try {
    // Ensure parent directory exists
    await mkdir(dirname(configPath), { recursive: true });

    const { data: existing, parseError } = await readJsonSafe(configPath);

    let backedUp = false;

    // Back up if file exists (whether parseable or not)
    if (existsSync(configPath)) {
      backedUp = backupFile(configPath);
    }

    // If parse failed, warn but start fresh
    const base = parseError ? {} : (existing ?? {});

    // Extract existing servers — preserve all other entries
    const existingServers =
      typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])
        ? (base[key] as Record<string, unknown>)
        : {};

    // Build merged config immutably
    const merged = {
      ...base,
      [key]: {
        ...existingServers,
        qos: entry,
      },
    };

    await writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

    return { success: true, path: configPath, backedUp };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, path: configPath, error: message };
  }
}

/**
 * Checks whether the Qualixar OS MCP entry is already present in a given IDE config.
 * Used by the doctor command to verify MCP setup.
 */
export async function isMcpConfigured(ide: SupportedIde): Promise<boolean> {
  const configPath = getConfigPath(ide);
  const key = getServerKey(ide);

  const { data } = await readJsonSafe(configPath);
  if (!data) return false;

  const servers = data[key];
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return false;

  return 'qos' in servers;
}

/**
 * Returns all IDE config paths (for doctor check / display).
 */
export function getAllIdeConfigPaths(): ReadonlyArray<{ ide: SupportedIde; path: string }> {
  return SUPPORTED_IDES.map((ide) => ({ ide, path: getConfigPath(ide) }));
}
