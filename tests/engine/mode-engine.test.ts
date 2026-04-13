/**
 * Qualixar OS V2 -- ModeEngine Tests
 *
 * Phase 1 LLD Section 2.1, TDD Step 1.
 * Tests: ModeEngine interface, COMPANION_GATES, POWER_GATES, switchMode, isFeatureEnabled.
 *
 * Mock strategy:
 *   - MockConfigManager: returns a QosConfig with specified mode
 *   - MockEventBus: records emit() calls, on()/off() are no-ops
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QosConfigSchema } from '../../src/types/common.js';
import type { QosConfig, FeatureGates } from '../../src/types/common.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { QosEvent } from '../../src/types/common.js';
import {
  createModeEngine,
  COMPANION_GATES,
  POWER_GATES,
} from '../../src/engine/mode-engine.js';
import type { ModeEngine } from '../../src/engine/mode-engine.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockConfigManager(mode: 'companion' | 'power'): ConfigManager {
  const config = QosConfigSchema.parse({ mode });
  return {
    get: () => structuredClone(config),
    getValue: <T = unknown>(path: string): T => {
      const segments = path.split('.');
      let current: unknown = config;
      for (const seg of segments) {
        if (current === null || current === undefined || typeof current !== 'object') {
          throw new Error(`Config path not found: ${path}`);
        }
        current = (current as Record<string, unknown>)[seg];
      }
      if (current === undefined) {
        throw new Error(`Config path not found: ${path}`);
      }
      return current as T;
    },
    reload: () => {
      /* no-op for tests */
    },
  };
}

interface EmittedEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly source: string;
  readonly taskId?: string;
}

