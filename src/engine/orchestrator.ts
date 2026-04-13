// TODO: Split into smaller modules (audit finding M-20). This file exceeds the 800-line cap.
// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Orchestrator
 * LLD Section 2.4
 *
 * Central task lifecycle coordinator: the 12-step pipeline.
 * Wires all components together for end-to-end task execution.
 *
 * Hard Rules:
 *   - SLMLite.autoInvoke() BEFORE Forge.designTeam()
 *   - Checkpoint after EVERY major step
 *   - Emit typed events for EVERY state transition
 *   - Respect budget limits
 *   - Steering MUST NOT lose agent state
 *   - Failed tasks MUST still produce output
 *   - SecurityEngine runs before SwarmEngine
 */

import type { ModeEngine } from './mode-engine.js';
import type { ModelRouter } from '../router/model-router.js';
import type { CostTracker } from '../cost/cost-tracker.js';
import type { BudgetChecker } from '../cost/budget-checker.js';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import type { Logger } from 'pino';
import type {
  TaskOptions,
  TaskResult,
  Artifact,
  SecurityAction,
  TeamDesign,
  JudgeVerdict,
  QosMode,
} from '../types/common.js';
import type { Steering } from './steering.js';
import type { Durability, DurableState } from './durability.js';
import type { OutputEngine } from './output-engine.js';
import type {
  OrchestratorForge,
  OrchestratorSwarmEngine,
  OrchestratorSwarmResult,
  OrchestratorSimulationEngine,
  OrchestratorSecurityEngine,
  OrchestratorJudgePipeline,
  OrchestratorJudgeResult,
  OrchestratorStrategyScorer,
  OrchestratorSLMLite,
  OrchestratorAgentRegistry,
} from './orchestrator-types.js';
import {
  extractArtifacts as extractArtifactsHelper,
  buildTaskResult as buildTaskResultHelper,
  buildDurableState as buildDurableStateHelper,
} from './orchestrator-helpers.js';
import { DegradationEngine } from './degradation.js';
import type { DegradationRecommendation } from './degradation.js';
import type { HeartbeatManager } from './heartbeat.js';
import { createHeartbeatManager } from './heartbeat.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { writeOutputToDisk } from '../utils/output-writer.js';

// Re-export types for consumers
export type {
  OrchestratorForge,
  OrchestratorSwarmEngine,
  OrchestratorSwarmResult,
  OrchestratorSimulationEngine,
  OrchestratorSecurityEngine,
  OrchestratorJudgePipeline,
  OrchestratorJudgeResult,
  OrchestratorStrategyScorer,
  OrchestratorSLMLite,
  OrchestratorAgentRegistry,
} from './orchestrator-types.js';

const MAX_REDESIGNS = 5;
const MAX_JUDGE_EVALUATIONS = 10;
const MAX_DEGRADATION_ATTEMPTS = 3;
const MAX_REDIRECT_DEPTH = 10; // H-10 FIX: Prevent infinite redirect loops → stack overflow
const DEFAULT_BUDGET_USD = 1;

export interface TaskStatus {
  readonly taskId: string;
  readonly phase: 'init' | 'memory' | 'forge' | 'simulate' | 'run' | 'judge' | 'output' | 'failed';
  readonly progress: number;
  readonly currentAgents: readonly string[];
  readonly redesignCount: number;
  readonly costSoFar: number;
  readonly startedAt: string;
  readonly lastCheckpoint?: string;
}

export interface Orchestrator {
  run(options: TaskOptions): Promise<TaskResult>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  redirect(taskId: string, newPrompt: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  getStatus(taskId: string): TaskStatus;
  recoverIncompleteTasks(): Promise<void>;
  readonly modeEngine: ModeEngine;
  readonly modelRouter: ModelRouter;
  readonly costTracker: CostTracker;
  readonly forge: OrchestratorForge;
  readonly judgePipeline: OrchestratorJudgePipeline;
  readonly slmLite: OrchestratorSLMLite;
  readonly agentRegistry: OrchestratorAgentRegistry;
  readonly swarmEngine: OrchestratorSwarmEngine;
  readonly strategyScorer: OrchestratorStrategyScorer;
  readonly eventBus: EventBus;
  readonly db: QosDatabase;
  readonly budgetChecker: BudgetChecker;
  readonly degradationEngine: DegradationEngine;
  readonly heartbeatManager: HeartbeatManager;
}

export class OrchestratorImpl implements Orchestrator {
  public readonly modeEngine: ModeEngine;
  public readonly modelRouter: ModelRouter;
  private readonly securityEngine: OrchestratorSecurityEngine;
  public readonly judgePipeline: OrchestratorJudgePipeline;
  public readonly strategyScorer: OrchestratorStrategyScorer;
  public readonly forge: OrchestratorForge;
  public readonly swarmEngine: OrchestratorSwarmEngine;
  private readonly simulationEngine: OrchestratorSimulationEngine;
  public readonly slmLite: OrchestratorSLMLite;
  private readonly steering: Steering;
  private readonly durability: Durability;
  private readonly outputEngine: OutputEngine;
  public readonly costTracker: CostTracker;
  public readonly budgetChecker: BudgetChecker;
  public readonly eventBus: EventBus;
  public readonly agentRegistry: OrchestratorAgentRegistry;
  public readonly db: QosDatabase;
  public readonly degradationEngine: DegradationEngine;
  public readonly heartbeatManager: HeartbeatManager;
  private readonly logger: Logger;
  private readonly activeStatuses = new Map<string, TaskStatus>();
  private readonly workingMemories = new Map<string, Record<string, unknown>>();
  // H-10 FIX: Track redirect depth per task to prevent infinite redirect → stack overflow
  private readonly redirectCounts = new Map<string, number>();

