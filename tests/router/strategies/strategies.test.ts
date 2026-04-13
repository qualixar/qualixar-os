/**
 * Qualixar OS V2 -- Routing Strategy Tests
 *
 * Phase 1 LLD Sections 2.4-2.8, TDD Step 1.
 * Tests: RoutingStrategy, ModelInfo, StrategyDecision (types),
 *        CascadeStrategy, CheapestStrategy, QualityStrategy,
 *        BalancedStrategy, PomdpStrategy.
 *
 * All strategies are pure computations -- no mocks needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelRequest } from '../../../src/types/common.js';
import type {
  ModelInfo,
  StrategyDecision,
  RoutingStrategy,
} from '../../../src/router/strategies/types.js';
import { CascadeStrategy } from '../../../src/router/strategies/cascade.js';
import { CheapestStrategy } from '../../../src/router/strategies/cheapest.js';
import { QualityStrategy } from '../../../src/router/strategies/quality.js';
import { BalancedStrategy } from '../../../src/router/strategies/balanced.js';
import { PomdpStrategy } from '../../../src/router/strategies/pomdp.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/**
 * 3 models with varying cost/quality for testing.
 *
 * cheap-model:  low cost, low quality
 * mid-model:    medium cost, medium quality
 * premium-model: high cost, high quality
 */
const TEST_MODELS: readonly ModelInfo[] = [
  {
    name: 'cheap-model',
    provider: 'provider-a',
    costPerInputToken: 0.001,
    costPerOutputToken: 0.002,
    qualityScore: 0.5,
    maxTokens: 4096,
    available: true,
  },
  {
    name: 'mid-model',
    provider: 'provider-b',
    costPerInputToken: 0.005,
    costPerOutputToken: 0.010,
    qualityScore: 0.75,
    maxTokens: 8192,
    available: true,
  },
  {
    name: 'premium-model',
    provider: 'provider-c',
    costPerInputToken: 0.030,
    costPerOutputToken: 0.060,
    qualityScore: 0.95,
    maxTokens: 32768,
    available: true,
  },
] as const;

/** Same models but with mid-model unavailable. */
const MODELS_WITH_UNAVAILABLE: readonly ModelInfo[] = [
  TEST_MODELS[0],
  { ...TEST_MODELS[1], available: false },
  TEST_MODELS[2],
] as const;

/** All models unavailable. */
const NO_AVAILABLE_MODELS: readonly ModelInfo[] = TEST_MODELS.map((m) => ({
  ...m,
  available: false,
}));

/** Helper: creates a minimal ModelRequest. */
function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    prompt: 'Test prompt',
    ...overrides,
  };
}

// ===========================================================================
// Types compile-check
// ===========================================================================

describe('RoutingStrategy types', () => {
  it('ModelInfo interface has correct shape', () => {
    const model: ModelInfo = TEST_MODELS[0];
    expect(model.name).toBe('cheap-model');
    expect(model.provider).toBe('provider-a');
    expect(typeof model.costPerInputToken).toBe('number');
    expect(typeof model.costPerOutputToken).toBe('number');
    expect(typeof model.qualityScore).toBe('number');
    expect(typeof model.maxTokens).toBe('number');
    expect(typeof model.available).toBe('boolean');
  });

  it('StrategyDecision interface has correct shape', () => {
    const decision: StrategyDecision = {
      model: 'test',
      provider: 'test-provider',
      reasoning: 'test reason',
    };
    expect(decision.model).toBe('test');
    expect(decision.provider).toBe('test-provider');
    expect(decision.reasoning).toBe('test reason');
  });

  it('RoutingStrategy interface is implemented by all strategies', () => {
    const strategies: readonly RoutingStrategy[] = [
      new CascadeStrategy(),
      new CheapestStrategy(),
      new QualityStrategy(),
      new BalancedStrategy(),
      new PomdpStrategy(),
    ];
    for (const s of strategies) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.select).toBe('function');
    }
  });
});

// ===========================================================================
// CascadeStrategy
// ===========================================================================

