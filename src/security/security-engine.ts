// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Security Engine
 * LLD Section 2.1
 *
 * 4-layer coordinator: network, filesystem, process, inference.
 * Routes every SecurityAction through PolicyEngine first (short-circuit
 * on deny), then layer-specific checks, then InferenceGuard.
 * Every action is audit-logged.
 */

import type {
  SecurityAction,
  SecurityDecision,
  SecurityEngine,
  ContainerManager,
  CredentialVault,
  PolicyEngine,
} from '../types/common.js';
import type { AuditLoggerImpl } from './audit-logger.js';
import type { FilesystemSandboxImpl } from './filesystem-sandbox.js';
import type { InferenceGuardImpl } from './inference-guard.js';
import type { PolicyEngineImpl } from './policy-engine.js';
import type { SkillScannerImpl } from './skill-scanner.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SecurityEngineImpl implements SecurityEngine {
  constructor(
    private readonly containerManager: ContainerManager,
    private readonly credentialVault: CredentialVault,
    private readonly filesystemSandbox: FilesystemSandboxImpl,
    private readonly policyEngine: PolicyEngineImpl,
    private readonly inferenceGuard: InferenceGuardImpl,
    private readonly skillScanner: SkillScannerImpl,
    private readonly auditLogger: AuditLoggerImpl,
  ) {}

  async evaluate(action: SecurityAction): Promise<SecurityDecision> {
    // Step 1: Log incoming action (always)
    this.auditLogger.log({
      event_type: 'received',
      severity: 'info',
      details: JSON.stringify(action),
      source: 'security-engine',
    });

    // Step 2: PolicyEngine evaluate (short-circuit on deny)
    const policyDecision = this.policyEngine.evaluate(action);

    // Step 3: If deny -> audit log + return denied
    if (!policyDecision.allowed && policyDecision.severity === 'critical') {
      this.auditLogger.log({
        event_type: 'violation',
        severity: 'critical',
        details: JSON.stringify({ action, reason: policyDecision.reason }),
        source: 'policy-engine',
      });
      return policyDecision;
    }

    // Step 4: If warn -> audit log warning, continue
    if (policyDecision.severity === 'warning') {
      this.auditLogger.log({
        event_type: 'policy_evaluated',
        severity: 'warning',
        details: JSON.stringify({ action, warning: policyDecision.reason }),
        source: 'policy-engine',
      });
    }

    // Step 5: Layer router switch on action.type
    let layerDecision: SecurityDecision;

    switch (action.type) {
      case 'network_request': {
        const allowed = this.policyEngine.checkNetworkAllowlist(
          action.details.url as string,
        );
        layerDecision = allowed
          ? { allowed: true, reason: 'URL in network allowlist', layer: 'network', severity: 'info' }
          : { allowed: false, reason: `URL ${action.details.url} not in network allowlist`, layer: 'network', severity: 'critical' };
        break;
      }

      case 'file_access': {
        layerDecision = this.filesystemSandbox.validate(
          action.details.path as string,
        );
        break;
      }

      case 'shell_command': {
        if (this.containerManager.isAvailable()) {
          layerDecision = {
            allowed: true,
            reason: 'Command will route through container isolation',
            layer: 'process',
            severity: 'info',
          };
        } else {
          layerDecision = this.filesystemSandbox.validateCommand(
            action.details.command as string,
          );
        }
        break;
      }

      case 'credential_access': {
        const keyExists = this.credentialVault.hasKey(
          action.details.key as string,
        );
        this.auditLogger.log({
          event_type: 'credential_accessed',
          severity: 'info',
          details: JSON.stringify({
            key: action.details.key,
            found: keyExists,
          }),
          source: 'credential-vault',
        });
        layerDecision = {
          allowed: keyExists,
          reason: keyExists
            ? 'Credential found in vault'
            : `Credential '${action.details.key}' not found`,
          layer: 'process',
          severity: keyExists ? 'info' : 'warning',
        };
        break;
      }

      case 'skill_load': {
        // M-28: LLD DEVIATION (intentional): The LLD specifies path-based
        // skill scanning (load file from path, then scan). The implementation
        // uses content-based scanning instead (scanContent), which is more
        // flexible -- callers provide the content directly, enabling scanning
        // of skills from any source (URL, inline, registry) without filesystem
        // access. This is strictly more capable than the LLD approach.
        const scanResult = this.skillScanner.scanContent(
          action.details.content as string ?? '',
        );
        if (!scanResult.safe) {
          layerDecision = {
            allowed: false,
            reason: `Skill scan failed: ${scanResult.issues.map((i) => i.description).join('; ')}`,
            layer: 'inference',
            severity: 'critical',
          };
        } else {
          layerDecision = {
            allowed: true,
            reason: 'Skill scan passed',
            layer: 'inference',
            severity: 'info',
          };
        }
        break;
      }

      default: {
        layerDecision = {
          allowed: false,
          reason: `Unknown action type: ${(action as SecurityAction).type}`,
          layer: 'inference',
          severity: 'critical',
        };
      }
    }

    // Step 6: If layer denied -> audit log + return denied
    if (!layerDecision.allowed) {
      this.auditLogger.log({
        event_type: 'violation',
        severity: layerDecision.severity ?? 'critical',
        details: JSON.stringify({ action, decision: layerDecision }),
        source: 'security-engine',
      });
      return layerDecision;
    }

    // Step 7: InferenceGuard scan (final check)
    const inferenceDecision = this.inferenceGuard.scan(action);
    if (!inferenceDecision.allowed) {
      this.auditLogger.log({
        event_type: 'violation',
        severity: 'critical',
        details: JSON.stringify({ action, reason: inferenceDecision.reason }),
        source: 'inference-guard',
      });
      return inferenceDecision;
    }

    // Step 8: Audit log 'decided' + return allowed
    this.auditLogger.log({
      event_type: 'policy_evaluated',
      severity: 'info',
      details: JSON.stringify({ action, decision: layerDecision }),
      source: 'security-engine',
    });

    return layerDecision;
  }

  getContainerManager(): ContainerManager {
    return this.containerManager;
  }

  getCredentialVault(): CredentialVault {
    return this.credentialVault;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }
}
