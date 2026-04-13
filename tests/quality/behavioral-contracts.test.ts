/**
 * Phase C3 -- Behavioral Contracts Tests
 *
 * Specification coherence under Forge team redesign.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBehavioralContractManager,
  type BehavioralContractManager,
  type TeamOutput,
} from '../../src/quality/behavioral-contracts.js';
import type { EventBus } from '../../src/events/event-bus.js';

function createMockEventBus(): EventBus {
  return { emit: vi.fn(), on: vi.fn().mockReturnValue(() => {}), off: vi.fn() } as unknown as EventBus;
}

const BASELINE_OUTPUT: TeamOutput = {
  roles: ['architect', 'coder', 'reviewer'],
  outputs: { architect: 'Design doc', coder: 'Implementation', reviewer: 'Review OK' },
  totalCostUsd: 0.05,
  durationMs: 5000,
  judgeScore: 0.85,
};

describe('BehavioralContractManager', () => {
  let manager: BehavioralContractManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createMockEventBus();
    manager = createBehavioralContractManager(eventBus);
  });

  it('captures a contract from baseline output', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    expect(contract.id).toBeDefined();
    expect(contract.taskType).toBe('code');
    expect(contract.invariants.length).toBeGreaterThanOrEqual(4);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contract:captured' }),
    );
  });

  it('verify passes when new team meets all invariants', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    const goodOutput: TeamOutput = {
      roles: ['architect', 'coder'],
      outputs: { architect: 'Better design', coder: 'Clean code' },
      totalCostUsd: 0.04,
      durationMs: 4000,
      judgeScore: 0.9,
    };

    const result = manager.verify(contract.id, goodOutput);

    expect(result.allSatisfied).toBe(true);
    expect(result.blocksRedesign).toBe(false);
  });

  it('verify fails when quality regresses below 80% of baseline', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    const poorOutput: TeamOutput = {
      roles: ['architect'],
      outputs: { architect: 'Some output' },
      totalCostUsd: 0.02,
      durationMs: 2000,
      judgeScore: 0.5, // 0.5 < 0.85 * 0.8 = 0.68
    };

    const result = manager.verify(contract.id, poorOutput);

    expect(result.allSatisfied).toBe(false);
    expect(result.blocksRedesign).toBe(true);
    expect(result.results.find((r) => r.invariantName === 'quality_non_regression')?.satisfied).toBe(false);
  });

  it('verify fails when cost exceeds 200% of baseline', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    const expensiveOutput: TeamOutput = {
      roles: ['architect', 'coder'],
      outputs: { architect: 'Output', coder: 'Output' },
      totalCostUsd: 0.15, // 0.15 > 0.05 * 2.0 = 0.10
      durationMs: 5000,
      judgeScore: 0.9,
    };

    const result = manager.verify(contract.id, expensiveOutput);

    expect(result.results.find((r) => r.invariantName === 'cost_bounded')?.satisfied).toBe(false);
  });

  it('verify fails when a role produces empty output', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    const emptyOutput: TeamOutput = {
      roles: ['architect', 'coder'],
      outputs: { architect: 'OK', coder: '' },
      totalCostUsd: 0.03,
      durationMs: 3000,
      judgeScore: 0.85,
    };

    const result = manager.verify(contract.id, emptyOutput);

    expect(result.results.find((r) => r.invariantName === 'output_non_empty')?.satisfied).toBe(false);
  });

  it('emits contract:violation when verification fails', () => {
    const contract = manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    manager.verify(contract.id, {
      roles: ['solo'], outputs: { solo: '' },
      totalCostUsd: 1.0, durationMs: 1000, judgeScore: 0.1,
    });

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contract:violation' }),
    );
  });

  it('getContract retrieves by task type', () => {
    manager.captureContract('code', 'design-1', BASELINE_OUTPUT);

    const retrieved = manager.getContract('code');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.taskType).toBe('code');
  });

  it('returns null for unknown task type', () => {
    expect(manager.getContract('unknown')).toBeNull();
  });

  it('listContracts returns all captured contracts', () => {
    manager.captureContract('code', 'd1', BASELINE_OUTPUT);
    manager.captureContract('research', 'd2', BASELINE_OUTPUT);

    expect(manager.listContracts()).toHaveLength(2);
  });

  it('returns contract_exists violation for unknown contractId', () => {
    const result = manager.verify('nonexistent', BASELINE_OUTPUT);
    expect(result.allSatisfied).toBe(false);
    expect(result.blocksRedesign).toBe(true);
  });
});