describe('CascadeStrategy', () => {
  let strategy: CascadeStrategy;

  beforeEach(() => {
    strategy = new CascadeStrategy();
  });

  it('has name "cascade"', () => {
    expect(strategy.name).toBe('cascade');
  });

  // #1: selects cheapest available model that meets quality threshold
  it('#1 selects cheapest model meeting default quality threshold', () => {
    // Default quality is medium -> threshold 0.7
    // cheap-model (0.5) fails threshold, mid-model (0.75) passes
    const request = makeRequest();
    const decision = strategy.select(request, TEST_MODELS);

    expect(decision.model).toBe('mid-model');
    expect(decision.provider).toBe('provider-b');
    expect(decision.reasoning).toContain('Cascade');
  });

  // #2: skips unavailable models
  it('#2 skips unavailable models', () => {
    // mid-model is unavailable, cheap-model (0.5) fails threshold 0.7
    // Should escalate to premium-model (best quality available)
    const request = makeRequest();
    const decision = strategy.select(request, MODELS_WITH_UNAVAILABLE);

    // cheap-model (0.5) < 0.7 threshold, premium-model (0.95) >= 0.7
    expect(decision.model).toBe('premium-model');
    expect(decision.provider).toBe('provider-c');
  });

  // #3: escalates to higher quality when quality='high'
  it('#3 escalates to higher quality when quality is high', () => {
    // quality='high' -> threshold 0.85
    // cheap-model (0.5) < 0.85, mid-model (0.75) < 0.85, premium-model (0.95) >= 0.85
    const request = makeRequest({ quality: 'high' });
    const decision = strategy.select(request, TEST_MODELS);

    expect(decision.model).toBe('premium-model');
    expect(decision.provider).toBe('provider-c');
  });

  // #4: falls back to highest quality when none meet threshold
  it('#4 falls back to highest quality when none meet threshold', () => {
    // Use quality='high' (threshold 0.85) with models that all have low quality
    const lowQualityModels: readonly ModelInfo[] = [
      { ...TEST_MODELS[0], qualityScore: 0.3 },
      { ...TEST_MODELS[1], qualityScore: 0.4 },
      { ...TEST_MODELS[2], qualityScore: 0.5, costPerOutputToken: 0.060 },
    ];
    const request = makeRequest({ quality: 'high' });
    const decision = strategy.select(request, lowQualityModels);

    // None meet 0.85, so fall back to highest quality (0.5 = premium-model)
    expect(decision.model).toBe('premium-model');
    expect(decision.reasoning).toContain('escalated');
  });

  // quality='low' selects cheap-model (threshold 0.5, cheap-model qualityScore=0.5 >= 0.5)
  it('quality=low uses threshold 0.5, selects cheapest meeting it', () => {
    const request = makeRequest({ quality: 'low' });
    const decision = strategy.select(request, TEST_MODELS);

    expect(decision.model).toBe('cheap-model');
  });

  // throws when no models available
  it('throws when no models are available', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, NO_AVAILABLE_MODELS)).toThrow(
      'No models available for cascade strategy',
    );
  });

  it('throws when models array is empty', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, [])).toThrow(
      'No models available for cascade strategy',
    );
  });
});

// ===========================================================================
// CheapestStrategy
// ===========================================================================

describe('CheapestStrategy', () => {
  let strategy: CheapestStrategy;

  beforeEach(() => {
    strategy = new CheapestStrategy();
  });

  it('has name "cheapest"', () => {
    expect(strategy.name).toBe('cheapest');
  });

  // #5: selects lowest cost model
  it('#5 selects lowest total cost model', () => {
    const request = makeRequest();
    const decision = strategy.select(request, TEST_MODELS);

    // cheap-model has lowest costPerInputToken + costPerOutputToken
    expect(decision.model).toBe('cheap-model');
    expect(decision.provider).toBe('provider-a');
    expect(decision.reasoning).toContain('Cheapest');
  });

  // #6: skips unavailable models
  it('#6 skips unavailable models', () => {
    const modelsOnlyCheapUnavailable: readonly ModelInfo[] = [
      { ...TEST_MODELS[0], available: false },
      TEST_MODELS[1],
      TEST_MODELS[2],
    ];
    const request = makeRequest();
    const decision = strategy.select(request, modelsOnlyCheapUnavailable);

    // cheap-model unavailable, next cheapest is mid-model
    expect(decision.model).toBe('mid-model');
    expect(decision.provider).toBe('provider-b');
  });

  it('throws when no models are available', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, NO_AVAILABLE_MODELS)).toThrow(
      'No models available for cheapest strategy',
    );
  });
});

// ===========================================================================
// QualityStrategy
// ===========================================================================

describe('QualityStrategy', () => {
  let strategy: QualityStrategy;

  beforeEach(() => {
    strategy = new QualityStrategy();
  });

  it('has name "quality"', () => {
    expect(strategy.name).toBe('quality');
  });

  // #7: selects highest qualityScore model
  it('#7 selects highest quality model', () => {
    const request = makeRequest();
    const decision = strategy.select(request, TEST_MODELS);

    expect(decision.model).toBe('premium-model');
    expect(decision.provider).toBe('provider-c');
    expect(decision.reasoning).toContain('Quality');
  });

  // #8: skips unavailable models
  it('#8 skips unavailable models', () => {
    const modelsOnlyPremiumUnavailable: readonly ModelInfo[] = [
      TEST_MODELS[0],
      TEST_MODELS[1],
      { ...TEST_MODELS[2], available: false },
    ];
    const request = makeRequest();
    const decision = strategy.select(request, modelsOnlyPremiumUnavailable);

    // premium unavailable, next highest quality is mid-model (0.75)
    expect(decision.model).toBe('mid-model');
    expect(decision.provider).toBe('provider-b');
  });

  it('throws when no models are available', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, NO_AVAILABLE_MODELS)).toThrow(
      'No models available for quality strategy',
    );
  });
});

