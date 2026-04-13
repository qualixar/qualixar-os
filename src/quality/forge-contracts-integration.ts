// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Forge + BehavioralContracts Integration
 *
 * Integrates BehavioralContracts with Forge redesign.
 *
 * Before a redesign: captures the contract from current team.
 * After redesign: verifies new team against the contract.
 * If verification fails: blocks the redesign, notifies via EventBus.
 */

import type { EventBus } from '../events/event-bus.js';
import type { BehavioralContractManager, TeamOutput } from './behavioral-contracts.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface ForgeContractsIntegration {
  /** Called before Forge.redesign() -- captures contract from current team */
  preRedesign(taskType: string, designId: string, currentOutput: TeamOutput): string;

  /** Called after Forge.redesign() -- verifies new team against contract */
  postRedesign(contractId: string, newOutput: TeamOutput): {
    readonly allowed: boolean;
    readonly violations: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ForgeContractsIntegrationImpl implements ForgeContractsIntegration {
  private readonly _contracts: BehavioralContractManager;
  private readonly _eventBus: EventBus;

  constructor(contracts: BehavioralContractManager, eventBus: EventBus) {
    this._contracts = contracts;
    this._eventBus = eventBus;
  }

  preRedesign(taskType: string, designId: string, currentOutput: TeamOutput): string {
    const contract = this._contracts.captureContract(taskType, designId, currentOutput);
    return contract.id;
  }

  postRedesign(contractId: string, newOutput: TeamOutput): {
    readonly allowed: boolean;
    readonly violations: readonly string[];
  } {
    const verification = this._contracts.verify(contractId, newOutput);

    if (!verification.allSatisfied) {
      this._eventBus.emit({
        type: 'contract:violation',
        payload: {
          contractId,
          violations: verification.results
            .filter((r) => !r.satisfied)
            .map((r) => r.invariantName),
          blocksRedesign: verification.blocksRedesign,
        },
        source: 'forge-contracts-integration',
      });
    }

    return {
      allowed: verification.allSatisfied,
      violations: verification.results
        .filter((r) => !r.satisfied)
        .map((r) => `${r.invariantName}: ${r.details}`),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createForgeContractsIntegration(
  contracts: BehavioralContractManager,
  eventBus: EventBus,
): ForgeContractsIntegration {
  return new ForgeContractsIntegrationImpl(contracts, eventBus);
}
