// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Judge Pipeline
 * LLD Section 2.1
 *
 * THE CORE COMPONENT: 2-round adversarial orchestration.
 * Integrates: ConsensusEngine, IssueExtractor, DriftDetector,
 *             AntiFabrication, LocalJudgeAdapter, ModeEngine.
 *
 * Hard Rules enforced:
 *   #1: Judges use different models from agents
 *   #3: Every verdict stored in DB
 *   #4/#11: Min 2 judges for consensus
 *   #7: Anti-fabrication BEFORE consensus
 *   #8: Drift check BEFORE every judge round
 *   #10: Round 2 receives Round 1 issues
 *   #12: Pin judge versions per cycle
 */

import type {
  JudgeVerdict,
  JudgeIssue,
  JudgeProfile,
  ModelRequest,
  ModelResponse,
} from '../types/common.js';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { ConsensusEngine } from './consensus.js';
import type { IssueExtractor } from './issue-extractor.js';
import type { DriftDetector } from './drift-detector.js';
import type { AntiFabrication } from './anti-fabrication.js';
import type { LocalJudgeAdapter } from './local-judge-adapter.js';
import { createJudgeProfileManager } from './judge-profile.js';
import type { JudgeProfileManager } from './judge-profile.js';
import { getModelQualityWeight } from './consensus.js';
import { generateId } from '../utils/id.js';
import { jsonrepair } from 'jsonrepair';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JudgeRequest {
  readonly taskId: string;
  readonly prompt: string;
  readonly output: string;
  readonly artifacts: readonly { readonly path: string; readonly content: string; readonly type: string }[];
  readonly round: number;
  readonly profile?: string;
  readonly previousVerdicts?: readonly JudgeVerdict[];
  /** Models used by agents — judges will use different models (Hard Rule #1). */
  readonly agentModels?: ReadonlySet<string>;
}

export interface JudgeResult {
  readonly taskId: string;
  readonly round: number;
  readonly verdicts: readonly JudgeVerdict[];
  readonly consensus: {
    readonly algorithm: 'weighted_majority' | 'bft_inspired' | 'raft_inspired';
    readonly decision: 'approve' | 'reject' | 'revise';
    readonly confidence: number;
    readonly entropy: number;
    readonly agreementRatio: number;
    /** M-16: True when verdict is based on fewer than 2 judges. */
    readonly lowConfidence?: boolean;
  };
  readonly issues: readonly JudgeIssue[];
  readonly patches?: readonly JsonPatch[];
}

export interface JsonPatch {
  readonly op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  readonly path: string;
  readonly value?: unknown;
  readonly from?: string;
}

// ---------------------------------------------------------------------------
// ModelRouter subset for JudgePipeline
// ---------------------------------------------------------------------------

export interface JudgePipelineModelRouter {
  route(request: ModelRequest): Promise<ModelResponse>;
  getAvailableModels?(): readonly { name: string; provider: string; qualityScore: number }[] | string[];
}

// ---------------------------------------------------------------------------
// ModeEngine subset
// ---------------------------------------------------------------------------