// ===========================================================================
// BalancedStrategy
// ===========================================================================

describe('BalancedStrategy', () => {
  let strategy: BalancedStrategy;

  beforeEach(() => {
    strategy = new BalancedStrategy();
  });

  it('has name "balanced"', () => {
    expect(strategy.name).toBe('balanced');
  });

  // #9: selects Pareto-optimal model (default weight 0.6)
  it('#9 selects Pareto-optimal model with default weight 0.6', () => {
    const request = makeRequest();
    const decision = strategy.select(request, TEST_MODELS);

    // With default weight 0.6 quality / 0.4 cost:
    // Normalize costs: min=0.002, max=0.060
    // cheap:   costNorm = (0.002 - 0.002) / (0.060 - 0.002) = 0.0
    //          score = 0.5 * 0.6 + (1 - 0.0) * 0.4 = 0.30 + 0.40 = 0.70
    // mid:     costNorm = (0.010 - 0.002) / (0.060 - 0.002) = 0.138
    //          score = 0.75 * 0.6 + (1 - 0.138) * 0.4 = 0.45 + 0.345 = 0.795
    // premium: costNorm = (0.060 - 0.002) / (0.060 - 0.002) = 1.0
    //          score = 0.95 * 0.6 + (1 - 1.0) * 0.4 = 0.57 + 0.0 = 0.57
    // Winner: mid-model at 0.795
    expect(decision.model).toBe('mid-model');
    expect(decision.provider).toBe('provider-b');
    expect(decision.reasoning).toContain('Balanced');
    expect(decision.reasoning).toContain('Pareto');
  });

  // #10: custom weight shifts selection
  it('#10 custom weight shifts selection', () => {
    // weight=0.9 heavily favors quality
    const qualityHeavy = new BalancedStrategy(0.9);
    const request = makeRequest();
    const decision = qualityHeavy.select(request, TEST_MODELS);

    // cheap:   0.5*0.9 + 1.0*0.1 = 0.55
    // mid:     0.75*0.9 + 0.862*0.1 = 0.675 + 0.0862 = 0.7612
    // premium: 0.95*0.9 + 0.0*0.1 = 0.855
    // Winner: premium-model at 0.855
    expect(decision.model).toBe('premium-model');
  });

  // #11: with weight=1.0 behaves like quality strategy
  it('#11 with weight=1.0 behaves like quality strategy', () => {
    const pureQuality = new BalancedStrategy(1.0);
    const request = makeRequest();
    const decision = pureQuality.select(request, TEST_MODELS);

    // score = qualityScore * 1.0 + 0 = qualityScore
    // premium-model has highest quality (0.95)
    expect(decision.model).toBe('premium-model');
  });

  // #12: with weight=0.0 behaves like cheapest strategy
  it('#12 with weight=0.0 behaves like cheapest strategy', () => {
    const pureCost = new BalancedStrategy(0.0);
    const request = makeRequest();
    const decision = pureCost.select(request, TEST_MODELS);

    // score = 0 + (1 - costNorm) * 1.0
    // cheap-model has costNorm=0.0, so score = 1.0 (highest)
    expect(decision.model).toBe('cheap-model');
  });

  it('throws when no models are available', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, NO_AVAILABLE_MODELS)).toThrow(
      'No models available for balanced strategy',
    );
  });

  // Edge case: all models same cost -> costNorm = 0.5 for all
  it('handles all models with same cost', () => {
    const sameCostModels: readonly ModelInfo[] = [
      { ...TEST_MODELS[0], costPerOutputToken: 0.01 },
      { ...TEST_MODELS[1], costPerOutputToken: 0.01 },
      { ...TEST_MODELS[2], costPerOutputToken: 0.01 },
    ];
    const request = makeRequest();
    const decision = strategy.select(request, sameCostModels);

    // When maxCost === minCost, costNorm = 0.5 for all
    // Score is driven purely by qualityScore
    // premium-model (0.95) wins
    expect(decision.model).toBe('premium-model');
  });
});

// ===========================================================================
// PomdpStrategy
// ===========================================================================

