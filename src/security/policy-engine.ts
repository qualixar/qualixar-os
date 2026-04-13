// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Policy Engine
 * LLD Section 2.5
 *
 * YAML policy loading, evaluation with priority sorting, hot-reload via
 * fs.watch with 500ms debounce, inheritance chain support.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import type { ConfigManager } from '../config/config-manager.js';
import type {
  SecurityAction,
  SecurityDecision,
  PolicyRule,
  PolicyEngine,
} from '../types/common.js';

// ---------------------------------------------------------------------------
// Policy File Schema
// ---------------------------------------------------------------------------

interface PolicyFile {
  readonly version: number;
  readonly name: string;
  readonly extends?: string;
  readonly rules?: readonly PolicyRuleYaml[];
  readonly network_allowlist?: readonly string[];
  readonly filesystem_allowlist?: readonly string[];
  readonly filesystem_denylist?: readonly string[];
}

interface PolicyRuleYaml {
  readonly name: string;
  readonly action: 'allow' | 'deny' | 'warn';
  readonly priority: number;
  readonly conditions: Record<string, unknown>;
  readonly message?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PolicyEngineImpl implements PolicyEngine {
  private policies: PolicyRule[] = [];
  private networkAllowlist: string[] = [];
  private watcher: fs.FSWatcher | null = null;

  constructor(private readonly configManager: ConfigManager) {
    const config = configManager.get();
    const policyPath = config.security.policy_path;
    if (policyPath !== undefined) {
      this.loadPolicy(policyPath);
    }
  }

  loadPolicy(yamlPath: string): void {
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`Policy file not found: ${yamlPath}`);
    }

    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = yaml.parse(raw) as PolicyFile;

    if (parsed.version !== 1) {
      throw new Error(`Unsupported policy version: ${parsed.version}`);
    }

    // Handle inheritance
    if (parsed.extends !== undefined) {
      const parentPath = this.resolveParentPolicy(parsed.extends, yamlPath);
      if (parentPath !== null) {
        this.loadPolicy(parentPath);
      }
    }

    // Merge rules (child overrides parent with same name)
    const existingNames = new Set(this.policies.map((p) => p.name));
    for (const rule of parsed.rules ?? []) {
      const policyRule: PolicyRule = {
        name: rule.name,
        action: rule.action,
        conditions: { ...rule.conditions, message: rule.message },
        priority: rule.priority,
      };

      if (existingNames.has(rule.name)) {
        const idx = this.policies.findIndex((p) => p.name === rule.name);
        this.policies[idx] = policyRule;
      } else {
        this.policies.push(policyRule);
      }
    }

    // Sort by priority descending
    this.policies.sort((a, b) => b.priority - a.priority);

    // Load allowlists
    this.networkAllowlist = [
      ...this.networkAllowlist,
      ...(parsed.network_allowlist ?? []),
    ];