  constructor(
    modeEngine: ModeEngine, modelRouter: ModelRouter,
    securityEngine: OrchestratorSecurityEngine, judgePipeline: OrchestratorJudgePipeline,
    strategyScorer: OrchestratorStrategyScorer, forge: OrchestratorForge,
    swarmEngine: OrchestratorSwarmEngine, simulationEngine: OrchestratorSimulationEngine,
    slmLite: OrchestratorSLMLite, steering: Steering, durability: Durability,
    outputEngine: OutputEngine, costTracker: CostTracker, budgetChecker: BudgetChecker,
    eventBus: EventBus, agentRegistry: OrchestratorAgentRegistry,
    db: QosDatabase, logger: Logger,
    degradationEngine?: DegradationEngine,
  ) {
    this.modeEngine = modeEngine; this.modelRouter = modelRouter;
    this.securityEngine = securityEngine; this.judgePipeline = judgePipeline;
    this.strategyScorer = strategyScorer; this.forge = forge;
    this.swarmEngine = swarmEngine; this.simulationEngine = simulationEngine;
    this.slmLite = slmLite; this.steering = steering;
    this.durability = durability; this.outputEngine = outputEngine;
    this.costTracker = costTracker; this.budgetChecker = budgetChecker;
    this.eventBus = eventBus; this.agentRegistry = agentRegistry;
    this.db = db; this.logger = logger;
    this.degradationEngine = degradationEngine ?? new DegradationEngine();
    this.heartbeatManager = createHeartbeatManager(db, eventBus);
  }

  async run(rawOptions: TaskOptions): Promise<TaskResult> {
    const taskId = rawOptions.taskId ?? generateId();

    // G-06: Auto-provision workspace directory if not explicitly set
    // Expand ~ to homedir() in case config uses tilde notation
    const expandedWorkingDir = rawOptions.workingDir?.replace(/^~/, homedir());
    const options: TaskOptions = expandedWorkingDir
      ? { ...rawOptions, workingDir: expandedWorkingDir }
      : (() => {
          const baseDir = join(homedir(), '.qualixar-os', 'workspaces');
          const workspaceDir = join(baseDir, taskId);
          mkdirSync(join(workspaceDir, 'src'), { recursive: true });
          mkdirSync(join(workspaceDir, 'docs'), { recursive: true });
          mkdirSync(join(workspaceDir, 'artifacts'), { recursive: true });
          mkdirSync(join(workspaceDir, '.qos-log'), { recursive: true });
          return { ...rawOptions, workingDir: workspaceDir };
        })();

    const startTime = Date.now();
    let redesignCount = 0;
    const mode = options.mode ?? this.modeEngine.currentMode;
    const gates = this.modeEngine.getFeatureGates();

    // G-13: Start heartbeat for long-running task detection
    this.heartbeatManager.start(taskId);

    try {
    // STEP 1: Initialize
    // H-19: Default budget per task. $1 prevents "always passes" while allowing
    // multi-agent tasks within the global $10 budget.
    const budgetStatus = this.budgetChecker.check(
      taskId,
      options.budget_usd ?? DEFAULT_BUDGET_USD,
    );
    if (!budgetStatus.allowed) {
      throw new Error(`Budget exceeded: ${budgetStatus.message}`);
    }

    // Check if task already exists (redirect/recovery case)
    const existingTask = this.db.get<{ id: string }>('SELECT id FROM tasks WHERE id = ?', [taskId]);
    if (existingTask) {
      this.db.update('tasks', { prompt: options.prompt, status: 'running', updated_at: now() }, { id: taskId });
    } else {
      this.db.insert('tasks', {
        id: taskId,
        type: options.type ?? 'custom',
        prompt: options.prompt,
        status: 'pending',
        mode,
        created_at: now(),
        updated_at: now(),
      });
    }

    this.workingMemories.set(taskId, {});
    if (!existingTask) {
      this.steering.registerTask(taskId);
    }

    const initialStatus: TaskStatus = {
      taskId,
      phase: 'init',
      progress: 0,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: 0,
      startedAt: now(),
      lastCheckpoint: undefined,
    };
    this.activeStatuses.set(taskId, initialStatus);

    this.eventBus.emit({
      type: 'task:created',
      payload: {
        taskId,
        prompt: options.prompt,
        type: options.type,
        mode,
      },
      source: 'orchestrator',
      taskId,
    });
    this.emitStep(taskId, 'init', 'started');
    this.durability.checkpoint(
      taskId,
      'init',
      this.buildDurableState(taskId, 'init', options, null, null, [], 0),
    );
    this.emitStep(taskId, 'init', 'completed');
    this.db.update('tasks', { status: 'running', updated_at: now() }, { id: taskId });

    // STEP 2: Memory injection
    let steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, null, mode);
    }
    if (steeringAction === 'redirect') {
      return this.run(this.handleRedirect(taskId, options));
    }
    this.updateStatus(taskId, { phase: 'memory', progress: 10 });
    this.emitStep(taskId, 'memory', 'started');

