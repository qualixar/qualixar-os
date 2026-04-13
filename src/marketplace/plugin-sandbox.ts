// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Plugin Sandbox
 *
 * Enforces permission tiers for installed plugins:
 *   - verified / local: full permissions (trusted code)
 *   - community: no shell_exec, no file_write outside project root,
 *                30-second execution timeout
 *
 * Pattern: Decorator — wrapHandler wraps any tool handler with permission
 * checks before delegation, without mutating the original handler.
 */

import * as path from 'node:path';
import type {
  PluginTier,
  PluginPermissions,
  PluginSandbox,
} from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMUNITY_TIMEOUT_MS = 30_000;
const COMMUNITY_DENIED_TOOLS: readonly string[] = ['shell_exec', 'file_write'];

// ---------------------------------------------------------------------------
// Per-tier permission table
// ---------------------------------------------------------------------------

function buildPermissions(tier: PluginTier): PluginPermissions {
  switch (tier) {
    case 'verified':
    case 'local':
      return {
        tier,
        canExecuteShell: true,
        canWriteFiles: true,
        canReadFiles: true,
        allowedPaths: [],
        deniedTools: [],
        maxExecutionTimeMs: 0, // 0 = no limit
      };

    case 'community':
      return {
        tier,
        canExecuteShell: false,
        canWriteFiles: false,
        canReadFiles: true,
        allowedPaths: [process.cwd()],
        deniedTools: COMMUNITY_DENIED_TOOLS,
        maxExecutionTimeMs: COMMUNITY_TIMEOUT_MS,
      };
  }
}

// ---------------------------------------------------------------------------
// In-memory tier map (populated by plugin-lifecycle on install)
// ---------------------------------------------------------------------------

type ToolResult = { readonly content: string; readonly isError?: boolean };
type Handler = (input: Record<string, unknown>) => Promise<ToolResult>;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class PluginSandboxImpl implements PluginSandbox {
  /** pluginId -> tier */
  private readonly _tiers = new Map<string, PluginTier>();

  register(pluginId: string, tier: PluginTier): void {
    this._tiers.set(pluginId, tier);
  }

  unregister(pluginId: string): void {
    this._tiers.delete(pluginId);
  }

  getPermissions(tier: PluginTier): PluginPermissions {
    return buildPermissions(tier);
  }

  canUseTool(pluginId: string, toolName: string): boolean {
    const tier = this._tiers.get(pluginId) ?? 'community';
    const perms = buildPermissions(tier);
    return !perms.deniedTools.includes(toolName);
  }

  canAccessPath(pluginId: string, filePath: string): boolean {
    const tier = this._tiers.get(pluginId) ?? 'community';
    const perms = buildPermissions(tier);

    if (perms.allowedPaths.length === 0) {
      // No restriction
      return true;
    }

    const resolved = path.resolve(filePath);
    return perms.allowedPaths.some((allowed) =>
      resolved.startsWith(path.resolve(allowed)),
    );
  }

  wrapHandler(pluginId: string, handler: Handler): Handler {
    const tier = this._tiers.get(pluginId) ?? 'community';
    const perms = buildPermissions(tier);

    if (tier === 'verified' || tier === 'local') {
      // Trusted tier — pass through without overhead
      return handler;
    }

    // Community tier: permission-check + timeout wrapper
    return async (input: Record<string, unknown>): Promise<ToolResult> => {
      // Check for denied tool names embedded in input (best-effort defence)
      const toolName = typeof input['_tool'] === 'string' ? input['_tool'] : '';
      if (toolName && !this.canUseTool(pluginId, toolName)) {
        return {
          content: `Permission denied: tool '${toolName}' is not allowed for community plugins`,
          isError: true,
        };
      }

      const timeoutMs = perms.maxExecutionTimeMs;

      // L-09: Store timeout ID and clear on success to prevent leak / unhandled rejection
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<ToolResult>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Community plugin timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });

      const result = await Promise.race([handler(input), timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginSandbox(): PluginSandbox & {
  register(pluginId: string, tier: PluginTier): void;
  unregister(pluginId: string): void;
} {
  return new PluginSandboxImpl();
}
