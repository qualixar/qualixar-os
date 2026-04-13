// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Mode Engine
 *
 * Companion/Power mode switching and feature gate lookups.
 * Source of truth: REWRITE-SPEC Section 6 Phase 1, Phase 1 LLD Section 2.1.
 *
 * Hard Rule #5: structuredClone for getFeatureGates() return value.
 * Hard Rule #7: no global state -- all state via constructor DI.
 * Hard Rule #10: ESM .js extensions on imports.
 */

import type { QosMode, FeatureGates } from '../types/common.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ModeEngine {
  readonly currentMode: QosMode;
  isFeatureEnabled(feature: string): boolean;
  getFeatureGates(): FeatureGates;
  switchMode(mode: QosMode): void;
  getConfig(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Gate Constants
// ---------------------------------------------------------------------------

/**
 * Feature gates for companion mode.
 * 6 topologies, 3 strategies, no RL, no containers, no simulation.
 */
export const COMPANION_GATES: FeatureGates = {
  topologies: [
    'sequential',
    'parallel',
    'hierarchical',
    'dag',
    'mixture_of_agents',
    'debate',
    'hybrid',
  ],
  maxJudges: 2,
  routingStrategies: ['cascade', 'cheapest', 'quality'],
  rlEnabled: false,
  containerIsolation: false,
  dashboard: true,
  channels: ['cli', 'mcp'],
  simulationEnabled: false,
};

/**
 * Feature gates for power mode.
 * All 13 topologies, all 5 strategies, RL, containers, simulation.
 */
export const POWER_GATES: FeatureGates = {
  topologies: [
    'sequential',
    'parallel',
    'hierarchical',
    'dag',
    'mixture_of_agents',
    'debate',
    'mesh',
    'star',
    'circular',
    'grid',
    'forest',
    'maker',
    'hybrid',
  ],
  maxJudges: 5,
  routingStrategies: ['cascade', 'cheapest', 'quality', 'balanced', 'pomdp'],
  rlEnabled: true,
  containerIsolation: true,
  dashboard: true,
  channels: ['cli', 'mcp', 'http', 'telegram', 'discord', 'webhook'],
  simulationEnabled: true,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ModeEngineImpl implements ModeEngine {
  private _mode: QosMode;
  private _gates: FeatureGates;
  private readonly _configManager: ConfigManager;
  private readonly _eventBus: EventBus;

  constructor(configManager: ConfigManager, eventBus: EventBus) {
    // Step 1-2: Store dependencies
    this._configManager = configManager;
    this._eventBus = eventBus;

    // Step 3: Read initial mode from config
    this._mode = configManager.get().mode;

    // Step 4: Set gates based on mode
    this._gates = this._mode === 'companion' ? COMPANION_GATES : POWER_GATES;
  }

  get currentMode(): QosMode {
    return this._mode;
  }

  isFeatureEnabled(feature: string): boolean {
    // Switch on feature name per LLD Section 2.1 algorithm
    switch (feature) {
      case 'rl':
        return this._gates.rlEnabled;
      case 'containerIsolation':
        return this._gates.containerIsolation;
      case 'dashboard':
        return this._gates.dashboard;
      case 'simulation':
        return this._gates.simulationEnabled;
      default:
        break;
    }

    // Prefix-based lookups for collections
    if (feature.startsWith('topology:')) {
      const name = feature.slice('topology:'.length);
      return this._gates.topologies.includes(name);
    }

    if (feature.startsWith('strategy:')) {
      const name = feature.slice('strategy:'.length);
      return this._gates.routingStrategies.includes(name);
    }

    if (feature.startsWith('channel:')) {
      const name = feature.slice('channel:'.length);
      return this._gates.channels.includes(name);
    }

    // Unknown features are disabled
    return false;
  }

  getFeatureGates(): FeatureGates {
    // Hard Rule #5: structuredClone for immutability
    return structuredClone(this._gates);
  }

  getConfig(): Record<string, unknown> {
    const config = structuredClone(this._configManager.get()) as unknown as Record<string, unknown>;
    // Ensure current mode is always reflected in the returned config
    config.mode = this._mode;
    return config;
  }

  switchMode(mode: QosMode): void {
    // Step 1: No-op if same mode
    if (mode === this._mode) {
      return;
    }

    // Step 2: Store previous mode
    const prevMode = this._mode;

    // Step 3: Update mode
    this._mode = mode;

    // Step 4: Update gates
    this._gates = mode === 'companion' ? COMPANION_GATES : POWER_GATES;

    // Note: mode persists in memory for this session.
    // ConfigManager is read-only; full persistence requires config file write (Phase 17).

    // Step 5: Emit mode:switched event
    this._eventBus.emit({
      type: 'mode:switched',
      payload: { from: prevMode, to: mode },
      source: 'ModeEngine',
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ModeEngine from a ConfigManager and EventBus.
 *
 * @param configManager - Provides initial mode from config
 * @param eventBus - Receives mode:switched events
 * @returns ModeEngine instance
 */
export function createModeEngine(
  configManager: ConfigManager,
  eventBus: EventBus,
): ModeEngine {
  return new ModeEngineImpl(configManager, eventBus);
}
