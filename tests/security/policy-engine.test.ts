/**
 * Qualixar OS Phase 2 -- Policy Engine Tests
 * TDD: YAML loading, rule evaluation, priority sorting, network allowlist
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PolicyEngineImpl } from '../../src/security/policy-engine.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { QosConfig, SecurityAction } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(policyPath?: string): ConfigManager {
  return {
    get: () =>
      ({
        security: {
          container_isolation: false,
          policy_path: policyPath,
          allowed_paths: ['./'],
          denied_commands: ['rm -rf', 'sudo'],
        },
      }) as unknown as QosConfig,
    getValue: vi.fn(),
    reload: vi.fn(),
  };
}

let tmpDir: string;
let tmpFiles: string[] = [];

function writeTmpYaml(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  tmpFiles.push(filePath);
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolicyEngineImpl', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qos-policy-'));
    tmpFiles = [];
  });

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
  });

  describe('loadPolicy()', () => {
    it('loads valid YAML and populates rules', () => {
      const yamlPath = writeTmpYaml('test.yaml', `
version: 1
name: test-policy
rules:
  - name: block-rm
    action: deny
    priority: 100
    conditions:
      type: shell_command
      pattern: "rm -rf"
    message: "Dangerous command blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const policies = engine.getPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('block-rm');
      expect(policies[0].action).toBe('deny');
      engine.destroy();
    });

    it('throws on missing file', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      expect(() => engine.loadPolicy('/nonexistent/file.yaml')).toThrow(
        'Policy file not found',
      );
    });

    it('throws on unsupported version', () => {
      const yamlPath = writeTmpYaml('bad-version.yaml', `
version: 99
name: bad
`);
      const engine = new PolicyEngineImpl(makeConfig());
      expect(() => engine.loadPolicy(yamlPath)).toThrow('Unsupported policy version');
      engine.destroy();
    });

    it('sorts rules by priority descending', () => {
      const yamlPath = writeTmpYaml('priority.yaml', `
version: 1
name: priority-test
rules:
  - name: low
    action: allow
    priority: 10
    conditions: {}
  - name: high
    action: deny
    priority: 100
    conditions: {}
  - name: mid
    action: warn
    priority: 50
    conditions: {}
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const policies = engine.getPolicies();
      expect(policies[0].name).toBe('high');
      expect(policies[1].name).toBe('mid');
      expect(policies[2].name).toBe('low');
      engine.destroy();
    });

    it('loads network_allowlist from YAML', () => {
      const yamlPath = writeTmpYaml('net.yaml', `
version: 1
name: net-policy
network_allowlist:
  - api.example.com
  - cdn.example.com
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      expect(engine.checkNetworkAllowlist('https://api.example.com/v1')).toBe(true);
      expect(engine.checkNetworkAllowlist('https://evil.com')).toBe(false);
      engine.destroy();
    });

    it('loads policy from config.security.policy_path on construction', () => {
      const yamlPath = writeTmpYaml('auto.yaml', `
version: 1
name: auto-loaded
rules:
  - name: auto-rule
    action: allow
    priority: 1
    conditions: {}
`);
      const engine = new PolicyEngineImpl(makeConfig(yamlPath));
      expect(engine.getPolicies()).toHaveLength(1);
      engine.destroy();
    });

    it('handles inheritance (child overrides parent)', () => {
      const parentPath = writeTmpYaml('parent.yaml', `
version: 1
name: parent
rules:
  - name: shared-rule
    action: allow
    priority: 10
    conditions: {}
  - name: parent-only
    action: warn
    priority: 5
    conditions: {}
`);
      const childPath = writeTmpYaml('child.yaml', `
version: 1
name: child
extends: "${path.basename(parentPath)}"
rules:
  - name: shared-rule
    action: deny
    priority: 100
    conditions: {}
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(childPath);
      const policies = engine.getPolicies();
      // shared-rule should be overridden by child (deny, priority 100)
      const shared = policies.find((p) => p.name === 'shared-rule');
      expect(shared?.action).toBe('deny');
      expect(shared?.priority).toBe(100);
      // parent-only should still exist
      expect(policies.find((p) => p.name === 'parent-only')).toBeDefined();
      engine.destroy();
    });
  });

  describe('evaluate()', () => {
    it('returns deny for matching deny rule', () => {
      const yamlPath = writeTmpYaml('deny.yaml', `
version: 1
name: deny-test
rules:
  - name: block-shell
    action: deny
    priority: 100
    conditions:
      type: shell_command
    message: "Shell commands blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const action: SecurityAction = {
        type: 'shell_command',
        details: { command: 'ls' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(false);
      expect(result.severity).toBe('critical');
      engine.destroy();
    });

    it('returns warn with allowed=true for matching warn rule', () => {
      const yamlPath = writeTmpYaml('warn.yaml', `
version: 1
name: warn-test
rules:
  - name: warn-net
    action: warn
    priority: 50
    conditions:
      type: network_request
    message: "Network access monitored"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const action: SecurityAction = {
        type: 'network_request',
        details: { url: 'https://example.com' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(true);
      expect(result.severity).toBe('warning');
      engine.destroy();
    });

    it('returns allow for matching allow rule', () => {
      const yamlPath = writeTmpYaml('allow.yaml', `
version: 1
name: allow-test
rules:
  - name: allow-file
    action: allow
    priority: 50
    conditions:
      type: file_access
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const action: SecurityAction = {
        type: 'file_access',
        details: { path: '/tmp/test.txt' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(true);
      expect(result.severity).toBe('info');
      engine.destroy();
    });

    it('returns default allow when no rules match', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      const action: SecurityAction = {
        type: 'file_access',
        details: { path: '/tmp/test.txt' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('No policy rule matched');
      engine.destroy();
    });

    it('matches by pattern condition', () => {
      const yamlPath = writeTmpYaml('pattern.yaml', `
version: 1
name: pattern-test
rules:
  - name: block-rm-pattern
    action: deny
    priority: 100
    conditions:
      pattern: "rm\\\\s+-rf"
    message: "rm -rf blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const action: SecurityAction = {
        type: 'shell_command',
        details: { command: 'rm -rf /' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(false);
      engine.destroy();
    });

    it('higher priority rules evaluated first', () => {
      const yamlPath = writeTmpYaml('priority-eval.yaml', `
version: 1
name: priority-eval
rules:
  - name: allow-all
    action: allow
    priority: 10
    conditions:
      type: shell_command
  - name: deny-all
    action: deny
    priority: 100
    conditions:
      type: shell_command
    message: "High priority deny wins"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      const action: SecurityAction = {
        type: 'shell_command',
        details: { command: 'echo hi' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(false); // deny has higher priority
      engine.destroy();
    });
  });

  describe('checkNetworkAllowlist()', () => {
    it('returns true for allowed hostname', () => {
      const yamlPath = writeTmpYaml('net-allow.yaml', `
version: 1
name: net-allow
network_allowlist:
  - api.openai.com
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      expect(engine.checkNetworkAllowlist('https://api.openai.com/v1/chat')).toBe(true);
      engine.destroy();
    });

    it('returns false for blocked hostname', () => {
      const yamlPath = writeTmpYaml('net-block.yaml', `
version: 1
name: net-block
network_allowlist:
  - api.openai.com
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      expect(engine.checkNetworkAllowlist('https://evil.com/hack')).toBe(false);
      engine.destroy();
    });

    it('returns false for malformed URL', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      expect(engine.checkNetworkAllowlist('not-a-url')).toBe(false);
      engine.destroy();
    });

    it('returns false when no allowlist loaded', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      expect(engine.checkNetworkAllowlist('https://any.com')).toBe(false);
      engine.destroy();
    });
  });

  describe('getPolicies()', () => {
    it('returns frozen array', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      const policies = engine.getPolicies();
      expect(Object.isFrozen(policies)).toBe(true);
      engine.destroy();
    });

    it('returns empty array when no policies loaded', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      expect(engine.getPolicies()).toHaveLength(0);
      engine.destroy();
    });
  });

  describe('matchesConditions -- advanced', () => {
    it('matches path_prefix condition', () => {
      const yamlPath = writeTmpYaml('path-prefix.yaml', `
version: 1
name: path-prefix-test
rules:
  - name: block-tmp
    action: deny
    priority: 100
    conditions:
      type: file_access
      path_prefix: "/tmp/sensitive"
    message: "Sensitive path blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      const matchAction: SecurityAction = {
        type: 'file_access',
        details: { path: '/tmp/sensitive/data.txt' },
      };
      expect(engine.evaluate(matchAction).allowed).toBe(false);

      const noMatchAction: SecurityAction = {
        type: 'file_access',
        details: { path: '/tmp/public/data.txt' },
      };
      expect(engine.evaluate(noMatchAction).allowed).toBe(true);
      engine.destroy();
    });

    it('matches not_in_allowlist condition', () => {
      const yamlPath = writeTmpYaml('not-in-allowlist.yaml', `
version: 1
name: allowlist-check
network_allowlist:
  - api.openai.com
rules:
  - name: block-unknown-urls
    action: deny
    priority: 100
    conditions:
      type: network_request
      not_in_allowlist: true
    message: "URL not in allowlist"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      // URL NOT in allowlist -- condition matches, should deny
      const blocked: SecurityAction = {
        type: 'network_request',
        details: { url: 'https://evil.com/steal' },
      };
      expect(engine.evaluate(blocked).allowed).toBe(false);

      // URL in allowlist -- condition doesn't match, default allow
      const allowed: SecurityAction = {
        type: 'network_request',
        details: { url: 'https://api.openai.com/v1' },
      };
      expect(engine.evaluate(allowed).allowed).toBe(true);
      engine.destroy();
    });

    it('matches risk_score_above condition', () => {
      const yamlPath = writeTmpYaml('risk-score.yaml', `
version: 1
name: risk-score-test
rules:
  - name: block-high-risk
    action: deny
    priority: 100
    conditions:
      risk_score_above: 0.8
    message: "Risk too high"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      const highRisk: SecurityAction = {
        type: 'skill_load',
        details: { riskScore: 0.95 },
      };
      expect(engine.evaluate(highRisk).allowed).toBe(false);

      const lowRisk: SecurityAction = {
        type: 'skill_load',
        details: { riskScore: 0.5 },
      };
      expect(engine.evaluate(lowRisk).allowed).toBe(true);
      engine.destroy();
    });

    it('skips rule when pattern condition does not match target (line 215)', () => {
      const yamlPath = writeTmpYaml('pattern-nomatch.yaml', `
version: 1
name: pattern-nomatch
rules:
  - name: block-rm
    action: deny
    priority: 100
    conditions:
      pattern: "rm\\\\s+-rf"
    message: "rm -rf blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      // This command does NOT match the rm -rf pattern
      const action: SecurityAction = {
        type: 'shell_command',
        details: { command: 'echo hello world' },
      };
      const result = engine.evaluate(action);
      // Pattern doesn't match -> rule skipped -> default allow
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('No policy rule matched');
      engine.destroy();
    });

    it('uses path as fallback target when command is absent (pattern match)', () => {
      const yamlPath = writeTmpYaml('pattern-path.yaml', `
version: 1
name: pattern-path
rules:
  - name: block-sensitive-path
    action: deny
    priority: 100
    conditions:
      pattern: "/etc/passwd"
    message: "Sensitive path blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      const action: SecurityAction = {
        type: 'file_access',
        details: { path: '/etc/passwd' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(false);
      engine.destroy();
    });

    it('uses url as fallback target for pattern when command and path absent', () => {
      const yamlPath = writeTmpYaml('pattern-url.yaml', `
version: 1
name: pattern-url
rules:
  - name: block-evil-url
    action: deny
    priority: 100
    conditions:
      pattern: "evil\\\\.com"
    message: "Evil URL blocked"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      const action: SecurityAction = {
        type: 'network_request',
        details: { url: 'https://evil.com/data' },
      };
      const result = engine.evaluate(action);
      expect(result.allowed).toBe(false);
      engine.destroy();
    });

    it('skips rule when type condition does not match', () => {
      const yamlPath = writeTmpYaml('type-mismatch.yaml', `
version: 1
name: type-mismatch
rules:
  - name: only-shell
    action: deny
    priority: 100
    conditions:
      type: shell_command
    message: "Only shell denied"
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);

      const fileAction: SecurityAction = {
        type: 'file_access',
        details: { path: '/tmp/test' },
      };
      // Should NOT match since type is file_access, not shell_command
      expect(engine.evaluate(fileAction).allowed).toBe(true);
      engine.destroy();
    });
  });

  describe('destroy()', () => {
    it('can be called multiple times safely', () => {
      const engine = new PolicyEngineImpl(makeConfig());
      engine.destroy();
      engine.destroy(); // Should not throw
    });
  });

  describe('edge cases', () => {
    it('handles YAML with no rules key', () => {
      const yamlPath = writeTmpYaml('no-rules.yaml', `
version: 1
name: no-rules
network_allowlist:
  - example.com
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      expect(engine.getPolicies()).toHaveLength(0);
      expect(engine.checkNetworkAllowlist('https://example.com')).toBe(true);
      engine.destroy();
    });

    it('resolves parent policy via absolute path (line 266)', () => {
      // Write the parent at a known absolute path
      const parentPath = writeTmpYaml('abs-parent.yaml', `
version: 1
name: abs-parent
rules:
  - name: parent-rule
    action: warn
    priority: 5
    conditions: {}
`);
      // Child references parent by absolute path
      const childPath = writeTmpYaml('abs-child.yaml', `
version: 1
name: abs-child
extends: "${parentPath}"
rules:
  - name: child-rule
    action: allow
    priority: 10
    conditions: {}
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(childPath);
      const policies = engine.getPolicies();
      // Should have both parent and child rules
      expect(policies.find((p) => p.name === 'parent-rule')).toBeDefined();
      expect(policies.find((p) => p.name === 'child-rule')).toBeDefined();
      engine.destroy();
    });

    it('handles parent policy not found gracefully', () => {
      const yamlPath = writeTmpYaml('orphan.yaml', `
version: 1
name: orphan
extends: "nonexistent-parent.yaml"
rules:
  - name: child-rule
    action: allow
    priority: 10
    conditions: {}
`);
      const engine = new PolicyEngineImpl(makeConfig());
      engine.loadPolicy(yamlPath);
      // Should still have child rule even though parent not found
      expect(engine.getPolicies()).toHaveLength(1);
      engine.destroy();
    });
  });
});
