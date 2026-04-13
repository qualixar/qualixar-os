// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Forge
 * AI team designer: designs teams, manages library, redesigns on failure.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.8
 * Interface: REWRITE-SPEC Section 6 Phase 4 (Forge)
 */

import type {
  QosMode,
  TeamDesign,
  AgentRole,
  FeatureGates,
  ForgeJudgeProfile,
} from '../types/common.js';
import type { ModelRouter } from '../router/model-router.js';
import type { StrategyMemory } from '../quality/strategy-memory.js';
import type { StrategyRecommendation, StrategyScorer } from '../quality/strategy-scorer.js';
import type { ModeEngine } from '../engine/mode-engine.js';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { TeamDesignStore } from './team-design.js';
import { createTeamDesignStore } from './team-design.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import type { ToolSelector } from '../tools/tool-selector.js';
import { jsonrepair, JSONRepairError } from 'jsonrepair';
import { parse as parsePartialJson } from 'partial-json';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface ForgeRequest {
  readonly taskId: string;
  readonly prompt: string;
  readonly taskType: string;
  readonly mode: QosMode;
  readonly budget_usd?: number;
  readonly constraints?: ForgeConstraints;
}

export interface ForgeRedesignRequest extends ForgeRequest {
  readonly previousDesign: TeamDesign;
  readonly judgeResult: JudgeResultMinimal;
  readonly redesignCount: number;
}

export interface ForgeConstraints {
  readonly maxAgents?: number;
  readonly maxCostUsd?: number;
  readonly requiredRoles?: readonly string[];
  readonly excludedModels?: readonly string[];
  readonly preferredTopology?: string;
  readonly maxRounds?: number;
}

