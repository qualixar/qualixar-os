// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Filesystem Sandbox
 * LLD Section 2.4
 *
 * Path normalization, allowlist/denylist (denylist wins), symlink escape
 * prevention, traversal detection.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { ConfigManager } from '../config/config-manager.js';
import type { SecurityDecision } from '../types/common.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DENY_LIST: readonly string[] = [
  '~/',
  '/etc/',
  '/private/etc/',
  '/usr/',
  '/private/var/',
  '**/.env',
  '**/*.pem',
  '**/*.key',
  '**/.git/config',
];

/**
 * Hardened denied command patterns — ALWAYS enforced regardless of user config.
 * These represent catastrophic or exploit-class operations that no agent should
 * ever execute. Config-level denied_commands are additive on top of these.
 *
 * Categories:
 *   1. Destructive filesystem operations
 *   2. Disk/partition destruction
 *   3. Permission escalation
 *   4. Remote code execution (pipe-to-shell)
 *   5. Shell injection primitives
 *   6. Privilege escalation
 *   7. Reverse shell / backdoor
 *   8. Network exfiltration
 *   9. Process killing
 *  10. Environment manipulation
 *  11. Path traversal in commands
 *
 * SEC: Critical commands use word-boundary regex patterns to prevent
 * false positives (e.g., "inform" matching "rm", "chdirmod" matching "chmod").
 * Patterns prefixed with "REGEX:" are matched via RegExp; plain strings use includes().
 */
const HARDENED_DENIED_COMMANDS: readonly string[] = [
  // 1. Destructive filesystem — regex for word-boundary matching
  'REGEX:\\brm\\s+-rf\\s+/',
  'REGEX:\\brm\\s+-rf\\s+~',
  'REGEX:\\brm\\s+-rf\\s+\\*',
  'REGEX:\\brm\\s+-rf\\s+\\.',
  'REGEX:\\brmdir\\s+/',
  // 2. Disk/partition destruction
  'REGEX:\\bdd\\s+if=',
  'REGEX:\\bmkfs\\b',
  'REGEX:\\bfdisk\\b',
  'REGEX:\\bparted\\b',
  'REGEX:\\bwipefs\\b',
  // 3. Permission escalation
  'REGEX:\\bchmod\\s+777',
  'REGEX:\\bchmod\\s+-R\\s+777',
  'REGEX:\\bchown\\s+root',
  'REGEX:\\bchown\\s+-R\\s+root',
  'REGEX:\\bsetuid\\b',
  // 4. Remote code execution (pipe-to-shell)
  'REGEX:\\bcurl\\s*\\|\\s*sh\\b',
  'REGEX:\\bcurl\\s*\\|\\s*bash\\b',
  'REGEX:\\bwget\\s*\\|\\s*sh\\b',
  'REGEX:\\bwget\\s*\\|\\s*bash\\b',
  // 5. Shell injection — only at line start to avoid blocking `docker exec`, `python -c "eval()"`
  'REGEX:^\\s*eval\\s+',
  'REGEX:^\\s*exec\\s+',
  '$(curl',
  '`curl',
  '$(wget',
  '`wget',
  // 6. Privilege escalation
  'REGEX:\\bsudo\\s+',
  'REGEX:\\bsu\\s+',
  'REGEX:\\bsu\\s*-',
  'REGEX:\\bdoas\\s+',
  'REGEX:\\bpkexec\\b',
  // 7. Reverse shell / backdoor
  'REGEX:\\bnc\\s+-l',
  'REGEX:\\bncat\\s+',
  'REGEX:\\bnetcat\\s+',
  '/dev/tcp/',
  'bash -i >& /dev/tcp',
  'python -c "import socket',
  'python3 -c "import socket',
  'REGEX:\\bsocat\\s+',
  // 8. Network exfiltration
  'REGEX:\\bssh\\s+',
  'REGEX:\\bscp\\s+',
  'REGEX:\\bsftp\\s+',
  'REGEX:\\brsync\\s+',
  'REGEX:\\bftp\\s+',
  'REGEX:\\btelnet\\s+',
  // 9. Process killing
  'REGEX:\\bkill\\s+-9',
  'REGEX:\\bkillall\\b',
  'REGEX:\\bpkill\\b',
  // 10. Environment manipulation
  'REGEX:\\bexport\\s+',
  'REGEX:\\bunset\\s+',
  'source /etc/',
  // 11. Path traversal in commands — only catch traversal to sensitive dirs
  'REGEX:\\.\\.\\/(?:etc|usr|private|root|home|proc|sys|dev|boot)',
];

/**
 * Pre-compiled regex cache for REGEX: prefixed patterns.
 * Built once at module load time for O(1) per-check matching.
 */
const COMPILED_DENIED_REGEXES: ReadonlyArray<{ readonly pattern: RegExp; readonly source: string }> =
  HARDENED_DENIED_COMMANDS
    .filter((p) => p.startsWith('REGEX:'))
    .map((p) => ({ pattern: new RegExp(p.slice(6)), source: p.slice(6) }));

