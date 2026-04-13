// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Simulation Engine
 * Simulate-before-act: sandbox, dry-run, mock modes.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.10
 * Interface: REWRITE-SPEC Section 6 Phase 4 (SimulationEngine), Section 18
 */

import type { TeamDesign, TaskOptions, ContainerManager } from '../types/common.js';
import type { ModelRouter } from '../router/model-router.js';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SimulationMode = 'sandbox' | 'dry-run' | 'mock';

export interface SimulationResult {
  readonly verdict: 'pass' | 'fail' | 'partial';
  readonly issues: readonly string[];
  readonly estimatedCostUsd: number;
  readonly durationMs: number;
  readonly recommendation: 'proceed' | 'redesign' | 'abort';
}

// ---------------------------------------------------------------------------
// Valid topology names for validation
// ---------------------------------------------------------------------------

const VALID_TOPOLOGIES = new Set([
  'sequential', 'parallel', 'hierarchical', 'dag',
  'mixture_of_agents', 'debate', 'mesh', 'star',
  'circular', 'grid', 'forest', 'maker',
]);

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface SimulationEngine {
  simulate(design: TeamDesign, task: TaskOptions): Promise<SimulationResult>;
  selectMode(task: TaskOptions): SimulationMode;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SimulationEngineImpl implements SimulationEngine {
  private readonly _modelRouter: ModelRouter;
  private readonly _containerManager: ContainerManager;
  private readonly _eventBus: EventBus;
  private readonly _db: QosDatabase;

  constructor(
    modelRouter: ModelRouter,
    containerManager: ContainerManager,
    eventBus: EventBus,
    db: QosDatabase,
  ) {
    this._modelRouter = modelRouter;
    this._containerManager = containerManager;
    this._eventBus = eventBus;
    this._db = db;
  }

  async simulate(
    design: TeamDesign,
    task: TaskOptions,
  ): Promise<SimulationResult> {
    const mode = this.selectMode(task);
    const startTime = performance.now();

    this._eventBus.emit({
      type: 'simulation:started',
      payload: {
        taskId: task.prompt.substring(0, 50),
        mode,
        designId: design.id,
      },
      source: 'simulation-engine',
    });

    let result: SimulationResult;

    switch (mode) {
      case 'sandbox':
        result = await this._simulateSandbox(design, task, startTime);
        break;
      case 'dry-run':
        result = await this._simulateDryRun(design, task, startTime);
        break;
      case 'mock':
        result = this._simulateMock(design, task, startTime);
        break;
    }

    // Store result in DB
    this._db.db
      .prepare(
        `INSERT INTO simulation_results
           (id, task_id, team_design_id, verdict, issues, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        generateId(),
        task.prompt.substring(0, 50),
        design.id,
        result.verdict,
        JSON.stringify(result.issues),
        result.estimatedCostUsd,
        result.durationMs,
        now(),
      );

    this._eventBus.emit({
      type: 'simulation:completed',
      payload: { verdict: result.verdict, durationMs: result.durationMs },
      source: 'simulation-engine',
    });

    return result;
  }

  selectMode(task: TaskOptions): SimulationMode {
    if (task.type === 'code') return 'sandbox';
    if (
      task.type === 'research' ||
      task.type === 'analysis' ||
      task.type === 'creative'
    ) {
      return 'dry-run';
    }
    if (task.type === 'custom') return 'mock';
    return 'dry-run';
  }

  // -----------------------------------------------------------------------
  // Private simulation modes
  // -----------------------------------------------------------------------

  private async _simulateSandbox(
    design: TeamDesign,
    task: TaskOptions,
    startTime: number,
  ): Promise<SimulationResult> {
    if (!this._containerManager.isAvailable()) {
      return this._simulateDryRun(design, task, startTime);
    }

    const issues: string[] = [];
    let container;

    try {
      container = await this._containerManager.create({
        timeoutSeconds: 30,
        memoryLimitMb: 256,
        networkEnabled: false,
      });

      for (const agent of design.agents) {
        const result = await container.executeCommand(
          `echo "Agent ${agent.role} simulation"`,
        );
        if (result.exitCode !== 0) {
          issues.push(`Agent '${agent.role}' sandbox failed: ${result.stderr}`);
        }
      }
    } catch (err) {
      issues.push(`Sandbox error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (container) {
        await container.destroy();
      }
    }

    const verdict = issues.length > 0 ? 'fail' : 'pass';
    return {
      verdict,
      issues,
      estimatedCostUsd: 0.001 * design.agents.length,
      durationMs: performance.now() - startTime,
      recommendation: verdict === 'fail' ? 'redesign' : 'proceed',
    };
  }

  private async _simulateDryRun(
    design: TeamDesign,
    task: TaskOptions,
    startTime: number,
  ): Promise<SimulationResult> {
    const issues: string[] = [];
    let totalCost = 0;

    for (const agent of design.agents) {
      try {
        const response = await this._modelRouter.route({
          prompt: `Brief preview: ${task.prompt}\nRole: ${agent.role}`,
          quality: 'low',
          maxTokens: 100,
        });
        totalCost += response.costUsd;

        if (
          response.content.toLowerCase().includes('error') ||
          response.content.toLowerCase().includes('cannot')
        ) {
          issues.push(`Agent '${agent.role}' may have issues: ${response.content.substring(0, 100)}`);
        }
      } catch (err) {
        issues.push(
          `Agent '${agent.role}' dry-run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    let verdict: SimulationResult['verdict'];
    let recommendation: SimulationResult['recommendation'];

    if (issues.length === 0) {
      verdict = 'pass';
      recommendation = 'proceed';
    } else if (issues.length < design.agents.length / 2) {
      verdict = 'partial';
      recommendation = 'proceed';
    } else {
      verdict = 'fail';
      recommendation = 'redesign';
    }

    return {
      verdict,
      issues,
      estimatedCostUsd: totalCost,
      durationMs: performance.now() - startTime,
      recommendation,
    };
  }

  private _simulateMock(
    design: TeamDesign,
    task: TaskOptions,
    startTime: number,
  ): SimulationResult {
    const issues: string[] = [];

    // Validate design structure
    for (const agent of design.agents) {
      if (!agent.role || agent.role.trim() === '') {
        issues.push('Agent has empty role');
      }
    }

    if (!VALID_TOPOLOGIES.has(design.topology)) {
      issues.push(`Invalid topology: '${design.topology}'`);
    }

    if (
      task.budget_usd !== undefined &&
      design.estimatedCostUsd > task.budget_usd
    ) {
      issues.push(
        `Estimated cost $${design.estimatedCostUsd} exceeds budget $${task.budget_usd}`,
      );
    }

    let verdict: SimulationResult['verdict'];
    let recommendation: SimulationResult['recommendation'];

    if (issues.length === 0) {
      verdict = 'pass';
      recommendation = 'proceed';
    } else if (issues.length < design.agents.length / 2) {
      verdict = 'partial';
      recommendation = 'proceed';
    } else {
      verdict = 'fail';
      recommendation = 'redesign';
    }

    return {
      verdict,
      issues,
      estimatedCostUsd: 0,
      durationMs: performance.now() - startTime,
      recommendation,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSimulationEngine(
  modelRouter: ModelRouter,
  containerManager: ContainerManager,
  eventBus: EventBus,
  db: QosDatabase,
): SimulationEngine {
  return new SimulationEngineImpl(modelRouter, containerManager, eventBus, db);
}