/** Minimal judge result shape needed by Forge (avoids circular dep) */
export interface JudgeResultMinimal {
  readonly issues: readonly { readonly description: string }[];
  readonly verdicts: readonly { readonly verdict: string; readonly feedback: string }[];
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface Forge {
  designTeam(request: ForgeRequest): Promise<TeamDesign>;
  redesign(request: ForgeRedesignRequest): Promise<TeamDesign>;
  getLibrary(taskType?: string): readonly TeamDesign[];
  getDesigns(taskType?: string): readonly { readonly id: string; readonly taskType: string; readonly topology: string; readonly agents: readonly unknown[] }[];
  saveDesign(design: TeamDesign): void;
}

// ---------------------------------------------------------------------------
// Valid topologies
// ---------------------------------------------------------------------------

const ALL_TOPOLOGIES = new Set([
  'sequential', 'parallel', 'hierarchical', 'dag',
  'mixture_of_agents', 'debate', 'mesh', 'star',
  'circular', 'grid', 'forest', 'maker',
]);

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const CLASSIFY_PROMPT = (prompt: string) =>
  `Classify this task into exactly one category: code, research, analysis, creative, custom.\nTask: ${prompt}\nRespond with only the category name.`;

const DESIGN_TEAM_PROMPT = (
  request: ForgeRequest,
  recommendation: StrategyRecommendation,
  gates: FeatureGates,
  toolCatalog?: string,
  availableModelNames?: readonly string[],
  marketplaceContext?: string,
) =>
  `Design an agent team for this task. You must define ROLES, not agent count.

Task: ${request.prompt}
Task Type: ${request.taskType}
Mode: ${request.mode}
Budget: $${request.budget_usd ?? 'unlimited'}
Strategy Recommendation: ${recommendation.strategy} (confidence: ${recommendation.confidence})
Available Topologies: ${gates.topologies.join(', ')}
${availableModelNames && availableModelNames.length > 0 ? `Available models for agent assignment (use ONLY these): ${availableModelNames.join(', ')}\n` : ''}${toolCatalog ? `\n${toolCatalog}\n` : ''}${marketplaceContext ? `\n${marketplaceContext}\nIf installed skills or tools match the task requirements, assign them to agents instead of designing from scratch.\n` : ''}
Also design evaluation criteria for judging this task's output.

CRITICAL FORMAT RULES:
- Keep each systemPrompt under 150 words — concise role definition, NOT lengthy instructions
- Use plain ASCII in all strings — no smart quotes, no special characters
- Respond with ONLY valid JSON — no markdown fences, no commentary before/after
- Ensure the JSON is complete — do not truncate

Respond with JSON:
{
  "topology": "one of the available topologies",
  "agents": [
    { "role": "role_name", "model": "model_id", "systemPrompt": "...", "tools": ["tool_name_1", "tool_name_2"], "dependsOn": [] }
  ],
  "judgeProfile": {
    "criteria": [{ "name": "criterion_name", "weight": 0.5 }],
    "strictness": "balanced",
    "focusAreas": ["what judges should focus on"]
  },
  "reasoning": "why this design"
}`;

const ADAPT_DESIGN_PROMPT = (existing: TeamDesign, request: ForgeRequest) =>
  `Adapt this existing team design for a new task.

Existing Design (proven topology: ${existing.topology}):
${JSON.stringify(existing.agents, null, 2)}

New Task: ${request.prompt}
New Task Type: ${request.taskType}

Keep the topology. Adjust roles and system prompts. Keep systemPrompt under 150 words each. Respond with ONLY valid JSON — no markdown fences:
{ "agents": [...], "reasoning": "what changed" }`;

const REFINE_DESIGN_PROMPT = (
  design: TeamDesign,
  failures: string,
  verdicts: string,
) =>
  `Refine this team design to fix the identified issues. Keep the same topology unless absolutely necessary.

Current Design (topology: ${design.topology}):
${JSON.stringify(design.agents, null, 2)}

Failure Reasons: ${failures}
Judge Verdicts: ${verdicts}

Keep systemPrompt under 150 words each. Respond with ONLY valid JSON — no markdown fences:
{ "agents": [...], "reasoning": "what changed and why" }`;

const RADICAL_REDESIGN_PROMPT = (
  request: ForgeRedesignRequest,
  pastFailures: string,
) =>
  `COMPLETE REDESIGN needed. Previous design failed ${request.redesignCount} times. Use a DIFFERENT topology and DIFFERENT roles.

Task: ${request.prompt}
Previous topology (DO NOT use this): ${request.previousDesign.topology}
Past failures for this task type:
${pastFailures}

Keep systemPrompt under 150 words each. Respond with ONLY valid JSON — no markdown fences:
{
  "topology": "a DIFFERENT topology than ${request.previousDesign.topology}",
  "agents": [{ "role": "...", "model": "...", "systemPrompt": "...", "tools": [], "dependsOn": [] }],
  "reasoning": "why this completely different design"
}`;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ForgeImpl implements Forge {
  private readonly _modelRouter: ModelRouter;
  private readonly _strategyMemory: StrategyMemory;
  private readonly _strategyScorer: StrategyScorer;
  private readonly _modeEngine: ModeEngine;
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;
  private readonly _teamDesignStore: TeamDesignStore;
  private readonly _toolSelector?: ToolSelector;

  constructor(
    modelRouter: ModelRouter,
    strategyMemory: StrategyMemory,
    strategyScorer: StrategyScorer,
    modeEngine: ModeEngine,
    db: QosDatabase,
    eventBus: EventBus,
    toolSelector?: ToolSelector,
  ) {
    this._modelRouter = modelRouter;
    this._strategyMemory = strategyMemory;
    this._strategyScorer = strategyScorer;
    this._modeEngine = modeEngine;
    this._db = db;
    this._eventBus = eventBus;
    this._teamDesignStore = createTeamDesignStore(db);
    this._toolSelector = toolSelector;
  }

  async designTeam(request: ForgeRequest): Promise<TeamDesign> {
    this._eventBus.emit({
      type: 'forge:designing',
      payload: { taskId: request.taskId, taskType: request.taskType },
      source: 'forge',
    });

    // Step 1 -- Classify task type
    let taskType = request.taskType;
    try {
      const classifyResponse = await this._modelRouter.route({
        prompt: CLASSIFY_PROMPT(request.prompt),
        maxTokens: 100,
        quality: 'low',
      });
      const classified = classifyResponse.content.trim().toLowerCase();
      if (['code', 'research', 'analysis', 'creative', 'custom'].includes(classified)) {
        taskType = classified;
      }
    } catch {
      // Use request.taskType as fallback
    }

    // Step 2 -- Query strategy memory
    const recommendation = this._strategyScorer.getRecommendation(taskType);

    // Step 2b -- Build tool catalog for prompt (Phase Pivot-2)
    const toolCatalog = this._toolSelector
      ? this._toolSelector.formatCatalogForPrompt(taskType)
      : undefined;

    // Step 2c -- Get available models for agent assignment (G-02)
    // Use runtime catalog (config-defined, provider-checked) to prevent the
    // Forge LLM from inventing unavailable model names like gpt-4-turbo.
    const runtimeModels = this._modelRouter.getAvailableModels();
    let availableModelNames: string[] | undefined;
    if (runtimeModels.length > 0) {
      availableModelNames = runtimeModels.map((m) => m.name);
    } else {
      const discoveredModels = this._modelRouter.getDiscoveredModels();
      availableModelNames = discoveredModels.length > 0
        ? discoveredModels.map((m) => m.name)
        : undefined;
    }

    // Step 2d -- G-15: Query marketplace for installed skills
    const marketplaceContext = this._queryMarketplaceContext();

    // Step 3 -- Check design library
    const libraryHit = this._teamDesignStore.getBestForTaskType(taskType, 0.7);

    // Step 4 -- Design decision
    let design: TeamDesign | undefined;
    const gates = this._modeEngine.getFeatureGates();

    // Step 4a -- Try adapting from library if a match exists
    if (libraryHit) {
      try {
        const adaptResponse = await this._modelRouter.route({
          prompt: ADAPT_DESIGN_PROMPT(libraryHit, request),
          maxTokens: 500,
          quality: 'medium',
        });
        const adapted = this._parseDesignResponse(adaptResponse.content, gates, availableModelNames);
        const finalAgents = adapted.agents.length > 0 ? adapted.agents : libraryHit.agents;
        if (finalAgents.length > 0) {
          design = {
            id: generateId(),
            taskType,
            topology: adapted.topology ?? libraryHit.topology,
            agents: finalAgents,
            reasoning: `Adapted from library design ${libraryHit.id}`,
            estimatedCostUsd: estimateCost(finalAgents),
            version: 1,
            judgeProfile: adapted.judgeProfile,
          };
        }
      } catch {
        // Adaptation failed — will fall through to new design below
      }
    }

    // Step 4b -- Generate new design if library adaptation failed or no library hit
    if (!design) {
      const designResponse = await this._modelRouter.route({
        prompt: DESIGN_TEAM_PROMPT(request, recommendation, gates, toolCatalog, availableModelNames, marketplaceContext),
        maxTokens: 1000,
        quality: 'high',
      });

      const parsed = this._parseDesignResponse(designResponse.content, gates, availableModelNames);
      design = {
        id: generateId(),
        taskType,
        topology: parsed.topology ?? 'sequential',
        agents: parsed.agents,
        reasoning: parsed.reasoning ?? 'Generated by Forge',
        estimatedCostUsd: estimateCost(parsed.agents),
        version: 1,
        judgeProfile: parsed.judgeProfile,
      };
    }

    // Step 5 -- Validate tools per agent (Phase Pivot-2)
    if (this._toolSelector) {
      design = {
        ...design,
        agents: design.agents.map((agent) => {
          const validated = this._toolSelector!.validateSelections(
            agent.tools ?? [],
            taskType,
          );
          // If LLM returned empty/invalid tools, assign defaults
          const finalTools = validated.length > 0
            ? validated
            : this._toolSelector!.getDefaultsForTaskType(taskType);
          return { ...agent, tools: finalTools };
        }),
      };
    }

    // Step 6 -- Validate design structure
    this._validateDesign(design);

    // Persist design to library for future reuse + dashboard visibility
    try {
      this._teamDesignStore.save(design);
    } catch {
      // Best-effort persistence — don't block pipeline on DB error
    }

    this._eventBus.emit({
      type: 'forge:designed',
      payload: {
        taskId: request.taskId,
        designId: design.id,
        topology: design.topology,
        agentCount: design.agents.length,
      },
      source: 'forge',
    });

    return design;
  }

  async redesign(request: ForgeRedesignRequest): Promise<TeamDesign> {
    this._eventBus.emit({
      type: 'forge:redesigning',
      payload: { taskId: request.taskId, redesignCount: request.redesignCount },
      source: 'forge',
    });

    const failureReasons = request.judgeResult.issues
      .map((i) => i.description)
      .join('; ');
    const verdictSummary = request.judgeResult.verdicts
      .map((v) => `${v.verdict}: ${v.feedback}`)
      .join('\n');

    const gates = this._modeEngine.getFeatureGates();
    let design: TeamDesign;

    // G-02: Get available models for redesign context
    const redesignDiscoveredModels = this._modelRouter.getDiscoveredModels();
    const redesignAvailableModelNames = redesignDiscoveredModels.length > 0
      ? redesignDiscoveredModels.map((m) => m.name)
      : undefined;

    if (request.redesignCount < 3) {
      // Refine existing design
      const refineResponse = await this._modelRouter.route({
        prompt: REFINE_DESIGN_PROMPT(request.previousDesign, failureReasons, verdictSummary),
        maxTokens: 800,
        quality: 'high',
      });

      const refined = this._parseDesignResponse(refineResponse.content, gates, redesignAvailableModelNames);
      design = {
        id: generateId(),
        taskType: request.previousDesign.taskType,
        topology: request.previousDesign.topology,
        agents: refined.agents.length > 0 ? refined.agents : request.previousDesign.agents,
        reasoning: `Refined: ${refined.reasoning ?? 'Addressed judge feedback'}`,
        estimatedCostUsd: estimateCost(refined.agents.length > 0 ? refined.agents : request.previousDesign.agents),
        version: request.previousDesign.version + 1,
      };
    } else {
      // Radical redesign
      const pastFailures = this._queryPastFailures(request.taskType);
      const redesignResponse = await this._modelRouter.route({
        prompt: RADICAL_REDESIGN_PROMPT(request, pastFailures),
        maxTokens: 1000,
        quality: 'high',
      });

      const newDesign = this._parseDesignResponse(redesignResponse.content, gates, redesignAvailableModelNames);

      // Ensure topology differs
      let topology = newDesign.topology ?? 'parallel';
      if (topology === request.previousDesign.topology) {
        const alternatives = Array.from(ALL_TOPOLOGIES).filter(
          (t) => t !== request.previousDesign.topology && gates.topologies.includes(t),
        );
        topology = alternatives[0] ?? 'parallel';
      }

      design = {
        id: generateId(),
        taskType: request.taskType,
        topology,
        agents: newDesign.agents,
        reasoning: `Radical redesign after ${request.redesignCount} failures: ${newDesign.reasoning ?? ''}`,
        estimatedCostUsd: estimateCost(newDesign.agents),
        version: 1,
      };

      this._storeFailurePattern(request.previousDesign, failureReasons);
    }

    this._validateDesign(design);

    // Persist redesigned team to library for learning + dashboard
    try {
      this._teamDesignStore.save(design);
    } catch {
      // Best-effort persistence
    }

    return design;
  }

  getLibrary(taskType?: string): readonly TeamDesign[] {
    if (taskType) return this._teamDesignStore.getByTaskType(taskType);
    return this._teamDesignStore.listAll();
  }

  getDesigns(taskType?: string): readonly { readonly id: string; readonly taskType: string; readonly topology: string; readonly agents: readonly unknown[] }[] {
    return this.getLibrary(taskType);
  }

  saveDesign(design: TeamDesign): void {
    this._teamDesignStore.save(design);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * 5-Layer Defense JSON Parser (production-grade, all 11 providers)
   *
   * Layer 1: Strip markdown fences + extract JSON object
   * Layer 2: jsonrepair — fixes trailing commas, smart quotes, unescaped chars
   * Layer 3: partial-json — recovers truncated JSON (extracts completed agents)
   * Layer 4: Schema validation — ensures semantic correctness
   * Layer 5: Retry with error context (handled by caller, not here)
   */
  private _parseDesignResponse(
    content: string,
    gates: FeatureGates,
    availableModelNames?: readonly string[],
  ): { topology?: string; agents: readonly AgentRole[]; reasoning?: string; judgeProfile?: ForgeJudgeProfile } {
    // G-02: Determine the default model to use when LLM response omits it
    const defaultModel = availableModelNames?.[0] ?? 'gpt-4.1-mini';

    // Layer 1: Strip markdown fences and isolate JSON
    let raw = content;
    // Remove markdown code fences wrapping the response
    raw = raw.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, '');
    raw = raw.replace(/\n?```[\s\S]*$/i, '');
    // If no fences were present, try to extract the first JSON object
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.debug('Forge: no JSON found in LLM response', { contentLength: content.length, snippet: content.slice(0, 200) });
      return { agents: [] };
    }
    raw = jsonMatch[0];

    // Pre-fix: normalize LLM quirks before repair
    // Fix "strict" | "balanced" | "lenient" → "balanced"
    raw = raw.replace(/"strict"\s*\|\s*"balanced"\s*\|\s*"lenient"/g, '"balanced"');

    // Layer 2: jsonrepair — handles trailing commas, smart quotes, unescaped chars, Python booleans
    let jsonStr: string;
    let usedPartialRecovery = false;
    try {
      jsonStr = jsonrepair(raw);
    } catch (repairErr) {
      // Layer 3: partial-json — recover from truncated responses
      if (repairErr instanceof JSONRepairError) {
        console.debug('Forge: jsonrepair failed, attempting partial-json recovery', {
          error: repairErr.message,
          contentLength: raw.length,
        });
        try {
          const partial = parsePartialJson(raw);
          if (partial && typeof partial === 'object' && !Array.isArray(partial)) {
            jsonStr = JSON.stringify(partial);
            usedPartialRecovery = true;
          } else {
            console.debug('Forge: partial-json recovery yielded non-object', { type: typeof partial });
            return { agents: [] };
          }
        } catch (partialErr) {
          console.debug('Forge: all JSON recovery failed', {
            repairError: repairErr.message,
            partialError: partialErr instanceof Error ? partialErr.message : String(partialErr),
            contentSnippet: content.slice(0, 300),
          });
          return { agents: [] };
        }
      } else {
        console.debug('Forge: unexpected repair error', { error: repairErr instanceof Error ? repairErr.message : String(repairErr) });
        return { agents: [] };
      }
    }

    // Layer 4: Parse + Schema validation
    try {
      const parsed = JSON.parse(jsonStr);

      if (usedPartialRecovery) {
        console.debug('Forge: recovered partial design from truncated response', {
          agentCount: Array.isArray(parsed.agents) ? parsed.agents.length : 0,
          hasTopology: Boolean(parsed.topology),
        });
      }

      const agents: AgentRole[] = (parsed.agents ?? []).map((a: Record<string, unknown>) => {
        let model = String(a.model ?? defaultModel);
        // Validate model is in available list — if not, substitute with default
        // This prevents Forge from designing agents using providers not configured
        if (availableModelNames && availableModelNames.length > 0) {
          const isAvailable = availableModelNames.some(
            (m) => m === model || m.includes(model) || model.includes(m),
          );
          if (!isAvailable) {
            model = defaultModel;
          }
        }
        return {
          role: String(a.role ?? 'agent'),
          model,
          systemPrompt: String(a.systemPrompt ?? ''),
          tools: Array.isArray(a.tools) ? a.tools.map(String) : [],
          dependsOn: Array.isArray(a.dependsOn) ? a.dependsOn.map(String) : [],
        };
      });

      // Filter out agents with empty roles (can happen from partial recovery)
      const validAgents = agents.filter(a => a.role && a.role !== 'agent' || a.systemPrompt);

      let topology = parsed.topology ? String(parsed.topology) : undefined;
      if (topology && !gates.topologies.includes(topology)) {
        topology = undefined;
      }

      // G-08: Extract Forge-designed judge profile if present
      const judgeProfile = this._parseJudgeProfile(parsed.judgeProfile);

      return {
        topology,
        agents: validAgents.length > 0 ? validAgents : agents,
        reasoning: parsed.reasoning ? String(parsed.reasoning) : undefined,
        judgeProfile,
      };
    } catch (err) {
      console.debug('Forge: JSON.parse failed after repair', {
        error: err instanceof Error ? err.message : String(err),
        repairedSnippet: jsonStr.slice(0, 300),
        usedPartialRecovery,
      });
      return { agents: [] };
    }
  }

  /** G-08: Validate and normalize a Forge-designed judge profile. */
  private _parseJudgeProfile(raw: unknown): ForgeJudgeProfile | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const obj = raw as Record<string, unknown>;

    // Validate criteria array
    if (!Array.isArray(obj.criteria) || obj.criteria.length === 0) return undefined;
    const criteria = obj.criteria
      .filter((c: unknown) => c && typeof c === 'object')
      .map((c: Record<string, unknown>) => ({
        name: String(c.name ?? 'unnamed'),
        weight: typeof c.weight === 'number' ? c.weight : 0,
      }));
    if (criteria.length === 0) return undefined;

    // Normalize weights to sum to 1.0
    const totalWeight = criteria.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0);
    const normalizedCriteria = totalWeight > 0
      ? criteria.map((c: { name: string; weight: number }) => ({ ...c, weight: c.weight / totalWeight }))
      : criteria;

    // Validate strictness
    const validStrictness = ['strict', 'balanced', 'lenient'] as const;
    const strictness = validStrictness.includes(obj.strictness as typeof validStrictness[number])
      ? (obj.strictness as ForgeJudgeProfile['strictness'])
      : 'balanced';

    // Validate focusAreas
    const focusAreas = Array.isArray(obj.focusAreas)
      ? obj.focusAreas.map(String)
      : [];

    return { criteria: normalizedCriteria, strictness, focusAreas };
  }

  private _validateDesign(design: TeamDesign): void {
    if (design.agents.length === 0) {
      throw new Error('Design produced zero agents');
    }

    /* v8 ignore next 3 -- topology sanitized by _parseDesignResponse before _validateDesign */
    if (!ALL_TOPOLOGIES.has(design.topology)) {
      throw new Error(`Invalid topology: '${design.topology}'`);
    }

    for (const agent of design.agents) {
      /* v8 ignore next 3 -- _parseDesignResponse defaults empty roles to 'agent' */
      if (!agent.role || agent.role.trim() === '') {
        throw new Error('Agent has empty role');
      }
      if (!agent.model || agent.model.trim() === '') {
        throw new Error(`Agent '${agent.role}' has empty model`);
      }
    }
  }

  private _storeFailurePattern(design: TeamDesign, failureReasons: string): void {
    try {
      this._db.db
        .prepare(
          `INSERT INTO forge_designs
             (id, task_type, team_config, success_count, failure_count, avg_score, created_at, updated_at)
           VALUES (?, ?, ?, 0, 1, 0, ?, ?)`,
        )
        .run(
          generateId(),
          design.taskType,
          JSON.stringify({ design, failureReasons }),
          now(),
          now(),
        );
    } catch {
      // Non-critical, log and continue
    }
  }

  /**
   * G-15: Query the marketplace for installed skills and available tools.
   * Returns a formatted context string for injection into the design prompt.
   * Returns undefined if no marketplace items are available.
   */
  private _queryMarketplaceContext(): string | undefined {
    const parts: string[] = [];

    // Query installed skills from skill_packages table
    try {
      const skills = this._db.query<{ name: string; description: string; category: string; tool_count: number }>(
        "SELECT name, description, category, tool_count FROM skill_packages WHERE status = 'active' ORDER BY installed_at DESC LIMIT 20",
      );
      if (skills.length > 0) {
        parts.push('Installed marketplace skills you can assign to agents:');
        for (const skill of skills) {
          parts.push(`- ${skill.name} (${skill.category}): ${skill.description} [${skill.tool_count} tools]`);
        }
      }
    } catch {
      // skill_packages table may not exist yet -- non-critical
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  private _queryPastFailures(taskType: string): string {
    try {
      const rows = this._db.query<{ team_config: string }>(
        'SELECT team_config FROM forge_designs WHERE task_type = ? AND failure_count > 0 ORDER BY failure_count DESC LIMIT 5',
        [taskType],
      );
      return rows.map((r) => r.team_config).join('\n---\n');
    } catch {
      /* v8 ignore next -- DB error guard, not reachable with in-memory SQLite test DB */
      return 'No past failures recorded';
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateCost(agents: readonly AgentRole[]): number {
  let total = 0;
  for (const agent of agents) {
    const model = agent.model.toLowerCase();
    if (model.includes('opus')) total += 0.15;
    else if (model.includes('sonnet')) total += 0.03;
    else if (model.includes('haiku')) total += 0.005;
    else if (model.includes('gpt-4')) total += 0.06;
    else total += 0.02;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createForge(
  modelRouter: ModelRouter,
  strategyMemory: StrategyMemory,
  strategyScorer: StrategyScorer,
  modeEngine: ModeEngine,
  db: QosDatabase,
  eventBus: EventBus,
  toolSelector?: ToolSelector,
): Forge {
  return new ForgeImpl(modelRouter, strategyMemory, strategyScorer, modeEngine, db, eventBus, toolSelector);
}
