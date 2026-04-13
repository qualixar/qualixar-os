/**
 * Qualixar OS V2 -- BudgetOptimizer Tests
 *
 * Phase 1 LLD Section 2.12, TDD Step 1.
 * Tests: optimize (feasible, infeasible, quality minimum, binary assignment).
 *
 * Pure computation -- no database needed.
 */

import { describe, it, expect } from 'vitest';
import {
  createBudgetOptimizer,
  type BudgetOptimizer,
  type OptimizationRequest,
  type OptimizationResult,
} from '../../src/cost/budget-optimizer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetOptimizer', () => {
  let optimizer: BudgetOptimizer;

  // Fresh instance per test is cheap since BudgetOptimizer is stateless
  const getOptimizer = (): BudgetOptimizer => createBudgetOptimizer();

  // -------------------------------------------------------------------------
  // #1: optimize() returns feasible assignment under budget
  // -------------------------------------------------------------------------

  it('#1 optimize() returns feasible assignment under budget', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'planning',
          modelOptions: [
            { model: 'claude-sonnet-4-6', estimatedCostUsd: 0.05, estimatedQuality: 0.9 },
            { model: 'gpt-4.1-mini', estimatedCostUsd: 0.01, estimatedQuality: 0.7 },
          ],
        },
        {
          name: 'execution',
          modelOptions: [
            { model: 'claude-sonnet-4-6', estimatedCostUsd: 0.10, estimatedQuality: 0.9 },
            { model: 'gpt-4.1-mini', estimatedCostUsd: 0.02, estimatedQuality: 0.7 },
          ],
        },
      ],
      budgetUsd: 1.0,
      qualityMin: 0.5,
    };

    const result: OptimizationResult = await optimizer.optimize(request);

    expect(result.feasible).toBe(true);
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.totalCostUsd).toBeLessThanOrEqual(1.0);
    expect(result.estimatedQuality).toBeGreaterThanOrEqual(0.5);

    // Each subtask should have exactly one assignment
    expect(Object.keys(result.assignments)).toHaveLength(2);
    expect(result.assignments['planning']).toBeDefined();
    expect(result.assignments['execution']).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // #2: optimize() returns infeasible when budget too low
  // -------------------------------------------------------------------------

  it('#2 optimize() returns infeasible when budget too low', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'planning',
          modelOptions: [
            { model: 'claude-sonnet-4-6', estimatedCostUsd: 5.0, estimatedQuality: 0.9 },
          ],
        },
        {
          name: 'execution',
          modelOptions: [
            { model: 'claude-sonnet-4-6', estimatedCostUsd: 6.0, estimatedQuality: 0.9 },
          ],
        },
      ],
      budgetUsd: 1.0, // $1 budget but cheapest combo costs $11
      qualityMin: 0.5,
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(false);
    expect(result.totalCostUsd).toBe(0);
    expect(result.estimatedQuality).toBe(0);
    expect(Object.keys(result.assignments)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // #3: optimize() respects quality minimum
  // -------------------------------------------------------------------------

  it('#3 optimize() respects quality minimum', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'planning',
          modelOptions: [
            { model: 'cheap-bad', estimatedCostUsd: 0.001, estimatedQuality: 0.1 },
            { model: 'expensive-good', estimatedCostUsd: 0.10, estimatedQuality: 0.95 },
          ],
        },
      ],
      budgetUsd: 1.0,
      qualityMin: 0.8, // Must be >= 0.8, so cheap-bad is excluded
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(true);
    expect(result.assignments['planning']).toBe('expensive-good');
    expect(result.estimatedQuality).toBeGreaterThanOrEqual(0.8);
  });

  // -------------------------------------------------------------------------
  // #4: optimize() assigns one model per subtask (binary)
  // -------------------------------------------------------------------------

  it('#4 optimize() assigns one model per subtask (binary)', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'research',
      subtasks: [
        {
          name: 'search',
          modelOptions: [
            { model: 'model-A', estimatedCostUsd: 0.01, estimatedQuality: 0.6 },
            { model: 'model-B', estimatedCostUsd: 0.02, estimatedQuality: 0.8 },
            { model: 'model-C', estimatedCostUsd: 0.05, estimatedQuality: 0.95 },
          ],
        },
        {
          name: 'synthesize',
          modelOptions: [
            { model: 'model-A', estimatedCostUsd: 0.01, estimatedQuality: 0.5 },
            { model: 'model-B', estimatedCostUsd: 0.03, estimatedQuality: 0.85 },
          ],
        },
        {
          name: 'verify',
          modelOptions: [
            { model: 'model-C', estimatedCostUsd: 0.04, estimatedQuality: 0.9 },
            { model: 'model-A', estimatedCostUsd: 0.008, estimatedQuality: 0.55 },
          ],
        },
      ],
      budgetUsd: 0.50,
      qualityMin: 0.4,
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(true);

    // Each subtask has exactly one assignment
    expect(Object.keys(result.assignments)).toHaveLength(3);
    expect(result.assignments['search']).toBeDefined();
    expect(result.assignments['synthesize']).toBeDefined();
    expect(result.assignments['verify']).toBeDefined();

    // Each assigned model must be one of the options for that subtask
    const searchOptions = ['model-A', 'model-B', 'model-C'];
    const synthesizeOptions = ['model-A', 'model-B'];
    const verifyOptions = ['model-C', 'model-A'];

    expect(searchOptions).toContain(result.assignments['search']);
    expect(synthesizeOptions).toContain(result.assignments['synthesize']);
    expect(verifyOptions).toContain(result.assignments['verify']);

    // Total cost must be within budget
    expect(result.totalCostUsd).toBeLessThanOrEqual(0.50);
  });

  // -------------------------------------------------------------------------
  // Edge: empty subtasks returns trivially feasible
  // -------------------------------------------------------------------------

  it('empty subtasks returns trivially feasible', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [],
      budgetUsd: 10,
      qualityMin: 0.5,
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(true);
    expect(result.totalCostUsd).toBe(0);
    expect(result.estimatedQuality).toBe(1.0);
    expect(Object.keys(result.assignments)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Edge: zero budget returns infeasible
  // -------------------------------------------------------------------------

  it('zero budget returns infeasible', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'task-1',
          modelOptions: [
            { model: 'model-A', estimatedCostUsd: 0.01, estimatedQuality: 0.8 },
          ],
        },
      ],
      budgetUsd: 0,
      qualityMin: 0.5,
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(false);
    expect(result.totalCostUsd).toBe(0);
    expect(result.estimatedQuality).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Edge: quality minimum too high makes all options infeasible
  // -------------------------------------------------------------------------

  it('quality minimum too high returns infeasible', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'task-1',
          modelOptions: [
            { model: 'model-A', estimatedCostUsd: 0.01, estimatedQuality: 0.3 },
            { model: 'model-B', estimatedCostUsd: 0.02, estimatedQuality: 0.4 },
          ],
        },
      ],
      budgetUsd: 10,
      qualityMin: 0.9, // Both options below 0.9
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Solver prefers higher quality when budget permits
  // -------------------------------------------------------------------------

  it('solver maximizes quality within budget', async () => {
    optimizer = getOptimizer();

    const request: OptimizationRequest = {
      taskType: 'code',
      subtasks: [
        {
          name: 'task-1',
          modelOptions: [
            { model: 'low-quality', estimatedCostUsd: 0.01, estimatedQuality: 0.5 },
            { model: 'high-quality', estimatedCostUsd: 0.05, estimatedQuality: 0.99 },
          ],
        },
      ],
      budgetUsd: 1.0,
      qualityMin: 0.3,
    };

    const result = await optimizer.optimize(request);

    expect(result.feasible).toBe(true);
    // With enough budget, solver should pick the higher quality option
    expect(result.assignments['task-1']).toBe('high-quality');
    expect(result.estimatedQuality).toBeGreaterThanOrEqual(0.9);
  });
});
