// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Budget Optimizer
 *
 * Phase 1 LLD Section 2.12.
 * LP formulation via javascript-lp-solver for optimal model assignment.
 *
 * Pure computation -- no database, no side effects, no events.
 *
 * Key constraint: `ints` property forces binary/integer programming (H4 fix).
 * Without this, LP relaxation may assign fractional values, violating
 * "exactly one model per subtask" semantics.
 */

import type { Model, SolveResult } from 'javascript-lp-solver';

// javascript-lp-solver: CJS package with `export { solver as default }`.
// Use dynamic import for ESM compatibility.
async function loadSolver(): Promise<
  (model: Model, precision?: number, full?: boolean, validate?: boolean) => SolveResult
> {
  const lpModule = await import('javascript-lp-solver') as unknown as {
    default?: { Solve(model: Model, precision?: number, full?: boolean, validate?: boolean): SolveResult };
    Solve?(model: Model, precision?: number, full?: boolean, validate?: boolean): SolveResult;
  };
  // Handle both default export and named export patterns from CJS interop
  const solver = lpModule.default ?? lpModule;
  return solver.Solve!.bind(solver);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptimizationRequest {
  readonly taskType: string;
  readonly subtasks: readonly SubtaskEstimate[];
  readonly budgetUsd: number;
  readonly qualityMin: number;
}

export interface SubtaskEstimate {
  readonly name: string;
  readonly modelOptions: readonly ModelOption[];
}

export interface ModelOption {
  readonly model: string;
  readonly estimatedCostUsd: number;
  readonly estimatedQuality: number;
}

export interface OptimizationResult {
  readonly assignments: Record<string, string>;
  readonly totalCostUsd: number;
  readonly estimatedQuality: number;
  readonly feasible: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BudgetOptimizer {
  /** Solve the LP to find optimal model assignments under budget. */
  optimize(request: OptimizationRequest): Promise<OptimizationResult>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class BudgetOptimizerImpl implements BudgetOptimizer {
  async optimize(request: OptimizationRequest): Promise<OptimizationResult> {
    // 1a. Empty subtasks -> trivially feasible
    if (request.subtasks.length === 0) {
      return {
        assignments: {},
        totalCostUsd: 0,
        estimatedQuality: 1.0,
        feasible: true,
      };
    }

    // 1b. Zero or negative budget -> infeasible
    if (request.budgetUsd <= 0) {
      return {
        assignments: {},
        totalCostUsd: 0,
        estimatedQuality: 0,
        feasible: false,
      };
    }

    // 2. Formulate LP model using the library's Model type
    const model: Model & { ints: Record<string, 1> } = {
      optimize: 'quality',
      opType: 'max',
      constraints: {},
      variables: {},
      ints: {},
    };

    // Budget constraint
    model.constraints['budget'] = { max: request.budgetUsd };

    for (let i = 0; i < request.subtasks.length; i++) {
      const subtask = request.subtasks[i];

      // Assignment constraint: exactly 1 model per subtask
      model.constraints[`assign_${i}`] = { equal: 1 };

      // Quality minimum constraint per subtask
      model.constraints[`quality_${i}`] = { min: request.qualityMin };

      for (let j = 0; j < subtask.modelOptions.length; j++) {
        const option = subtask.modelOptions[j];
        const varName = `x_${i}_${j}`;

        model.variables[varName] = {
          quality: option.estimatedQuality,
          budget: option.estimatedCostUsd,
          [`assign_${i}`]: 1,
          [`quality_${i}`]: option.estimatedQuality,
        };

        // H4 FIX: Force integer programming (binary assignment)
        model.ints[varName] = 1;
      }
    }

    // 3. Solve (cast to Record for dynamic variable access on result)
    const solveLp = await loadSolver();
    const result = solveLp(model as Model) as Record<string, unknown>;

    // 4. Interpret result
    if (result['feasible'] === false) {
      return {
        assignments: {},
        totalCostUsd: 0,
        estimatedQuality: 0,
        feasible: false,
      };
    }

    // 5. Extract assignments
    const assignments: Record<string, string> = {};
    let totalCost = 0;
    let totalQuality = 0;

    for (let i = 0; i < request.subtasks.length; i++) {
      for (let j = 0; j < request.subtasks[i].modelOptions.length; j++) {
        const varName = `x_${i}_${j}`;
        const value = result[varName] as number | undefined;

        // Binary relaxation threshold: > 0.5 means assigned
        if (value !== undefined && value > 0.5) {
          assignments[request.subtasks[i].name] = request.subtasks[i].modelOptions[j].model;
          totalCost += request.subtasks[i].modelOptions[j].estimatedCostUsd;
          totalQuality += request.subtasks[i].modelOptions[j].estimatedQuality;
        }
      }
    }

    // Average quality across all subtasks
    const avgQuality = request.subtasks.length > 0
      ? totalQuality / request.subtasks.length
      : 0;

    return {
      assignments,
      totalCostUsd: totalCost,
      estimatedQuality: avgQuality,
      feasible: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a BudgetOptimizer (stateless, pure computation).
 */
export function createBudgetOptimizer(): BudgetOptimizer {
  return new BudgetOptimizerImpl();
}