describe('PomdpStrategy', () => {
  let strategy: PomdpStrategy;

  beforeEach(() => {
    strategy = new PomdpStrategy();
  });

  it('has name "pomdp"', () => {
    expect(strategy.name).toBe('pomdp');
  });

  // #13: initial belief is uniform
  it('#13 initial belief is uniform [1/3, 1/3, 1/3]', () => {
    const belief = strategy.getBelief();
    expect(belief).toHaveLength(3);

    // Each should be approximately 1/3
    for (const b of belief) {
      expect(b).toBeCloseTo(1 / 3, 5);
    }
  });

  // #14: selects model with highest expected reward
  it('#14 selects model with highest expected reward', () => {
    const request = makeRequest();
    const decision = strategy.select(request, TEST_MODELS);

    // With uniform belief, the POMDP should consider both quality reward
    // and cost penalty. The decision should be deterministic.
    expect(decision.model).toBeDefined();
    expect(decision.provider).toBeDefined();
    expect(decision.reasoning).toContain('POMDP');
    expect(decision.reasoning).toContain('belief');
  });

  // #15: updateBelief shifts belief toward observed state
  it('#15 updateBelief shifts belief toward observed state', () => {
    // Observe 'good' -> should increase belief in high quality state (index 2)
    const beliefBefore = strategy.getBelief();
    strategy.updateBelief('good');
    const beliefAfter = strategy.getBelief();

    // belief[2] (high state) should increase
    expect(beliefAfter[2]).toBeGreaterThan(beliefBefore[2]);
    // belief[0] (low state) should decrease
    expect(beliefAfter[0]).toBeLessThan(beliefBefore[0]);
  });

  // #16: repeated high observations increase belief[2]
  it('#16 repeated good observations increase belief[2]', () => {
    const initial = strategy.getBelief();

    strategy.updateBelief('good');
    const after1 = strategy.getBelief();
    expect(after1[2]).toBeGreaterThan(initial[2]);

    strategy.updateBelief('good');
    const after2 = strategy.getBelief();
    expect(after2[2]).toBeGreaterThan(after1[2]);

    strategy.updateBelief('good');
    const after3 = strategy.getBelief();
    expect(after3[2]).toBeGreaterThan(after2[2]);

    // After 3 good observations, high state belief should dominate
    expect(after3[2]).toBeGreaterThan(0.6);
  });

  // Belief sums to 1 after updates
  it('belief always sums to 1.0 after updates', () => {
    strategy.updateBelief('poor');
    let belief = strategy.getBelief();
    let sum = belief.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);

    strategy.updateBelief('fair');
    belief = strategy.getBelief();
    sum = belief.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);

    strategy.updateBelief('good');
    belief = strategy.getBelief();
    sum = belief.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  // poor observations shift belief toward low state
  it('poor observations increase belief[0] (low state)', () => {
    strategy.updateBelief('poor');
    strategy.updateBelief('poor');
    strategy.updateBelief('poor');
    const belief = strategy.getBelief();

    expect(belief[0]).toBeGreaterThan(belief[1]);
    expect(belief[0]).toBeGreaterThan(belief[2]);
  });

  // fair observations shift belief toward medium state
  it('fair observations increase belief[1] (medium state)', () => {
    strategy.updateBelief('fair');
    strategy.updateBelief('fair');
    strategy.updateBelief('fair');
    const belief = strategy.getBelief();

    expect(belief[1]).toBeGreaterThan(belief[0]);
    expect(belief[1]).toBeGreaterThan(belief[2]);
  });

  // Skips unavailable models
  it('skips unavailable models', () => {
    const request = makeRequest();
    const decision = strategy.select(request, MODELS_WITH_UNAVAILABLE);

    // mid-model is unavailable, decision should be cheap or premium
    expect(decision.model).not.toBe('mid-model');
  });

  it('throws when no models are available', () => {
    const request = makeRequest();
    expect(() => strategy.select(request, NO_AVAILABLE_MODELS)).toThrow(
      'No models available for POMDP strategy',
    );
  });

  // getBelief returns a copy (immutability)
  it('getBelief returns a copy, not internal state', () => {
    const b1 = strategy.getBelief();
    const b2 = strategy.getBelief();
    expect(b1).toEqual(b2);
    expect(b1).not.toBe(b2); // Different array references
  });

  // Belief clamping: no component goes below 0.01 or above 0.98
  it('belief is clamped between 0.01 and 0.98', () => {
    // Many extreme observations to push toward degeneracy
    for (let i = 0; i < 50; i++) {
      strategy.updateBelief('good');
    }
    const belief = strategy.getBelief();

    for (const b of belief) {
      expect(b).toBeGreaterThanOrEqual(0.01);
      expect(b).toBeLessThanOrEqual(0.98);
    }
  });
});
