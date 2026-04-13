// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Auto Swarm Builder
 * NL description -> swarm config via Forge.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.11
 */

import type { QosMode, TeamDesign } from '../types/common.js';
import type { ModelRouter } from '../router/model-router.js';
import type { Forge } from './forge.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PARSE_NL_PROMPT = (description: string) =>
  `Parse this natural language task description and extract structure.

Description: ${description}

Respond with JSON:
{
  "taskType": "code|research|analysis|creative|custom",
  "suggestedTopology": "sequential|parallel|hierarchical|dag|mixture_of_agents|debate|mesh|star|circular|grid|forest|maker",
  "suggestedAgentCount": 3,
  "roles": ["role1", "role2"],
  "constraints": {}
}`;

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface AutoSwarmBuilder {
  build(description: string, mode: QosMode): Promise<TeamDesign>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class AutoSwarmBuilderImpl implements AutoSwarmBuilder {
  private readonly _modelRouter: ModelRouter;
  private readonly _forge: Forge;

  constructor(modelRouter: ModelRouter, forge: Forge) {
    this._modelRouter = modelRouter;
    this._forge = forge;
  }

  async build(description: string, mode: QosMode): Promise<TeamDesign> {
    // Step 1 -- Parse NL description via LLM
    const response = await this._modelRouter.route({
      prompt: PARSE_NL_PROMPT(description),
      maxTokens: 300,
      quality: 'medium',
    });

    let parsed: {
      taskType: string;
      suggestedTopology?: string;
      suggestedAgentCount?: number;
      roles?: string[];
      constraints?: Record<string, unknown>;
    };

    try {
      parsed = JSON.parse(response.content);
    } catch {
      parsed = { taskType: 'custom' };
    }

    // Step 2 -- Build ForgeRequest
    const forgeRequest = {
      taskId: generateId(),
      prompt: description,
      taskType: parsed.taskType || 'custom',
      mode,
      constraints: parsed.constraints
        ? {
            maxAgents: parsed.suggestedAgentCount,
            preferredTopology: parsed.suggestedTopology,
          }
        : undefined,
    };

    // Step 3 -- Delegate to Forge
    return this._forge.designTeam(forgeRequest);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAutoSwarmBuilder(
  modelRouter: ModelRouter,
  forge: Forge,
): AutoSwarmBuilder {
  return new AutoSwarmBuilderImpl(modelRouter, forge);
}
