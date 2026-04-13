// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 13 -- Risk Policy
 *
 * Rule-based risk assessment for autonomous execution mode.
 * Deterministic: action type + details => RiskLevel.
 *
 * Default threshold: 'medium' (auto-approve low+medium, pause on high+critical).
 * Autonomous threshold: 'high' (only critical pauses execution).
 *
 * Hard Rule: No ML — pure rule evaluation. Deterministic output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  readonly level: RiskLevel;
  readonly reason: string;
  readonly requiresApproval: boolean;
  readonly autoApproved: boolean;
}

export interface RiskAction {
  readonly type: string;
  readonly details: Record<string, unknown>;
}

export interface RiskPolicy {
  assess(action: RiskAction): RiskAssessment;
  setThreshold(level: RiskLevel): void;
  getThreshold(): RiskLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DANGEROUS_COMMANDS = ['rm', 'sudo', 'chmod', 'chown', 'mkfs', 'dd', 'kill'];
const SYSTEM_PATHS = ['/etc', '/usr', '/var', '/sys', '/proc', '/boot', '/sbin'];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class RiskPolicyImpl implements RiskPolicy {
  private threshold: RiskLevel;

  constructor(threshold: RiskLevel = 'medium') {
    this.threshold = threshold;
  }

  assess(action: RiskAction): RiskAssessment {
    const level = this.evaluateRiskLevel(action);
    const thresholdOrder = RISK_ORDER[this.threshold];
    const levelOrder = RISK_ORDER[level];
    const requiresApproval = levelOrder > thresholdOrder;
    const autoApproved = !requiresApproval;

    return {
      level,
      reason: this.buildReason(action, level),
      requiresApproval,
      autoApproved,
    };
  }

  setThreshold(level: RiskLevel): void {
    this.threshold = level;
  }

  getThreshold(): RiskLevel {
    return this.threshold;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private evaluateRiskLevel(action: RiskAction): RiskLevel {
    switch (action.type) {
      case 'model_call':
        return 'low';

      case 'network_request':
        return 'medium';

      case 'credential_access':
        return 'high';

      case 'file_write': {
        const path = String(action.details.path ?? '');
        if (SYSTEM_PATHS.some((sp) => path.startsWith(sp))) {
          return 'critical';
        }
        return 'medium';
      }

      case 'shell_command': {
        const command = String(action.details.command ?? '');
        const tokens = command.split(/\s+/);
        if (tokens.some((t) => DANGEROUS_COMMANDS.includes(t))) {
          return 'critical';
        }
        return 'high';
      }

      default:
        return 'medium';
    }
  }

  private buildReason(action: RiskAction, level: RiskLevel): string {
    switch (action.type) {
      case 'model_call':
        return 'Model calls are always low risk';
      case 'network_request':
        return 'Network requests require medium trust';
      case 'credential_access':
        return 'Credential access is high risk';
      case 'file_write': {
        if (level === 'critical') {
          return `File write to system path: ${String(action.details.path ?? '')}`;
        }
        return 'File write to user path';
      }
      case 'shell_command': {
        if (level === 'critical') {
          return `Shell command contains dangerous operation: ${String(action.details.command ?? '')}`;
        }
        return 'Shell command execution';
      }
      default:
        return `Unknown action type: ${action.type}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRiskPolicy(threshold?: RiskLevel): RiskPolicy {
  return new RiskPolicyImpl(threshold);
}
