/**
 * Qualixar OS Phase 13 -- Risk Policy Tests
 * Tests all risk levels, threshold changes, and action types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RiskPolicyImpl,
  createRiskPolicy,
  type RiskLevel,
  type RiskAction,
} from '../../src/engine/risk-policy.js';

describe('RiskPolicyImpl', () => {
  let policy: RiskPolicyImpl;

  beforeEach(() => {
    policy = new RiskPolicyImpl();
  });

  // -----------------------------------------------------------------------
  // Default threshold
  // -----------------------------------------------------------------------

  it('has default threshold of medium', () => {
    expect(policy.getThreshold()).toBe('medium');
  });

  // -----------------------------------------------------------------------
  // Action type → risk level mapping
  // -----------------------------------------------------------------------

  it('model_call is always low risk', () => {
    const result = policy.assess({ type: 'model_call', details: {} });
    expect(result.level).toBe('low');
    expect(result.autoApproved).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('network_request is medium risk', () => {
    const result = policy.assess({ type: 'network_request', details: { url: 'https://example.com' } });
    expect(result.level).toBe('medium');
    expect(result.autoApproved).toBe(true);
  });

  it('credential_access is high risk', () => {
    const result = policy.assess({ type: 'credential_access', details: { key: 'API_KEY' } });
    expect(result.level).toBe('high');
    expect(result.requiresApproval).toBe(true);
  });

  it('file_write to user path is medium risk', () => {
    const result = policy.assess({ type: 'file_write', details: { path: './output.txt' } });
    expect(result.level).toBe('medium');
    expect(result.autoApproved).toBe(true);
  });

  it('file_write to system path is critical', () => {
    const result = policy.assess({ type: 'file_write', details: { path: '/etc/passwd' } });
    expect(result.level).toBe('critical');
    expect(result.requiresApproval).toBe(true);
  });

  it('file_write to /usr is critical', () => {
    const result = policy.assess({ type: 'file_write', details: { path: '/usr/local/bin/test' } });
    expect(result.level).toBe('critical');
  });

  it('shell_command without dangerous ops is high risk', () => {
    const result = policy.assess({ type: 'shell_command', details: { command: 'ls -la' } });
    expect(result.level).toBe('high');
  });

  it('shell_command with rm is critical', () => {
    const result = policy.assess({ type: 'shell_command', details: { command: 'rm -rf /tmp/test' } });
    expect(result.level).toBe('critical');
    expect(result.requiresApproval).toBe(true);
  });

  it('shell_command with sudo is critical', () => {
    const result = policy.assess({ type: 'shell_command', details: { command: 'sudo apt install foo' } });
    expect(result.level).toBe('critical');
  });

  it('unknown action type defaults to medium', () => {
    const result = policy.assess({ type: 'unknown_action', details: {} });
    expect(result.level).toBe('medium');
  });

  // -----------------------------------------------------------------------
  // Threshold changes
  // -----------------------------------------------------------------------

  it('setThreshold changes the threshold', () => {
    policy.setThreshold('high');
    expect(policy.getThreshold()).toBe('high');
  });

  it('with high threshold, credential_access is auto-approved', () => {
    policy.setThreshold('high');
    const result = policy.assess({ type: 'credential_access', details: { key: 'SECRET' } });
    expect(result.level).toBe('high');
    expect(result.autoApproved).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('with high threshold, critical still requires approval', () => {
    policy.setThreshold('high');
    const result = policy.assess({ type: 'shell_command', details: { command: 'rm -rf /tmp' } });
    expect(result.level).toBe('critical');
    expect(result.requiresApproval).toBe(true);
  });

  it('with low threshold, medium requires approval', () => {
    policy.setThreshold('low');
    const result = policy.assess({ type: 'network_request', details: {} });
    expect(result.level).toBe('medium');
    expect(result.requiresApproval).toBe(true);
  });

  it('with critical threshold, nothing requires approval', () => {
    policy.setThreshold('critical');
    const result = policy.assess({ type: 'shell_command', details: { command: 'rm -rf /tmp' } });
    expect(result.level).toBe('critical');
    expect(result.requiresApproval).toBe(false);
    expect(result.autoApproved).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Reason strings
  // -----------------------------------------------------------------------

  it('provides meaningful reason for each action type', () => {
    const actions: RiskAction[] = [
      { type: 'model_call', details: {} },
      { type: 'network_request', details: {} },
      { type: 'credential_access', details: {} },
      { type: 'file_write', details: { path: '/etc/test' } },
      { type: 'shell_command', details: { command: 'rm -rf' } },
    ];

    for (const action of actions) {
      const result = policy.assess(action);
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    }
  });

  it('file_write reason includes path for system paths', () => {
    const result = policy.assess({ type: 'file_write', details: { path: '/etc/shadow' } });
    expect(result.reason).toContain('/etc/shadow');
  });

  it('shell_command reason includes command for dangerous ops', () => {
    const result = policy.assess({ type: 'shell_command', details: { command: 'sudo reboot' } });
    expect(result.reason).toContain('sudo reboot');
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles missing details gracefully', () => {
    const result = policy.assess({ type: 'file_write', details: {} });
    expect(result.level).toBe('medium');
  });

  it('handles empty command string', () => {
    const result = policy.assess({ type: 'shell_command', details: { command: '' } });
    expect(result.level).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createRiskPolicy', () => {
  it('creates with default threshold', () => {
    const policy = createRiskPolicy();
    expect(policy.getThreshold()).toBe('medium');
  });

  it('creates with custom threshold', () => {
    const policy = createRiskPolicy('high');
    expect(policy.getThreshold()).toBe('high');
  });
});
