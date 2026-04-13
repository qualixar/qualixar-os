/**
 * Forge + BehavioralContracts Integration Tests
 *
 * Verifies the preRedesign/postRedesign flow that wires
 * BehavioralContractManager directly into the Forge redesign cycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createForgeContractsIntegration,
  type ForgeContractsIntegration,
} from '../../src/quality/forge-contracts-integration.js';
import {
  createBehavioralContractManager,
  type BehavioralContractManager,
  type TeamOutput,
} from '../../src/quality/behavioral-contracts.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
  } as unknown as EventBus;
}

const BASELINE_OUTPUT: TeamOutput = {
  roles: ['architect', 'coder', 'reviewer'],
  outputs: { architect: 'Design doc', coder: 'Implementation', reviewer: 'Review OK' },
  totalCostUsd: 0.05,
  durationMs: 5000,
  judgeScore: 0.85,
};

const GOOD_OUTPUT: TeamOutput = {
  roles: ['architect', 'coder'],
  outputs: { architect: 'Better design', coder: 'Clean code' },
  totalCostUsd: 0.04,
  durationMs: 4000,
  judgeScore: 0.9,
};

const POOR_OUTPUT: TeamOutput = {
  roles: ['solo'],
  outputs: { solo: 'Minimal' },
  totalCostUsd: 0.02,
  durationMs: 2000,
  judgeScore: 0.3, // well below 80% of 0.85 = 0.68
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForgeContractsIntegration', () => {
  let integration: ForgeContractsIntegration;
  let contractManager: BehavioralContractManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createMockEventBus();
    contractManager = createBehavioralContractManager(eventBus);
    integration = createForgeContractsIntegration(contractManager, eventBus);
  });

  it('preRedesign captures a contract and returns contractId', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);

    expect(contractId).toBeDefined();
    expect(typeof contractId).toBe('string');
    expect(contractId.length).toBeGreaterThan(0);
  });

  it('postRedesign with satisfying output returns allowed=true, no violations', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);
    const result = integration.postRedesign(contractId, GOOD_OUTPUT);

    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('postRedesign with failing output returns allowed=false with violations list', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);
    const result = integration.postRedesign(contractId, POOR_OUTPUT);

    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    // Should contain the quality_non_regression violation
    expect(result.violations.some((v) => v.includes('quality_non_regression'))).toBe(true);
  });

  it('postRedesign emits contract:violation event on failure', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);

    // Reset emit mock after preRedesign (which also emits contract:captured)
    vi.mocked(eventBus.emit).mockClear();

    integration.postRedesign(contractId, POOR_OUTPUT);

    // The BehavioralContractManager itself emits one contract:violation,
    // and the integration layer emits another
    const violationCalls = vi.mocked(eventBus.emit).mock.calls.filter(
      (call) => (call[0] as { type: string }).type === 'contract:violation',
    );
    expect(violationCalls.length).toBeGreaterThanOrEqual(1);

    // The integration layer's event should include blocksRedesign
    const integrationEvent = violationCalls.find(
      (call) => (call[0] as { source: string }).source === 'forge-contracts-integration',
    );
    expect(integrationEvent).toBeDefined();
    expect((integrationEvent![0] as { payload: { blocksRedesign: boolean } }).payload.blocksRedesign).toBe(true);
  });

  it('postRedesign does NOT emit event on success', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);

    vi.mocked(eventBus.emit).mockClear();

    integration.postRedesign(contractId, GOOD_OUTPUT);

    // Integration layer should NOT emit contract:violation
    const integrationViolations = vi.mocked(eventBus.emit).mock.calls.filter(
      (call) => (call[0] as { source: string }).source === 'forge-contracts-integration',
    );
    expect(integrationViolations).toHaveLength(0);
  });

  it('full flow: preRedesign then postRedesign with passing output', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);

    // Verify contract was stored
    const contract = contractManager.getContract('code');
    expect(contract).not.toBeNull();
    expect(contract!.id).toBe(contractId);

    // New team passes
    const result = integration.postRedesign(contractId, GOOD_OUTPUT);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('full flow: preRedesign then postRedesign with failing output (low score)', () => {
    const contractId = integration.preRedesign('code', 'design-1', BASELINE_OUTPUT);

    const lowScoreOutput: TeamOutput = {
      roles: ['architect', 'coder'],
      outputs: { architect: 'Design', coder: 'Code' },
      totalCostUsd: 0.04,
      durationMs: 3000,
      judgeScore: 0.5, // 0.5 < 0.85 * 0.8 = 0.68
    };

    const result = integration.postRedesign(contractId, lowScoreOutput);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.includes('quality_non_regression'))).toBe(true);
  });
});
