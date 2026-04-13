// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase C3 -- Specification Coherence / Behavioral Contracts
 *
 * Before Forge redesigns a team, capture a behavioral contract of the current
 * team. After redesign, verify the new team satisfies the same contract.
 * Violation → block redesign, notify human.
 *
 * A behavioral contract defines: expected outputs per role, quality thresholds,
 * and invariants that must hold across redesigns.
 *
 * Source: Phase C3, AgentAssert Design-by-Contract theory
 */

import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BehavioralContract {
  readonly id: string;
  readonly taskType: string;
  readonly capturedFromDesignId: string;
  readonly invariants: readonly ContractInvariant[];
  readonly capturedAt: string;
}

export interface ContractInvariant {
  readonly name: string;
  readonly description: string;
  readonly check: (teamOutput: TeamOutput) => InvariantResult;
}

export interface TeamOutput {
  readonly roles: readonly string[];
  readonly outputs: Record<string, string>;
  readonly totalCostUsd: number;
  readonly durationMs: number;
  readonly judgeScore: number;
}

export interface InvariantResult {
  readonly satisfied: boolean;
  readonly invariantName: string;
  readonly details: string;
}

export interface ContractVerification {
  readonly contractId: string;
  readonly allSatisfied: boolean;
  readonly results: readonly InvariantResult[];
  readonly blocksRedesign: boolean;
}

export interface BehavioralContractManager {
  /** Capture a contract from a successful team execution */
  captureContract(taskType: string, designId: string, output: TeamOutput): BehavioralContract;
  /** Verify a new team output against an existing contract */
  verify(contractId: string, newOutput: TeamOutput): ContractVerification;
  /** Get contract for a task type */
  getContract(taskType: string): BehavioralContract | null;
  /** List all contracts */
  listContracts(): readonly BehavioralContract[];
}

// ---------------------------------------------------------------------------
// Default Invariants (apply to all teams)
// ---------------------------------------------------------------------------

function createDefaultInvariants(baseline: TeamOutput): readonly ContractInvariant[] {
  return [
    {
      name: 'quality_non_regression',
      description: 'New team must not score lower than 80% of baseline judge score',
      check: (output: TeamOutput): InvariantResult => {
        const threshold = baseline.judgeScore * 0.8;
        return {
          satisfied: output.judgeScore >= threshold,
          invariantName: 'quality_non_regression',
          details: `Score ${output.judgeScore.toFixed(2)} vs threshold ${threshold.toFixed(2)} (80% of baseline ${baseline.judgeScore.toFixed(2)})`,
        };
      },
    },
    {
      name: 'cost_bounded',
      description: 'New team must not cost more than 200% of baseline',
      check: (output: TeamOutput): InvariantResult => {
        const maxCost = baseline.totalCostUsd * 2.0;
        return {
          satisfied: output.totalCostUsd <= maxCost,
          invariantName: 'cost_bounded',
          details: `Cost $${output.totalCostUsd.toFixed(4)} vs max $${maxCost.toFixed(4)} (200% of baseline)`,
        };
      },
    },
    {
      name: 'role_coverage',
      description: 'New team must cover at least one role from baseline',
      check: (output: TeamOutput): InvariantResult => {
        const baselineRoles = new Set(baseline.roles);
        const overlap = output.roles.filter((r) => baselineRoles.has(r));
        return {
          satisfied: overlap.length > 0 || baseline.roles.length === 0,
          invariantName: 'role_coverage',
          details: `${overlap.length} overlapping roles: [${overlap.join(', ')}]`,
        };
      },
    },
    {
      name: 'output_non_empty',
      description: 'Every role in new team must produce non-empty output',
      check: (output: TeamOutput): InvariantResult => {
        const emptyRoles = output.roles.filter(
          (r) => !output.outputs[r] || output.outputs[r].trim() === '',
        );
        return {
          satisfied: emptyRoles.length === 0,
          invariantName: 'output_non_empty',
          details: emptyRoles.length === 0
            ? 'All roles produced output'
            : `Empty output from: [${emptyRoles.join(', ')}]`,
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class BehavioralContractManagerImpl implements BehavioralContractManager {
  private readonly _contracts = new Map<string, BehavioralContract>();
  private readonly _byTaskType = new Map<string, string>();
  private readonly _eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this._eventBus = eventBus;
  }

  captureContract(
    taskType: string,
    designId: string,
    output: TeamOutput,
  ): BehavioralContract {
    const contract: BehavioralContract = {
      id: generateId(),
      taskType,
      capturedFromDesignId: designId,
      invariants: createDefaultInvariants(output),
      capturedAt: new Date().toISOString(),
    };

    this._contracts.set(contract.id, contract);
    this._byTaskType.set(taskType, contract.id);

    this._eventBus.emit({
      type: 'contract:captured',
      payload: { contractId: contract.id, taskType, invariantCount: contract.invariants.length },
      source: 'behavioral-contracts',
    });

    return contract;
  }

  verify(contractId: string, newOutput: TeamOutput): ContractVerification {
    const contract = this._contracts.get(contractId);
    if (!contract) {
      return {
        contractId,
        allSatisfied: false,
        results: [{
          satisfied: false,
          invariantName: 'contract_exists',
          details: `Contract ${contractId} not found`,
        }],
        blocksRedesign: true,
      };
    }

    const results = contract.invariants.map((inv) => inv.check(newOutput));
    const allSatisfied = results.every((r) => r.satisfied);

    if (!allSatisfied) {
      this._eventBus.emit({
        type: 'contract:violation',
        payload: {
          contractId,
          taskType: contract.taskType,
          violations: results.filter((r) => !r.satisfied).map((r) => r.invariantName),
        },
        source: 'behavioral-contracts',
      });
    }

    return {
      contractId,
      allSatisfied,
      results,
      blocksRedesign: !allSatisfied,
    };
  }

  getContract(taskType: string): BehavioralContract | null {
    const id = this._byTaskType.get(taskType);
    if (!id) return null;
    return this._contracts.get(id) ?? null;
  }

  listContracts(): readonly BehavioralContract[] {
    return [...this._contracts.values()];
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBehavioralContractManager(
  eventBus: EventBus,
): BehavioralContractManager {
  return new BehavioralContractManagerImpl(eventBus);
}