function createMockEventBus(): EventBus & { readonly emittedEvents: EmittedEvent[] } {
  const emittedEvents: EmittedEvent[] = [];
  return {
    emittedEvents,
    emit: (event: Omit<QosEvent, 'id' | 'timestamp'>) => {
      emittedEvents.push({
        type: event.type,
        payload: event.payload,
        source: event.source,
        taskId: event.taskId,
      });
    },
    on: () => {
      /* no-op */
    },
    off: () => {
      /* no-op */
    },
    replay: async () => 0,
    getLastEventId: () => 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModeEngine', () => {
  let companionEngine: ModeEngine;
  let powerEngine: ModeEngine;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    companionEngine = createModeEngine(
      createMockConfigManager('companion'),
      mockEventBus,
    );
    powerEngine = createModeEngine(
      createMockConfigManager('power'),
      mockEventBus,
    );
  });

  // -------------------------------------------------------------------------
  // #1: currentMode returns initial mode from config
  // -------------------------------------------------------------------------

  it('#1 currentMode returns initial mode from config', () => {
    expect(companionEngine.currentMode).toBe('companion');
    expect(powerEngine.currentMode).toBe('power');
  });

  // -------------------------------------------------------------------------
  // #2: switchMode changes mode
  // -------------------------------------------------------------------------

  it('#2 switchMode changes mode', () => {
    expect(companionEngine.currentMode).toBe('companion');
    companionEngine.switchMode('power');
    expect(companionEngine.currentMode).toBe('power');
  });

  // -------------------------------------------------------------------------
  // #3: switchMode emits mode:switched event
  // -------------------------------------------------------------------------

  it('#3 switchMode emits mode:switched event', () => {
    companionEngine.switchMode('power');

    expect(mockEventBus.emittedEvents).toHaveLength(1);
    const event = mockEventBus.emittedEvents[0];
    expect(event.type).toBe('mode:switched');
    expect(event.payload).toEqual({ from: 'companion', to: 'power' });
    expect(event.source).toBe('ModeEngine');
  });

  // -------------------------------------------------------------------------
  // #4: getFeatureGates returns COMPANION_GATES in companion mode
  // -------------------------------------------------------------------------

  it('#4 getFeatureGates returns COMPANION_GATES in companion mode', () => {
    const gates = companionEngine.getFeatureGates();
    expect(gates).toEqual(COMPANION_GATES);
  });

  // -------------------------------------------------------------------------
  // #5: getFeatureGates returns POWER_GATES in power mode
  // -------------------------------------------------------------------------

  it('#5 getFeatureGates returns POWER_GATES in power mode', () => {
    const gates = powerEngine.getFeatureGates();
    expect(gates).toEqual(POWER_GATES);
  });

  // -------------------------------------------------------------------------
  // #6: isFeatureEnabled returns true for enabled feature
  // -------------------------------------------------------------------------

  it('#6 isFeatureEnabled returns true for enabled feature', () => {
    // dashboard is true in both modes
    expect(companionEngine.isFeatureEnabled('dashboard')).toBe(true);
    expect(powerEngine.isFeatureEnabled('dashboard')).toBe(true);

    // rl is only enabled in power mode
    expect(powerEngine.isFeatureEnabled('rl')).toBe(true);

    // simulation is only enabled in power mode
    expect(powerEngine.isFeatureEnabled('simulation')).toBe(true);

    // containerIsolation is only in power
    expect(powerEngine.isFeatureEnabled('containerIsolation')).toBe(true);

    // topology: prefix checks
    expect(companionEngine.isFeatureEnabled('topology:sequential')).toBe(true);
    expect(powerEngine.isFeatureEnabled('topology:mesh')).toBe(true);

    // strategy: prefix checks
    expect(companionEngine.isFeatureEnabled('strategy:cascade')).toBe(true);
    expect(powerEngine.isFeatureEnabled('strategy:pomdp')).toBe(true);

    // channel: prefix checks
    expect(companionEngine.isFeatureEnabled('channel:cli')).toBe(true);
    expect(powerEngine.isFeatureEnabled('channel:discord')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // #7: isFeatureEnabled returns false for disabled feature
  // -------------------------------------------------------------------------

  it('#7 isFeatureEnabled returns false for disabled feature', () => {
    // simulation is disabled in companion
    expect(companionEngine.isFeatureEnabled('simulation')).toBe(false);

    // rl is disabled in companion
    expect(companionEngine.isFeatureEnabled('rl')).toBe(false);

    // containerIsolation is disabled in companion
    expect(companionEngine.isFeatureEnabled('containerIsolation')).toBe(false);

    // topology:mesh is not in companion
    expect(companionEngine.isFeatureEnabled('topology:mesh')).toBe(false);

    // strategy:pomdp is not in companion
    expect(companionEngine.isFeatureEnabled('strategy:pomdp')).toBe(false);

    // channel:discord is not in companion
    expect(companionEngine.isFeatureEnabled('channel:discord')).toBe(false);

    // unknown features always return false
    expect(companionEngine.isFeatureEnabled('nonexistent')).toBe(false);
    expect(powerEngine.isFeatureEnabled('nonexistent')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // #8: COMPANION_GATES has correct topology list (6 topologies)
  // -------------------------------------------------------------------------

  it('#8 COMPANION_GATES has correct topology list (7 topologies)', () => {
    const expected = [
      'sequential',
      'parallel',
      'hierarchical',
      'dag',
      'mixture_of_agents',
      'debate',
      'hybrid',
    ];
    expect(COMPANION_GATES.topologies).toEqual(expected);
    expect(COMPANION_GATES.topologies).toHaveLength(7);
  });

  // -------------------------------------------------------------------------
  // #9: POWER_GATES has all 13 topologies
  // -------------------------------------------------------------------------

  it('#9 POWER_GATES has all 13 topologies', () => {
    const expected = [
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
    ];
    expect(POWER_GATES.topologies).toEqual(expected);
    expect(POWER_GATES.topologies).toHaveLength(13);
  });

  // -------------------------------------------------------------------------
  // #10: switchMode to same mode is a no-op (no event emitted)
  // -------------------------------------------------------------------------

  it('#10 switchMode to same mode is a no-op (no event emitted)', () => {
    companionEngine.switchMode('companion');

    expect(mockEventBus.emittedEvents).toHaveLength(0);
    expect(companionEngine.currentMode).toBe('companion');
  });

  // -------------------------------------------------------------------------
  // Additional coverage: gate constants detail checks
  // -------------------------------------------------------------------------

  describe('COMPANION_GATES detailed values', () => {
    it('maxJudges is 2', () => {
      expect(COMPANION_GATES.maxJudges).toBe(2);
    });

    it('routingStrategies has 3 entries', () => {
      expect(COMPANION_GATES.routingStrategies).toEqual([
        'cascade',
        'cheapest',
        'quality',
      ]);
    });

    it('rlEnabled is false', () => {
      expect(COMPANION_GATES.rlEnabled).toBe(false);
    });

    it('containerIsolation is false', () => {
      expect(COMPANION_GATES.containerIsolation).toBe(false);
    });

    it('dashboard is true', () => {
      expect(COMPANION_GATES.dashboard).toBe(true);
    });

    it('channels are cli and mcp', () => {
      expect(COMPANION_GATES.channels).toEqual(['cli', 'mcp']);
    });

    it('simulationEnabled is false', () => {
      expect(COMPANION_GATES.simulationEnabled).toBe(false);
    });
  });

  describe('POWER_GATES detailed values', () => {
    it('maxJudges is 5', () => {
      expect(POWER_GATES.maxJudges).toBe(5);
    });

    it('routingStrategies has 5 entries', () => {
      expect(POWER_GATES.routingStrategies).toEqual([
        'cascade',
        'cheapest',
        'quality',
        'balanced',
        'pomdp',
      ]);
    });

    it('rlEnabled is true', () => {
      expect(POWER_GATES.rlEnabled).toBe(true);
    });

    it('containerIsolation is true', () => {
      expect(POWER_GATES.containerIsolation).toBe(true);
    });

    it('dashboard is true', () => {
      expect(POWER_GATES.dashboard).toBe(true);
    });

    it('channels has 6 entries', () => {
      expect(POWER_GATES.channels).toEqual([
        'cli',
        'mcp',
        'http',
        'telegram',
        'discord',
        'webhook',
      ]);
    });

    it('simulationEnabled is true', () => {
      expect(POWER_GATES.simulationEnabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getFeatureGates returns a deep clone (immutability)
  // -------------------------------------------------------------------------

  it('getFeatureGates returns a deep clone (immutability)', () => {
    const gates1 = companionEngine.getFeatureGates();
    const gates2 = companionEngine.getFeatureGates();

    // Same values
    expect(gates1).toEqual(gates2);

    // Different references
    expect(gates1).not.toBe(gates2);
    expect(gates1.topologies).not.toBe(gates2.topologies);
  });

  // -------------------------------------------------------------------------
  // switchMode updates gates accordingly
  // -------------------------------------------------------------------------

  it('switchMode updates gates to match new mode', () => {
    expect(companionEngine.getFeatureGates()).toEqual(COMPANION_GATES);

    companionEngine.switchMode('power');
    expect(companionEngine.getFeatureGates()).toEqual(POWER_GATES);

    companionEngine.switchMode('companion');
    expect(companionEngine.getFeatureGates()).toEqual(COMPANION_GATES);
  });

  // -------------------------------------------------------------------------
  // switchMode emits correct from/to for each direction
  // -------------------------------------------------------------------------

  it('switchMode emits correct payload for power to companion', () => {
    powerEngine.switchMode('companion');

    expect(mockEventBus.emittedEvents).toHaveLength(1);
    expect(mockEventBus.emittedEvents[0].payload).toEqual({
      from: 'power',
      to: 'companion',
    });
  });
});
