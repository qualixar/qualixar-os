// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Graceful Degradation Engine (Blue Ocean BO-2)
 *
 * Tracks failure counts per topology and recommends progressively
 * simpler execution strategies when failures accumulate.
 *
 * Tiers (highest → lowest autonomy):
 *   autonomous_swarm → deterministic_graph → single_agent → human_in_loop
 *
 * This is a HELPER module -- it does NOT modify the orchestrator directly.
 * The orchestrator (or a wrapper) calls `suggestDegradation` to decide
 * whether to downgrade.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ordered degradation tiers from most autonomous to most supervised. */
export type DegradationTierName =
  | 'autonomous_swarm'
  | 'deterministic_graph'
  | 'single_agent'
  | 'human_in_loop';

/** Full degradation tier descriptor. */
export interface DegradationTier {
  /** Tier name (immutable). */
  readonly name: DegradationTierName;
  /** Human-readable explanation of what this tier means. */
  readonly description: string;
  /** Minimum consecutive failures to trigger this tier. */
  readonly failureThreshold: number;
  /** Topologies allowed at this tier. */
  readonly allowedTopologies: readonly string[];
}

/** Recommendation returned by the engine. */
export interface DegradationRecommendation {
  /** The recommended tier after evaluating failure history. */
  readonly tier: DegradationTier;
  /** Previous tier name (or null if no prior state). */
  readonly previousTierName: DegradationTierName | null;
  /** Whether a tier change occurred. */
  readonly changed: boolean;
  /** Human-readable reasoning for the recommendation. */
  readonly reasoning: string;
}

/** Event payloads emitted by the degradation engine. */
export interface DegradationTierChangedPayload {
  readonly topology: string;
  readonly previousTier: DegradationTierName;
  readonly newTier: DegradationTierName;
  readonly failureCount: number;
}

export interface DegradationHumanRequiredPayload {
  readonly topology: string;
  readonly failureCount: number;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered tier definitions (index = severity, 0 = most autonomous). */
const TIER_DEFINITIONS: readonly DegradationTier[] = Object.freeze([
  {
    name: 'autonomous_swarm',
    description: 'Full multi-agent swarm with self-coordination',
    failureThreshold: 0,
    allowedTopologies: [
      'debate', 'ensemble', 'pipeline', 'parallel_scatter_gather',
      'hierarchical', 'mesh', 'relay', 'map_reduce',
      'tournament', 'blackboard', 'ring', 'star',
    ],
  },
  {
    name: 'deterministic_graph',
    description: 'Pre-defined deterministic execution graph without self-coordination',
    failureThreshold: 2,
    allowedTopologies: ['pipeline', 'parallel_scatter_gather', 'map_reduce', 'relay'],
  },
  {
    name: 'single_agent',
    description: 'Single agent execution — safest automated mode',
    failureThreshold: 4,
    allowedTopologies: ['single'],
  },
  {
    name: 'human_in_loop',
    description: 'Human must approve every step — maximum safety',
    failureThreshold: 6,
    allowedTopologies: ['single'],
  },
]);

// ---------------------------------------------------------------------------
// DegradationEngine
// ---------------------------------------------------------------------------

/**
 * Tracks per-topology failure counts and recommends degradation tiers.
 *
 * Immutable design: internal maps are copied on read; the engine never
 * exposes mutable references.
 */
export class DegradationEngine {
  /** Map<topology, consecutiveFailureCount> */
  private readonly failureCounts: Map<string, number>;
  /** Map<topology, currentTierIndex> */
  private readonly currentTiers: Map<string, number>;
  /** Custom tier definitions (allows overriding defaults). */
  private readonly tiers: readonly DegradationTier[];

  constructor(tiers?: readonly DegradationTier[]) {
    this.failureCounts = new Map();
    this.currentTiers = new Map();
    this.tiers = tiers ?? TIER_DEFINITIONS;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Record a failure for the given topology and return the recommended tier.
   */
  recordFailure(topology: string): DegradationRecommendation {
    const currentCount = (this.failureCounts.get(topology) ?? 0) + 1;
    this.failureCounts.set(topology, currentCount);
    return this.suggestDegradation(topology, currentCount);
  }

  /**
   * Record a success — resets the failure counter for the topology.
   */
  recordSuccess(topology: string): void {
    this.failureCounts.set(topology, 0);
    this.currentTiers.set(topology, 0);
  }

  /**
   * Core logic: given a topology and its failure count, suggest the
   * appropriate degradation tier.
   */
  suggestDegradation(
    currentTopology: string,
    failureCount: number,
  ): DegradationRecommendation {
    const previousTierIndex = this.currentTiers.get(currentTopology) ?? 0;
    const previousTier = this.tiers[previousTierIndex];

    // Walk tiers from most degraded to least, pick the first whose
    // threshold is <= failureCount (i.e. the most degraded applicable tier).
    let newTierIndex = 0;
    for (let i = this.tiers.length - 1; i >= 0; i--) {
      if (failureCount >= this.tiers[i].failureThreshold) {
        newTierIndex = i;
        break;
      }
    }

    this.currentTiers.set(currentTopology, newTierIndex);
    const newTier = this.tiers[newTierIndex];
    const changed = newTierIndex !== previousTierIndex;

    const reasoning = changed
      ? `Topology "${currentTopology}" degraded from ${previousTier.name} to ${newTier.name} after ${failureCount} consecutive failure(s).`
      : `Topology "${currentTopology}" remains at ${newTier.name} (${failureCount} failure(s)).`;

    return Object.freeze({
      tier: newTier,
      previousTierName: previousTier.name,
      changed,
      reasoning,
    });
  }

  /**
   * Get the current tier for a topology (defaults to autonomous_swarm).
   */
  getCurrentTier(topology: string): DegradationTier {
    const idx = this.currentTiers.get(topology) ?? 0;
    return this.tiers[idx];
  }

  /**
   * Get a snapshot of all failure counts (immutable copy).
   */
  getFailureCounts(): ReadonlyMap<string, number> {
    return new Map(this.failureCounts);
  }

  /**
   * Check whether a topology requires human-in-the-loop.
   */
  requiresHuman(topology: string): boolean {
    const tier = this.getCurrentTier(topology);
    return tier.name === 'human_in_loop';
  }

  /**
   * Reset all state (useful for testing or session boundaries).
   */
  reset(): void {
    this.failureCounts.clear();
    this.currentTiers.clear();
  }

  /**
   * Get the ordered tier definitions.
   */
  getTierDefinitions(): readonly DegradationTier[] {
    return this.tiers;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a DegradationEngine with default tier definitions.
 */
export function createDegradationEngine(): DegradationEngine {
  return new DegradationEngine();
}