    let memoryContext: { entries: readonly unknown[]; summary: string; totalFound: number; layerCounts: Record<string, number> } = { entries: [] as readonly unknown[], summary: '', totalFound: 0, layerCounts: {} };
    try {
      memoryContext = await this.slmLite.autoInvoke(options);
    } catch (err) {
      this.logger.warn({ taskId, err }, 'Memory recall failed, continuing without context');
    }
    this.workingMemories.set(taskId, {
      ...this.workingMemories.get(taskId)!,
      memoryContext,
    });
    this.eventBus.emit({
      type: 'memory:recalled',
      payload: { taskId, totalFound: memoryContext.totalFound },
      source: 'orchestrator',
      taskId,
    });
    this.durability.checkpoint(
      taskId,
      'memory',
      this.buildDurableState(taskId, 'memory', options, null, null, [], 0),
    );
    this.emitStep(taskId, 'memory', 'completed');

    // STEP 3: Team design (Forge)
    steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, null, mode);
    }
    if (steeringAction === 'redirect') {
      return this.run(this.handleRedirect(taskId, options));
    }
    this.updateStatus(taskId, { phase: 'forge', progress: 20 });
    this.emitStep(taskId, 'forge', 'started');

    let teamDesign: TeamDesign;
    try {
      teamDesign = await this.forge.designTeam({
        taskId,
        prompt: options.prompt,
        taskType: options.type ?? 'custom',
        mode,
        budget_usd: options.budget_usd,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.db.update('tasks', {
        status: 'failed',
        result: JSON.stringify({ error: `Forge design failed: ${errMsg}`, phase: 'forge' }),
        updated_at: now(),
      }, { id: taskId });
      this.cleanup(taskId);
      throw err;
    }
    this.workingMemories.set(taskId, {
      ...this.workingMemories.get(taskId)!,
      teamDesign,
    });
    this.eventBus.emit({
      type: 'forge:designed',
      payload: { taskId, designId: teamDesign.id, topology: teamDesign.topology },
      source: 'orchestrator',
      taskId,
    });
    this.durability.checkpoint(
      taskId,
      'forge',
      this.buildDurableState(taskId, 'forge', options, teamDesign, null, [], 0),
    );
    this.emitStep(taskId, 'forge', 'completed');

    // STEP 4: Simulation (optional)
    const shouldSimulate =
      options.simulate === true || gates.simulationEnabled;
    if (shouldSimulate) {
      steeringAction = await this.handleSteering(taskId);
      if (steeringAction === 'cancel') {
        return this.buildCancelledResult(taskId, startTime, options, teamDesign, mode);
      }
      if (steeringAction === 'redirect') { return this.run(this.handleRedirect(taskId, options)); }
      this.updateStatus(taskId, { phase: 'simulate', progress: 35 });
      this.emitStep(taskId, 'simulate', 'started');
      const simResult = await this.simulationEngine.simulate(
        teamDesign,
        options,
      );
      this.eventBus.emit({
        type: 'simulation:completed',
        payload: { taskId, verdict: simResult.verdict },
        source: 'orchestrator',
        taskId,
      });
      this.durability.checkpoint(
        taskId,
        'simulate',
        this.buildDurableState(
          taskId, 'simulate', options, teamDesign, null, [], 0,
        ),
      );
      this.emitStep(taskId, 'simulate', 'completed');
    }

    // STEP 5: Security validation
    steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, teamDesign, mode);
    }
    if (steeringAction === 'redirect') { return this.run(this.handleRedirect(taskId, options)); }
    this.emitStep(taskId, 'security', 'started');
    const securityAction: SecurityAction = {
      type: 'skill_load',
      details: { prompt: options.prompt, topology: teamDesign.topology },
      taskId,
    };
    const secDecision = await this.securityEngine.evaluate(securityAction);
    this.eventBus.emit({
      type: 'security:policy_evaluated',
      payload: { taskId, allowed: secDecision.allowed },
      source: 'orchestrator',
      taskId,
    });
    if (!secDecision.allowed) {
      this.eventBus.emit({
        type: 'security:violation',
        payload: { taskId, reason: secDecision.reason },
        source: 'orchestrator',
        taskId,
      });
      this.db.update('tasks', { status: 'failed', updated_at: now() }, { id: taskId });
      const failedResult = this.buildTaskResult(
        taskId, 'failed', `Security violation: ${secDecision.reason}`,
        [], teamDesign, [], Date.now() - startTime, mode, 0, memoryContext.totalFound,
      );
      this.cleanup(taskId);
      return failedResult;
    }
    this.durability.checkpoint(
      taskId,
      'security',
      this.buildDurableState(taskId, 'security', options, teamDesign, null, [], 0),
    );
    this.emitStep(taskId, 'security', 'completed');

    // STEP 6: Swarm running
    steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, teamDesign, mode);
    }
    if (steeringAction === 'redirect') { return this.run(this.handleRedirect(taskId, options)); }
    this.updateStatus(taskId, { phase: 'run', progress: 50 });
    this.emitStep(taskId, 'run', 'started');
    // swarm:started is emitted by SwarmEngine itself (M-17: removed duplicate)

    // G-07: Swarm execution with degradation retry loop
    let swarmResult: OrchestratorSwarmResult;
    let currentDesignForSwarm = teamDesign;
    let degradationAttempts = 0;
    let lastSwarmError: unknown;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        swarmResult = await this.swarmEngine.run(currentDesignForSwarm, { ...options, taskId });
        this.degradationEngine.recordSuccess(currentDesignForSwarm.topology);
        break; // Success — exit the retry loop
      } catch (err) {
        lastSwarmError = err;
        this.degradationEngine.recordFailure(currentDesignForSwarm.topology);

        // Consult degradation engine for a simpler topology
        const failureCount = (this.degradationEngine.getFailureCounts().get(currentDesignForSwarm.topology) ?? 0);
        const recommendation = this.degradationEngine.suggestDegradation(
          currentDesignForSwarm.topology,
          failureCount,
        );

        const isHumanRequired = recommendation.tier.name === 'human_in_loop';
        const isExhausted = degradationAttempts >= MAX_DEGRADATION_ATTEMPTS;

        if (!recommendation.changed || isHumanRequired || isExhausted) {
          // No further degradation possible — fail the task
          const errMsg = err instanceof Error ? err.message : String(err);
          this.db.update('tasks', {
            status: 'failed',
            result: JSON.stringify({ error: `Swarm execution failed: ${errMsg}`, phase: 'run' }),
            updated_at: now(),
          }, { id: taskId });
          this.cleanup(taskId);
          throw err;
        }

        degradationAttempts++;

        // Pick a simpler topology from the recommended tier
        const suggestedTopology = recommendation.tier.allowedTopologies[0] ?? 'single';
        this.logger.warn({
          taskId,
          originalTopology: currentDesignForSwarm.topology,
          suggestedTopology,
          tier: recommendation.tier.name,
          attempt: degradationAttempts,
        }, 'Degrading topology after swarm failure');

        this.eventBus.emit({
          type: 'degradation:tier_changed',
          payload: {
            taskId,
            previousTopology: currentDesignForSwarm.topology,
            newTopology: suggestedTopology,
            tier: recommendation.tier.name,
            attempt: degradationAttempts,
          },
          source: 'orchestrator',
          taskId,
        });

        // PA1-MEDIUM: Add delay between degradation retry attempts to avoid thundering herd
        await new Promise(resolve => setTimeout(resolve, 1000 * degradationAttempts));

        // Create a degraded design with the simpler topology
        currentDesignForSwarm = {
          ...currentDesignForSwarm,
          topology: suggestedTopology,
        };
        // Update the main teamDesign reference so downstream steps use the degraded version
        teamDesign = currentDesignForSwarm;
      }
    }

    const agentIds = swarmResult.agentResults.map((a) => a.agentId);
    this.updateStatus(taskId, { currentAgents: agentIds });

    // Persist per-agent output to DB
    for (const ar of swarmResult.agentResults) {
      try {
        this.db.update('agents', { output: ar.output, status: ar.status }, { id: ar.agentId });
      } catch {
        // Agent may not be registered yet in DB, non-critical
      }
    }
    // swarm:completed is emitted by SwarmEngine itself (M-17: removed duplicate)

    const midBudget = this.budgetChecker.check(taskId, 0);
    if (midBudget.warning) {
      this.eventBus.emit({
        type: 'cost:budget_warning',
        payload: { taskId, message: midBudget.message },
        source: 'orchestrator',
        taskId,
      });
    }
    this.durability.checkpoint(
      taskId,
      'run',
      this.buildDurableState(
        taskId, 'run', options, teamDesign, swarmResult, [], 0,
      ),
    );

    // G-13: Memory pressure check after swarm execution checkpoint
    const memCheck = this.heartbeatManager.checkMemoryPressure();
    if (memCheck.warning) {
      this.logger.warn({ taskId, heapUsedMb: memCheck.heapUsedMb }, 'Memory pressure high after swarm execution');
    }

    this.emitStep(taskId, 'run', 'completed');

    // STEP 7: Judge assessment
    steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, teamDesign, mode);
    }
    if (steeringAction === 'redirect') { return this.run(this.handleRedirect(taskId, options)); }
    this.updateStatus(taskId, { phase: 'judge', progress: 75 });
    this.emitStep(taskId, 'judge', 'started');

    const artifacts = this.extractArtifacts(swarmResult);
    // G-08: Resolve judge profile — user override > Forge-designed > task-type auto
    // PA1-HIGH: Use full Forge-designed criteria when available, not just strictness string
    const resolvedJudgeProfile = options.profile
      ?? (teamDesign.judgeProfile?.criteria && teamDesign.judgeProfile.criteria.length > 0
        ? `forge:${teamDesign.judgeProfile.strictness}:${teamDesign.judgeProfile.criteria.map(c => `${c.name}=${c.weight}`).join(',')}`
        : teamDesign.judgeProfile?.strictness)
      ?? teamDesign.taskType
      ?? 'default';
    let judgeResult = await this.judgePipeline.evaluate({
      taskId,
      prompt: options.prompt,
      output: swarmResult.aggregatedOutput,
      artifacts,
      round: 1,
      profile: resolvedJudgeProfile,
    });
    const allJudgeResults: OrchestratorJudgeResult[] = [judgeResult];

    this.eventBus.emit({
      type: 'judge:verdict',
      payload: { taskId, decision: judgeResult.consensus.decision },
      source: 'orchestrator',
      taskId,
    });

    // H-05: Wire judge verdict to POMDP belief update so routing evolves.
    // Map consensus decision to POMDP observation: approve→good, revise→fair, reject→poor.
    const pomdpObservation: 'good' | 'fair' | 'poor' =
      judgeResult.consensus.decision === 'approve' ? 'good'
        : judgeResult.consensus.decision === 'revise' ? 'fair'
        : 'poor';
    this.modelRouter.updatePomdpBelief(pomdpObservation);

    this.durability.checkpoint(
      taskId,
      'judge',
      this.buildDurableState(
        taskId, 'judge', options, teamDesign, swarmResult,
        judgeResult.verdicts as unknown as JudgeVerdict[], redesignCount,
      ),
    );
    this.emitStep(taskId, 'judge', 'completed');

    // STEP 8: Redesign loop
    while (
      judgeResult.consensus.decision === 'reject' ||
      judgeResult.consensus.decision === 'revise'
    ) {
      redesignCount++;
      if (redesignCount >= MAX_REDESIGNS) {
        this.eventBus.emit({
          type: 'steering:cancelled',
          payload: { taskId, reason: 'max_redesigns_exceeded' },
          source: 'orchestrator',
          taskId,
        });
        // C-11: Emit human escalation event and update task status
        this.eventBus.emit({
          type: 'steering:human_escalation_required',
          payload: { taskId, redesignCount, reason: 'max_redesigns_exceeded' },
          source: 'orchestrator',
          taskId,
        });
        this.db.update('tasks', { status: 'pending_human_review', updated_at: now() }, { id: taskId });
        this.logger.error(
          { taskId, redesignCount },
          'Max redesigns reached, escalating to human',
        );
        break;
      }

      // H-10: Budget cap per redesign cycle (3x original budget)
      const originalBudget = options.budget_usd ?? DEFAULT_BUDGET_USD;
      const redesignBudgetCap = originalBudget * 3;
      const cumulativeCost = this.costTracker.getTaskCost(taskId);
      if (cumulativeCost > redesignBudgetCap) {
        this.eventBus.emit({
          type: 'cost:budget_exceeded',
          payload: { taskId, cumulativeCost, budgetCap: redesignBudgetCap, reason: 'redesign_budget_cap' },
          source: 'orchestrator',
          taskId,
        });
        this.logger.warn(
          { taskId, cumulativeCost, budgetCap: redesignBudgetCap },
          'Redesign budget cap (3x original) exceeded, stopping redesign loop',
        );
        break;
      }

      this.eventBus.emit({
        type: 'forge:redesigning',
        payload: { taskId, redesignCount },
        source: 'orchestrator',
        taskId,
      });

      teamDesign = await this.forge.redesign({
        taskId,
        prompt: options.prompt,
        taskType: options.type ?? 'custom',
        mode,
        budget_usd: options.budget_usd,
        previousDesign: teamDesign,
        judgeResult,
        redesignCount,
      });

      this.eventBus.emit({
        type: 'forge:designed',
        payload: { taskId, designId: teamDesign.id, redesign: true },
        source: 'orchestrator',
        taskId,
      });

      // Repeat security -> swarm -> judge
      const secDecision2 = await this.securityEngine.evaluate(securityAction);
      if (!secDecision2.allowed) {
        break;
      }

      // Redesign swarm with single degradation retry (same pattern as main run)
      try {
        swarmResult = await this.swarmEngine.run(teamDesign, options);
      } catch (redesignSwarmErr) {
        this.logger.warn({ taskId, err: redesignSwarmErr }, 'Redesign swarm failed, retrying with delay');
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          swarmResult = await this.swarmEngine.run(teamDesign, options);
        } catch (retryErr) {
          this.logger.error({ taskId, err: retryErr }, 'Redesign swarm retry also failed');
          throw retryErr;
        }
      }

      // G-08: Use resolved profile in redesign loop too
      // PA1-HIGH: Use full Forge-designed criteria when available
      const redesignJudgeProfile = options.profile
        ?? (teamDesign.judgeProfile?.criteria && teamDesign.judgeProfile.criteria.length > 0
          ? `forge:${teamDesign.judgeProfile.strictness}:${teamDesign.judgeProfile.criteria.map(c => `${c.name}=${c.weight}`).join(',')}`
          : teamDesign.judgeProfile?.strictness)
        ?? teamDesign.taskType
        ?? 'default';
      judgeResult = await this.judgePipeline.evaluate({
        taskId,
        prompt: options.prompt,
        output: swarmResult.aggregatedOutput,
        artifacts: this.extractArtifacts(swarmResult),
        round: redesignCount + 1,
        profile: redesignJudgeProfile,
      });
      allJudgeResults.push(judgeResult);

      this.durability.checkpoint(
        taskId,
        'judge',
        this.buildDurableState(
          taskId, 'judge', options, teamDesign, swarmResult,
          judgeResult.verdicts as unknown as JudgeVerdict[], redesignCount,
        ),
      );
    }
    this.updateStatus(taskId, { redesignCount });

    // STEP 9: Strategy scoring (record outcome for strategy selection learning)
    this.emitStep(taskId, 'rl', 'started');
    try {
      this.strategyScorer.recordOutcome({
        taskId,
        taskType: options.type ?? 'custom',
        strategy: teamDesign.topology,
        teamDesignId: teamDesign.id,
        judgeScore: judgeResult.consensus.confidence,
        costUsd: this.costTracker.getTaskCost(taskId),
        durationMs: Date.now() - startTime,
        approved: judgeResult.consensus.decision === 'approve',
        redesignCount,
      });
    } catch (err) {
      this.logger.warn({ taskId, err }, 'Strategy scoring failed');
    }
    this.eventBus.emit({
      type: 'rl:reward_recorded',
      payload: { taskId, reward: judgeResult.consensus.confidence },
      source: 'orchestrator',
      taskId,
    });
    this.emitStep(taskId, 'rl', 'completed');

    // STEP 10: Behavior capture
    this.emitStep(taskId, 'behavior', 'started');
    for (const agentResult of swarmResult.agentResults) {
      try {
        this.slmLite.captureBehavior(agentResult.agentId, {
          agentId: agentResult.agentId,
          taskId,
          toolSelections: [],
          successPatterns: agentResult.status === 'completed' ? ['completed'] : [],
          timestamp: now(),
        });
      } catch {
        // Non-critical: continue
      }
    }
    this.eventBus.emit({
      type: 'memory:behavior_captured',
      payload: { taskId, agentCount: swarmResult.agentResults.length },
      source: 'orchestrator',
      taskId,
    });
    this.emitStep(taskId, 'behavior', 'completed');

    // STEP 11: Output formatting
    steeringAction = await this.handleSteering(taskId);
    if (steeringAction === 'cancel') {
      return this.buildCancelledResult(taskId, startTime, options, teamDesign, mode);
    }
    if (steeringAction === 'redirect') { return this.run(this.handleRedirect(taskId, options)); }
    this.updateStatus(taskId, { phase: 'output', progress: 90 });
    this.emitStep(taskId, 'output', 'started');

    const allVerdicts: JudgeVerdict[] = allJudgeResults.flatMap(
      (r) => [...r.verdicts] as unknown as JudgeVerdict[],
    );

    const finalStatus =
      redesignCount >= MAX_REDESIGNS ? 'failed' : 'completed';
    const taskResult = this.buildTaskResult(
      taskId, finalStatus as 'completed' | 'failed',
      swarmResult.aggregatedOutput, artifacts, teamDesign,
      allVerdicts, Date.now() - startTime, mode, redesignCount,
      memoryContext.totalFound,
    );

    this.outputEngine.format(taskResult, 'json');
    this.eventBus.emit({
      type: 'output:formatted',
      payload: { taskId },
      source: 'orchestrator',
      taskId,
    });
    this.eventBus.emit({
      type: 'output:delivered',
      payload: { taskId },
      source: 'orchestrator',
      taskId,
    });
    this.durability.checkpoint(
      taskId,
      'output',
      this.buildDurableState(
        taskId, 'output', options, teamDesign, swarmResult,
        allVerdicts, redesignCount,
      ),
    );
    this.emitStep(taskId, 'output', 'completed');

    // STEP 12: Finalize
    this.db.update(
      'tasks',
      {
        status: finalStatus,
        result: JSON.stringify(taskResult),
        cost_usd: taskResult.cost.total_usd,
        updated_at: now(),
      },
      { id: taskId },
    );
    this.eventBus.emit({
      type: finalStatus === 'completed' ? 'task:completed' : 'task:failed',
      payload: { taskId, status: finalStatus, cost: taskResult.cost.total_usd },
      source: 'orchestrator',
      taskId,
    });
    this.durability.clearCheckpoints(taskId);

    // STEP 12b: Save output to working directory (if specified)
    if (options.workingDir) {
      try {
        await writeOutputToDisk(options.workingDir, taskId, taskResult);
        this.eventBus.emit({
          type: 'output:saved_to_disk',
          payload: { taskId, workingDir: options.workingDir },
          source: 'orchestrator',
          taskId,
        });
      } catch (err) {
        this.logger.warn({ taskId, err }, 'Failed to save output to disk');
      }
    }

    this.cleanup(taskId);

    return taskResult;

    } catch (err) {
      // SCN-002 Fix: Ensure ANY unhandled error marks the task as 'failed' in DB.
      // Without this, the getStatus() DB fallback would report stale status.
      const errMsg = err instanceof Error ? err.message : String(err);
      try {
        this.db.update('tasks', {
          status: 'failed',
          result: JSON.stringify({ error: errMsg, phase: 'unknown' }),
          updated_at: now(),
        }, { id: taskId });
      } catch {
        // DB update itself failed — log but don't mask the original error
        this.logger.error({ taskId }, 'Failed to update task status to failed in DB');
      }
      this.cleanup(taskId);
      throw err;
    }
  }

  async pause(taskId: string): Promise<void> {
    if (!this.activeStatuses.has(taskId)) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    this.steering.requestPause(taskId);
  }

  async resume(taskId: string): Promise<void> {
    if (!this.activeStatuses.has(taskId)) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    this.steering.requestResume(taskId);
  }

  async redirect(taskId: string, newPrompt: string): Promise<void> {
    if (!this.activeStatuses.has(taskId)) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    this.steering.requestRedirect(taskId, newPrompt);
  }

  async cancel(taskId: string): Promise<void> {
    if (!this.activeStatuses.has(taskId)) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    this.steering.requestCancel(taskId);
  }

  getStatus(taskId: string): TaskStatus {
    const active = this.activeStatuses.get(taskId);
    if (active) {
      return active;
    }

    const row = this.db.get<{
      id: string;
      status: string;
      mode: string;
      cost_usd: number;
      created_at: string;
    }>('SELECT id, status, mode, cost_usd, created_at FROM tasks WHERE id = ?', [taskId]);

    if (!row) {
      throw new Error(`Unknown task: ${taskId}`);
    }

    // SCN-002 Fix: Check actual status column instead of hardcoding success.
    // Failed/cancelled tasks were previously reported as phase:'output', progress:100.
    const isFailed = row.status === 'failed';
    const isCancelled = row.status === 'cancelled';
    const isPending = row.status === 'pending' || row.status === 'running' || row.status === 'pending_human_review';

    return {
      taskId: row.id,
      phase: isFailed ? 'failed'
        : isCancelled ? 'output'
        : isPending ? 'run'
        : 'output',
      progress: isFailed ? 0
        : isCancelled ? 0
        : isPending ? 50
        : 100,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: row.cost_usd ?? 0,
      startedAt: row.created_at,
    };
  }

  async recoverIncompleteTasks(): Promise<void> {
    // G-13: Also detect stale tasks via heartbeat
    const staleTasks = this.heartbeatManager.getStaleTaskIds();
    for (const staleId of staleTasks) {
      this.logger.warn({ taskId: staleId }, 'Detected stale task via heartbeat, marking for recovery');
      this.db.update('tasks', { status: 'pending', updated_at: now() }, { id: staleId });
    }

    const taskIds = this.durability.getIncompleteTaskIds();
    for (const taskId of taskIds) {
      const checkpoint = this.durability.getLastCheckpoint(taskId);
      if (!checkpoint) {
        this.db.update('tasks', { status: 'failed', updated_at: now() }, { id: taskId });
        this.logger.info({ taskId }, 'No checkpoint found, marking as failed');
        continue;
      }

      // Restore working memory from checkpoint
      this.workingMemories.set(taskId, checkpoint.workingMemory);
      this.eventBus.emit({
        type: 'checkpoint:restored',
        payload: { taskId, step: checkpoint.step },
        source: 'orchestrator',
        taskId,
      });
      this.logger.info(
        { taskId, step: checkpoint.step },
        `Recovered task from step ${checkpoint.step}, re-executing pipeline`,
      );

      // C-08: Re-execute pipeline from checkpoint
      // Reconstruct TaskOptions from checkpoint state and re-run
      const taskRow = this.db.get<{ prompt: string; type: string; mode: string }>(
        'SELECT prompt, type, mode FROM tasks WHERE id = ?',
        [taskId],
      );
      if (taskRow) {
        this.run({
          prompt: taskRow.prompt,
          type: taskRow.type as TaskOptions['type'],
          mode: taskRow.mode as TaskOptions['mode'],
          taskId,
        }).catch((err) => {
          this.logger.error({ taskId, err }, 'Recovery re-execution failed');
          this.db.update('tasks', { status: 'failed', updated_at: now() }, { id: taskId });
        });
      }
    }
  }

  private async handleSteering(taskId: string): Promise<'continue' | 'cancel' | 'redirect'> {
    const PAUSE_POLL_INITIAL_MS = 100;
    const PAUSE_POLL_MAX_MS = 5_000; // M-14: Cap backoff at 5s to reduce GC pressure on long pauses
    const PAUSE_MAX_WAIT_MS = 3_600_000; // 1 hour

    let state = this.steering.getState(taskId);

    // C-06: Block on pause/pausing with polling loop
    // M-14: Exponential backoff (100ms -> 200ms -> 400ms -> ... -> 5000ms max)
    if (state === 'pausing' || state === 'paused') {
      const pauseStart = Date.now();
      let pollInterval = PAUSE_POLL_INITIAL_MS;
      while (state === 'pausing' || state === 'paused') {
        if (Date.now() - pauseStart > PAUSE_MAX_WAIT_MS) {
          this.logger.warn({ taskId }, 'Pause timeout exceeded (1hr), resuming');
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        pollInterval = Math.min(pollInterval * 2, PAUSE_POLL_MAX_MS);
        state = this.steering.getState(taskId);
      }
    }

    switch (state) {
      case 'cancelling':
      case 'cancelled':
        return 'cancel';
      case 'redirecting': {
        const payload = this.steering.getRedirectPayload(taskId);
        this.steering.clearRedirectPayload(taskId);
        return payload ? 'redirect' : 'continue';
      }
      default:
        return 'continue';
    }
  }

  // C-07: Handle redirect by restarting pipeline with new prompt
  // H-10 FIX: Enforce redirect depth limit to prevent infinite loops → stack overflow
  private handleRedirect(taskId: string, options: TaskOptions): TaskOptions {
    const currentDepth = this.redirectCounts.get(taskId) ?? 0;
    if (currentDepth >= MAX_REDIRECT_DEPTH) {
      throw new Error(
        `Maximum redirect depth exceeded (${MAX_REDIRECT_DEPTH}). ` +
        `Task ${taskId} has been redirected too many times. ` +
        'This may indicate a circular redirect loop.',
      );
    }
    this.redirectCounts.set(taskId, currentDepth + 1);
    const payload = this.steering.getRedirectPayload(taskId);
    this.steering.clearRedirectPayload(taskId);
    const newPrompt = payload?.newPrompt ?? options.prompt;
    this.logger.info({ taskId, redirectDepth: currentDepth + 1, newPrompt: newPrompt.slice(0, 100) }, 'Redirect: restarting pipeline');
    return { ...options, prompt: newPrompt, taskId };
  }

  private buildDurableState(
    taskId: string, step: string, options: TaskOptions,
    teamDesign: TeamDesign | null, swarmResult: OrchestratorSwarmResult | null,
    judgeResults: readonly JudgeVerdict[], redesignCount: number,
  ): DurableState {
    return buildDurableStateHelper(
      taskId, step, options, teamDesign, swarmResult, judgeResults, redesignCount,
      this.costTracker.getTaskCost(taskId), this.workingMemories.get(taskId) ?? {},
    );
  }

  private extractArtifacts(swarmResult: OrchestratorSwarmResult): Artifact[] {
    return extractArtifactsHelper(swarmResult);
  }

  private buildTaskResult(
    taskId: string, status: 'completed' | 'failed' | 'cancelled', output: string,
    artifacts: readonly Artifact[], teamDesign: TeamDesign | null,
    judges: readonly JudgeVerdict[], durationMs: number, mode: QosMode,
    redesignCount: number, memoryEntriesUsed: number,
  ): TaskResult {
    return buildTaskResultHelper(
      taskId, status, output, artifacts, teamDesign, judges, durationMs,
      mode, redesignCount, memoryEntriesUsed, this.costTracker.getSummary(taskId),
    );
  }

  private buildCancelledResult(
    taskId: string,
    startTime: number,
    options: TaskOptions,
    teamDesign: TeamDesign | null,
    mode: QosMode,
  ): TaskResult {
    const result = this.buildTaskResult(
      taskId, 'cancelled', 'Task was cancelled', [],
      teamDesign, [], Date.now() - startTime, mode, 0, 0,
    );
    this.db.update(
      'tasks',
      { status: 'cancelled', result: JSON.stringify(result), updated_at: now() },
      { id: taskId },
    );
    this.eventBus.emit({
      type: 'task:cancelled',
      payload: { taskId },
      source: 'orchestrator',
      taskId,
    });
    this.cleanup(taskId);
    return result;
  }

  private cleanup(taskId: string): void {
    // G-13: Always stop heartbeat on task completion/failure/cancellation
    this.heartbeatManager.stop(taskId);
    this.workingMemories.delete(taskId);
    this.steering.deregisterTask(taskId);
    this.activeStatuses.delete(taskId);
    this.redirectCounts.delete(taskId); // H-10 FIX: Clean up redirect depth tracking
  }
  private updateStatus(
    taskId: string,
    updates: Partial<TaskStatus>,
  ): void {
    const current = this.activeStatuses.get(taskId);
    if (current) {
      this.activeStatuses.set(taskId, { ...current, ...updates });
    }
  }

  private emitStep(
    taskId: string,
    step: string,
    phase: 'started' | 'completed',
  ): void {
    this.eventBus.emit({
      type: phase === 'started'
        ? 'orchestrator:step_started'
        : 'orchestrator:step_completed',
      payload: { taskId, step },
      source: 'orchestrator',
      taskId,
    });
  }
}