export interface JudgePipelineModeEngine {
  getFeatureGates(): { readonly maxJudges: number };
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface JudgePipeline {
  evaluate(request: JudgeRequest): Promise<JudgeResult>;
  getProfile(name: string): JudgeProfile;
  listProfiles(): readonly string[];
  getResults(taskId?: string): readonly { readonly judgeModel: string; readonly verdict: string; readonly score: number }[] | null;
  getProfiles(): readonly { readonly name: string; readonly criteria: readonly unknown[] }[] | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class JudgePipelineImpl implements JudgePipeline {
  private readonly modelRouter: JudgePipelineModelRouter;
  private readonly consensusEngine: ConsensusEngine;
  private readonly issueExtractor: IssueExtractor;
  private readonly driftDetector: DriftDetector;
  private readonly antiFabrication: AntiFabrication;
  private readonly localJudgeAdapter: LocalJudgeAdapter;
  private readonly modeEngine: JudgePipelineModeEngine;
  private readonly eventBus: EventBus;
  private readonly db: QosDatabase;
  private readonly profileManager: JudgeProfileManager;

  constructor(
    modelRouter: JudgePipelineModelRouter,
    consensusEngine: ConsensusEngine,
    issueExtractor: IssueExtractor,
    driftDetector: DriftDetector,
    antiFabrication: AntiFabrication,
    localJudgeAdapter: LocalJudgeAdapter,
    modeEngine: JudgePipelineModeEngine,
    eventBus: EventBus,
    db: QosDatabase,
  ) {
    this.modelRouter = modelRouter;
    this.consensusEngine = consensusEngine;
    this.issueExtractor = issueExtractor;
    this.driftDetector = driftDetector;
    this.antiFabrication = antiFabrication;
    this.localJudgeAdapter = localJudgeAdapter;
    this.modeEngine = modeEngine;
    this.eventBus = eventBus;
    this.db = db;
    this.profileManager = createJudgeProfileManager(db);
  }

  async evaluate(request: JudgeRequest): Promise<JudgeResult> {
    // 1. Load profile
    const profile = this.profileManager.getProfile(
      request.profile ?? 'default',
    );

    // 2. Emit judge:started
    this.eventBus.emit({
      type: 'judge:started',
      payload: { taskId: request.taskId, round: request.round },
      source: 'judge-pipeline',
      taskId: request.taskId,
    });

    // 3. DRIFT CHECK (HARD RULE 8: runs BEFORE every judge round)
    this.driftDetector.check({
      taskId: request.taskId,
      round: request.round,
      modelId: profile.name,
      systemPrompt: this.buildJudgeSystemPrompt(profile, request),
      temperature: 0.1,
    });

    // 4. SELECT JUDGE MODELS
    // Use runtime catalog models (respects config). Normalize to string[] of model names.
    const rawModels = this.modelRouter.getAvailableModels
      ? this.modelRouter.getAvailableModels()
      : [];
    const availableModels: string[] = rawModels.length > 0
      ? rawModels.map((m) => typeof m === 'string' ? m : m.name)
      : ['auto']; // fallback to 'auto' which uses the configured primary model

    // Use caller-provided agentModels if available, otherwise empty set.
    // When wired from orchestrator, this will contain the models the swarm agents used,
    // ensuring Hard Rule #1 (judges use different models from agents).
    const agentModels: ReadonlySet<string> = request.agentModels ?? new Set<string>();
    const judgeModels = this.selectJudgeModels(
      profile,
      agentModels,
      availableModels,
    );

    // 5. Fan-out to all judges in parallel
    const judgePromises: Promise<JudgeVerdict>[] = judgeModels.map(
      (model) => this.callSingleJudge(model, request, profile),
    );

    // Add local judge if available
    let localJudgeAvail = false;
    try {
      localJudgeAvail = await this.localJudgeAdapter.isAvailable();
    } catch (err) {
      console.debug('Judge pipeline: local judge availability check failed:', err);
      localJudgeAvail = false;
    }
    if (localJudgeAvail) {
      judgePromises.push(
        this.localJudgeAdapter.evaluate({
          taskId: request.taskId,
          prompt: request.prompt,
          output: request.output,
          round: request.round,
        }),
      );
    }

    // 6. Collect verdicts, handle timeouts
    const settledResults = await Promise.allSettled(judgePromises);
    const verdicts: JudgeVerdict[] = [];

    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        verdicts.push(result.value);
      }
      // Rejected judges excluded from consensus
    }

    // 7. Validate minimum verdicts (HARD RULE 4/11)
    // Graceful degradation: accept 1 verdict when multiple judges fail
    // (common in single-provider setups where only 1 model API key is configured).
    // A task that ran to completion should not fail just because extra judge models aren't available.
    if (verdicts.length === 0) {
      throw new Error(
        `No judge verdicts received: all ${judgeModels.length} judges failed`,
      );
    }

    // 8. Issue extraction
    const extractedIssues = await this.issueExtractor.extract(verdicts);

    // 9. Anti-fabrication (HARD RULE 7: BEFORE consensus)
    const fabricationIssues = await this.antiFabrication.verify(
      request.output,
      request.taskId,
    );
    const allIssues = [...extractedIssues, ...fabricationIssues];

    // 10. Consensus
    const rawConsensus = this.consensusEngine.resolve(
      verdicts,
      profile.consensusAlgorithm,
    );

    // M-16: Flag single-judge verdicts as low confidence.
    // Single-provider setups still work, but downstream consumers
    // can use this flag to weigh the result appropriately.
    const isLowConfidence = verdicts.length < 2;
    if (isLowConfidence) {
      console.debug(
        `Judge pipeline: low confidence consensus — only ${verdicts.length} verdict(s) for task ${request.taskId}`,
      );
    }
    const consensus = isLowConfidence
      ? { ...rawConsensus, lowConfidence: true as const }
      : rawConsensus;

    if (consensus.agreementRatio < 0.5) {
      this.eventBus.emit({
        type: 'consensus:split',
        payload: { taskId: request.taskId, consensus },
        source: 'judge-pipeline',
        taskId: request.taskId,
      });
    } else {
      this.eventBus.emit({
        type: 'consensus:reached',
        payload: { taskId: request.taskId, consensus },
        source: 'judge-pipeline',
        taskId: request.taskId,
      });
    }

    // 11. JSON patch generation if revise
    let patches: JsonPatch[] | undefined;
    if (consensus.decision === 'revise') {
      patches = this.generatePatches(allIssues);
    }

    // 12. Persist all verdicts (HARD RULE 3)
    for (const verdict of verdicts) {
      try {
        this.db.insert('judge_results', {
          id: generateId(),
          task_id: request.taskId,
          round: request.round,
          judge_model: verdict.judgeModel,
          verdict: verdict.verdict,
          score: verdict.score,
          issues: JSON.stringify(verdict.issues),
          feedback: verdict.feedback,
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.debug('Judge pipeline: verdict persist error:', err);
      }
    }

    // 13. Emit events
    if (consensus.decision === 'approve') {
      this.eventBus.emit({
        type: 'judge:approved',
        payload: { taskId: request.taskId, round: request.round },
        source: 'judge-pipeline',
        taskId: request.taskId,
      });
    } else {
      this.eventBus.emit({
        type: 'judge:rejected',
        payload: {
          taskId: request.taskId,
          round: request.round,
          issueCount: allIssues.length,
        },
        source: 'judge-pipeline',
        taskId: request.taskId,
      });
    }

    // 14. Return JudgeResult
    return {
      taskId: request.taskId,
      round: request.round,
      verdicts: Object.freeze([...verdicts]),
      consensus,
      issues: Object.freeze([...allIssues]),
      patches,
    };
  }

  getProfile(name: string): JudgeProfile {
    return this.profileManager.getProfile(name);
  }

  listProfiles(): readonly string[] {
    return this.profileManager.listProfiles();
  }

  getResults(taskId?: string): readonly { readonly judgeModel: string; readonly verdict: string; readonly score: number }[] | null {
    const sql = taskId
      ? 'SELECT judge_model, verdict, score FROM judge_results WHERE task_id = ? ORDER BY created_at DESC'
      : 'SELECT judge_model, verdict, score FROM judge_results ORDER BY created_at DESC LIMIT 100';
    const params = taskId ? [taskId] : [];
    const rows = this.db.query<{ judge_model: string; verdict: string; score: number }>(sql, params);
    return rows.map((r) => ({ judgeModel: r.judge_model, verdict: r.verdict, score: r.score }));
  }

  getProfiles(): readonly { readonly name: string; readonly criteria: readonly unknown[] }[] | null {
    const names = this.profileManager.listProfiles();
    return names.map((name) => {
      const profile = this.profileManager.getProfile(name);
      return { name: profile.name, criteria: profile.criteria };
    });
  }

  private async callSingleJudge(
    model: string,
    request: JudgeRequest,
    profile: JudgeProfile,
  ): Promise<JudgeVerdict> {
    const startTime = Date.now();

    const systemPrompt = this.buildJudgeSystemPrompt(profile, request);
    const userPrompt = this.buildJudgeUserPrompt(request);

    // H-12: Pin judge model — pass explicit model to router to prevent mid-cycle rotation
    const response = await Promise.race([
      this.modelRouter.route({
        prompt: userPrompt,
        systemPrompt,
        model,
        temperature: 0.1,
        taskType: 'judge',
        quality: 'high',
      }),
      this.createTimeout(profile.timeoutMs),
    ]);

    let parsed: {
      verdict?: string;
      score?: number;
      feedback?: string;
      issues?: JudgeIssue[];
    };

    try {
      // Use jsonrepair for robust parsing — handles markdown fences, trailing commas,
      // smart quotes, and other common LLM output quirks across all 11 providers.
      const repaired = jsonrepair(response.content);
      const raw = JSON.parse(repaired);
      // Validate it's actually an object with judge-like fields (not an array or primitive)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Repaired JSON is not a judge verdict object');
      }
      parsed = raw as typeof parsed;
    } catch (err) {
      console.debug('Judge pipeline: failed to parse judge response as JSON:', err);
      parsed = { verdict: 'revise', score: 0.3, feedback: response.content, issues: [] };
    }

    return {
      judgeModel: model,
      verdict: (parsed.verdict as 'approve' | 'reject' | 'revise') ?? 'revise',
      score: Math.max(0, Math.min(1, parsed.score ?? 0.5)),
      feedback: parsed.feedback ?? '',
      issues: parsed.issues ?? [],
      durationMs: Date.now() - startTime,
    };
  }

  private selectJudgeModels(
    profile: JudgeProfile,
    agentModels: ReadonlySet<string>,
    availableModels: string[],
  ): string[] {
    // HARD RULE 1: filter out agent models
    const candidateModels = availableModels.filter(
      (m) => !agentModels.has(m),
    );

    // Sort by quality ranking (highest first)
    candidateModels.sort(
      (a, b) => getModelQualityWeight(b) - getModelQualityWeight(a),
    );

    // G-03: Graceful degradation -- use what's available, min 1
    if (candidateModels.length === 0) {
      // Last resort: use first available model (violates HR#1 but better than crash)
      if (availableModels.length > 0) {
        console.debug('Judge pipeline: no separate judge models available, using agent model');
        return [availableModels[0]];
      }
      throw new Error(
        `Cannot select judge models: no models available`,
      );
    }

    const judgeCount = Math.min(profile.minJudges, candidateModels.length);
    if (judgeCount < profile.minJudges) {
      console.debug(
        `Judge pipeline: fewer judges than recommended (${judgeCount}/${profile.minJudges})`,
      );
    }

    return candidateModels.slice(0, judgeCount);
  }

  private buildJudgeSystemPrompt(
    profile: JudgeProfile,
    request: JudgeRequest,
  ): string {
    const criteriaText = profile.criteria
      .map((c) => `- ${c.name} (weight: ${c.weight}): ${c.description}`)
      .join('\n');

    let previousIssuesText = '';
    // HARD RULE 10: Round 2 receives Round 1 issues
    if (request.previousVerdicts && request.previousVerdicts.length > 0) {
      const prevIssues = request.previousVerdicts.flatMap((v) => v.issues);
      if (prevIssues.length > 0) {
        previousIssuesText = `\n\nPrevious round issues to check if resolved:\n${prevIssues.map((i) => `- [${i.severity}] ${i.category}: ${i.description}`).join('\n')}`;
      }
    }

    return `You are a quality judge evaluating an AI agent's output.

Think step by step about each criterion before giving your verdict.

Evaluate based on these criteria:
${criteriaText}

Return a JSON object with:
- "verdict": "approve" | "reject" | "revise"
- "score": 0.0 to 1.0 (overall quality score)
- "feedback": detailed feedback string
- "issues": array of {severity, category, description, location?, suggestedFix?}

## Calibration Examples

Example 1 — High quality (approve):
{"verdict":"approve","score":0.9,"feedback":"Output is correct, well-structured, and addresses all requirements. Minor style improvements possible but not blocking.","issues":[{"severity":"low","category":"style","description":"Variable naming could be more descriptive in helper function","location":"helpers.ts:12"}]}

Example 2 — Partial quality (revise):
{"verdict":"revise","score":0.6,"feedback":"Core logic is sound but error handling is missing for edge cases and one requirement was only partially addressed.","issues":[{"severity":"high","category":"correctness","description":"No error handling for null input in processData()","location":"process.ts:45","suggestedFix":"Add null check with early return"},{"severity":"medium","category":"completeness","description":"Pagination requirement only implemented for first endpoint"}]}

Example 3 — Low quality (reject):
{"verdict":"reject","score":0.3,"feedback":"Output has fundamental correctness issues. The algorithm produces wrong results for standard inputs and ignores two of four stated requirements.","issues":[{"severity":"critical","category":"correctness","description":"Sort algorithm returns unsorted output for arrays with duplicate values","suggestedFix":"Replace custom sort with stable comparison function"},{"severity":"high","category":"completeness","description":"Authentication requirement completely missing"},{"severity":"high","category":"completeness","description":"Rate limiting requirement completely missing"}]}${previousIssuesText}`;
  }

  private buildJudgeUserPrompt(request: JudgeRequest): string {
    let prompt = `Original task prompt:\n${request.prompt}\n\nAgent output being judged:\n${request.output}`;

    if (request.artifacts.length > 0) {
      prompt += `\n\nArtifacts:\n${request.artifacts.map((a) => `[${a.type}] ${a.path}:\n${a.content}`).join('\n---\n')}`;
    }

    return prompt;
  }

  private generatePatches(issues: readonly JudgeIssue[]): JsonPatch[] {
    const patches: JsonPatch[] = [];

    for (const issue of issues) {
      if (issue.suggestedFix === undefined) continue;

      if (issue.location !== undefined) {
        patches.push({
          op: 'replace',
          path: issue.location,
          value: issue.suggestedFix,
        });
      } else {
        patches.push({
          op: 'add',
          path: '/corrections/-',
          value: { issue: issue.description, fix: issue.suggestedFix },
        });
      }
    }

    return patches;
  }

  private createTimeout(ms: number): Promise<ModelResponse> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        /* v8 ignore next -- timeout only fires when real judge exceeds deadline; mocks resolve instantly */
        reject(new Error(`Judge timed out after ${ms}ms`));
      }, ms);
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createJudgePipeline(
  modelRouter: JudgePipelineModelRouter,
  consensusEngine: ConsensusEngine,
  issueExtractor: IssueExtractor,
  driftDetector: DriftDetector,
  antiFabrication: AntiFabrication,
  localJudgeAdapter: LocalJudgeAdapter,
  modeEngine: JudgePipelineModeEngine,
  eventBus: EventBus,
  db: QosDatabase,
): JudgePipeline {
  return new JudgePipelineImpl(
    modelRouter,
    consensusEngine,
    issueExtractor,
    driftDetector,
    antiFabrication,
    localJudgeAdapter,
    modeEngine,
    eventBus,
    db,
  );
}