const PLAIN_DENIED_COMMANDS: readonly string[] =
  HARDENED_DENIED_COMMANDS.filter((p) => !p.startsWith('REGEX:'));

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class FilesystemSandboxImpl {
  private readonly allowedPaths: readonly string[];
  private readonly deniedPaths: readonly string[];
  private readonly configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    const config = configManager.get();
    const secConfig = config.security;

    // G-06: Auto-allow the default workspace directory so agents can write output files
    const workspaceBase = path.join(os.homedir(), '.qualixar-os', 'workspaces');
    const configPaths = secConfig.allowed_paths.map((p: string) => path.resolve(p));
    this.allowedPaths = configPaths.includes(workspaceBase)
      ? configPaths
      : [...configPaths, workspaceBase];

    const rawDenied = (secConfig as Record<string, unknown>).denied_paths as string[] | undefined;
    const denySource = rawDenied ?? [...DEFAULT_DENY_LIST];

    this.deniedPaths = denySource.map((p: string) => {
      if (p.startsWith('**/')) {
        return p; // glob pattern, kept as-is
      }
      if (p === '~/') {
        return os.homedir() + '/';
      }
      return path.resolve(p);
    });
  }

  validate(filePath: string): SecurityDecision {
    // Step 1: Resolve path
    const resolved = path.resolve(filePath);

    // Step 2: Path traversal detection (check BEFORE symlink resolution)
    if (filePath.includes('..') || filePath.includes('\0')) {
      return {
        allowed: false,
        reason: `Path traversal attempt detected: ${filePath}`,
        layer: 'filesystem',
        severity: 'critical',
      };
    }

    // H-08: Resolve symlinks to real path to prevent escape
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(resolved);
    } catch {
      // Path doesn't exist yet — use resolved path
      realPath = resolved;
    }

    // H-09: GLOB denylist ALWAYS wins (sensitive files), then allowlist, then directory denylist

    // Step 3: GLOB DENYLIST — sensitive file patterns ALWAYS denied (denylist wins)
    for (const pattern of this.deniedPaths) {
      if (pattern.startsWith('**/')) {
        if (this.matchGlobDeny(realPath, pattern)) {
          return {
            allowed: false,
            reason: `Path matches denylist pattern: ${pattern}`,
            layer: 'filesystem',
            severity: 'critical',
          };
        }
      }
    }

    // Step 4: ALLOWLIST CHECK — explicit allowed paths
    let inAllowlist = false;
    for (const allowed of this.allowedPaths) {
      if (realPath.startsWith(allowed)) {
        inAllowlist = true;
        break;
      }
    }

    if (inAllowlist) {
      return {
        allowed: true,
        reason: 'Path validated against sandbox rules',
        layer: 'filesystem',
        severity: 'info',
      };
    }

    // Step 5: DIRECTORY DENYLIST — broad areas denied for non-allowed paths
    for (const pattern of this.deniedPaths) {
      if (!pattern.startsWith('**/')) {
        if (realPath.startsWith(pattern)) {
          return {
            allowed: false,
            reason: `Path in denied directory: ${pattern}`,
            layer: 'filesystem',
            severity: 'critical',
          };
        }
      }
    }

    // Step 6: Not in any list — deny by default
    return {
      allowed: false,
      reason: `Path ${realPath} not in any allowed directory`,
      layer: 'filesystem',
      severity: 'warning',
    };
  }

  private matchGlobDeny(resolved: string, pattern: string): boolean {
    const globSuffix = pattern.slice(3); // remove **/

    if (globSuffix.startsWith('*.')) {
      // Extension wildcard: **/*.key → match any file ending with .key
      const ext = globSuffix.slice(1); // .key
      return resolved.endsWith(ext);
    }

    if (globSuffix.includes('/')) {
      // Path suffix: **/.git/config → match path ending with /.git/config
      return resolved.endsWith('/' + globSuffix);
    }

    // Exact basename: **/.env → match file named .env
    return path.basename(resolved) === globSuffix;
  }

  validateCommand(command: string): SecurityDecision {
    const normalized = command.trim();

    // Step 1: HARDENED denylist — regex patterns (word-boundary safe)
    for (const entry of COMPILED_DENIED_REGEXES) {
      if (entry.pattern.test(normalized)) {
        // Return the matched substring (human-readable) instead of the raw regex pattern
        const match = normalized.match(entry.pattern);
        const matched = match ? match[0] : entry.source;
        return {
          allowed: false,
          reason: `Command blocked by hardened security: '${matched}'`,
          layer: 'filesystem',
          severity: 'critical',
        };
      }
    }

    // Step 1b: HARDENED denylist — plain string patterns (literal substring match)
    for (const denied of PLAIN_DENIED_COMMANDS) {
      if (normalized.includes(denied)) {
        return {
          allowed: false,
          reason: `Command blocked by hardened security: '${denied}'`,
          layer: 'filesystem',
          severity: 'critical',
        };
      }
    }

    // Step 2: Config-level denied_commands — user/org additive rules
    const config = this.configManager.get();
    const deniedCommands = config.security.denied_commands;

    for (const denied of deniedCommands) {
      if (normalized.includes(denied)) {
        return {
          allowed: false,
          reason: `Command contains denied pattern: '${denied}'`,
          layer: 'filesystem',
          severity: 'critical',
        };
      }
    }

    return {
      allowed: true,
      reason: 'Command passed sandbox validation',
      layer: 'filesystem',
      severity: 'info',
    };
  }
}