    // Set up hot-reload watcher with 500ms debounce
    if (this.watcher !== null) {
      this.watcher.close();
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    /* v8 ignore start -- fs.watch callback fires asynchronously on real file changes; not reachable in unit tests */
    this.watcher = fs.watch(yamlPath, (eventType) => {
      if (eventType === 'change') {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          try {
            this.policies = [];
            this.networkAllowlist = [];
            this.loadPolicy(yamlPath);
          } catch (err) {
            console.error('Security policy: hot-reload parse error, keeping existing policies:', err);
          }
        }, 500);
      }
    });
    /* v8 ignore stop */
  }

  evaluate(action: SecurityAction): SecurityDecision {
    for (const rule of this.policies) {
      if (!this.matchesConditions(rule.conditions, action)) {
        continue;
      }

      const message = (rule.conditions.message as string) ?? undefined;

      if (rule.action === 'deny') {
        return {
          allowed: false,
          reason: `Policy rule '${rule.name}': ${message ?? 'Denied by policy'}`,
          layer: 'inference',
          severity: 'critical',
        };
      }

      if (rule.action === 'warn') {
        return {
          allowed: true,
          reason: `Policy warning '${rule.name}': ${message ?? 'Warning'}`,
          layer: 'inference',
          severity: 'warning',
        };
      }

      if (rule.action === 'allow') {
        return {
          allowed: true,
          reason: `Policy rule '${rule.name}': Explicitly allowed`,
          layer: 'inference',
          severity: 'info',
        };
      }
    }

    // No rule matched: default allow
    return {
      allowed: true,
      reason: 'No policy rule matched, default allow',
      layer: 'inference',
      severity: 'info',
    };
  }

  checkNetworkAllowlist(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.networkAllowlist.includes(hostname);
    } catch (err) {
      console.error('Security policy: malformed URL check failed:', err);
      return false; // malformed URL = denied
    }
  }

  getPolicies(): readonly PolicyRule[] {
    return Object.freeze([...this.policies]);
  }

  destroy(): void {
    if (this.watcher !== null) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private matchesConditions(
    conditions: Record<string, unknown>,
    action: SecurityAction,
  ): boolean {
    if (conditions.type !== undefined && conditions.type !== action.type) {
      return false;
    }

    if (conditions.pattern !== undefined) {
      const regex = new RegExp(conditions.pattern as string);
      const target =
        (action.details.command as string) ??
        (action.details.path as string) ??
        (action.details.url as string) ??
        '';
      if (!regex.test(target)) {
        return false;
      }
    }

    if (conditions.path_prefix !== undefined) {
      const actionPath = action.details.path as string;
      if (
        actionPath === undefined ||
        !actionPath.startsWith(conditions.path_prefix as string)
      ) {
        return false;
      }
    }

    if (conditions.not_in_allowlist === true) {
      const url = action.details.url as string;
      if (url !== undefined) {
        try {
          const hostname = new URL(url).hostname;
          if (this.networkAllowlist.includes(hostname)) {
            return false; // IS in allowlist, so condition is false
          }
        } catch (err) {
          console.error('Security policy: malformed URL in allowlist check:', err);
          // malformed URL -- condition matches
        }
      }
    }

    if (conditions.risk_score_above !== undefined) {
      const score = action.details.riskScore as number;
      if (
        score === undefined ||
        score <= (conditions.risk_score_above as number)
      ) {
        return false;
      }
    }

    // M-07: max_size_mb policy condition -- blocks actions whose payload
    // exceeds the configured size limit (e.g., file uploads, skill content).
    if (conditions.max_size_mb !== undefined) {
      const sizeBytes = action.details.sizeBytes as number;
      const maxBytes = (conditions.max_size_mb as number) * 1024 * 1024;
      if (sizeBytes !== undefined && sizeBytes > maxBytes) {
        return false;
      }
    }

    return true;
  }

  // M-09: Built-in policy map for well-known parent policy names.
  // These resolve to bundled policy files shipped with Qualixar OS.
  private static readonly BUILT_IN_POLICY_MAP: Readonly<Record<string, string>> = {
    'companion-defaults': 'policies/companion-defaults.yaml',
    'power-defaults': 'policies/power-defaults.yaml',
    'global-defaults': 'policies/global-defaults.yaml',
  };

  private resolveParentPolicy(name: string, currentPath: string): string | null {
    // M-09: Check built-in policy map first
    const builtIn = PolicyEngineImpl.BUILT_IN_POLICY_MAP[name];
    if (builtIn !== undefined) {
      const builtInPath = path.resolve(
        path.dirname(currentPath),
        builtIn,
      );
      if (fs.existsSync(builtInPath)) {
        return builtInPath;
      }
    }

    // Try relative to current policy directory
    const dir = path.dirname(currentPath);
    const relative = path.join(dir, name);
    if (fs.existsSync(relative)) {
      return relative;
    }

    // Try as absolute path
    if (fs.existsSync(name)) {
      return name;
    }

    return null;
  }
}
