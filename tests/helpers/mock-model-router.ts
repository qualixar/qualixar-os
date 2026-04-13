/**
 * Qualixar OS Phase 9 -- Mock Model Router
 *
 * Deterministic mock ModelRouter and CostTracker for E2E testing.
 * No real LLM calls -- all responses are synthetic.
 */

import type {
  ModelRequest,
  ModelResponse,
  CostEntry,
  ModelCallEntry,
  CostSummary,
} from '../../src/types/common.js';
import type { ModelRouter } from '../../src/router/model-router.js';
import type { CostTracker } from '../../src/cost/cost-tracker.js';

// ---------------------------------------------------------------------------
// Mock CostTracker
// ---------------------------------------------------------------------------

export function createMockCostTracker(): CostTracker & {
  readonly entries: readonly CostEntry[];
  readonly modelCalls: readonly ModelCallEntry[];
} {
  const entries: CostEntry[] = [];
  const modelCalls: ModelCallEntry[] = [];
  let totalCost = 0;

  return {
    get entries() { return [...entries]; },
    get modelCalls() { return [...modelCalls]; },

    record(entry: CostEntry): void {
      entries.push(entry);
      totalCost += entry.amountUsd;
    },

    recordModelCall(entry: ModelCallEntry): void {
      modelCalls.push(entry);
      totalCost += entry.costUsd;
    },

    getTaskCost(taskId: string): number {
      return entries
        .filter((e) => e.taskId === taskId)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },

    getAgentCost(agentId: string): number {
      return entries
        .filter((e) => e.agentId === agentId)
        .reduce((sum, e) => sum + e.amountUsd, 0);
    },

    getTotalCost(): number {
      return totalCost;
    },

    getSummary(taskId?: string): CostSummary {
      const scoped = taskId
        ? entries.filter((e) => e.taskId === taskId)
        : entries;

      const by_model: Record<string, number> = {};
      const by_agent: Record<string, number> = {};
      const by_category: Record<string, number> = {};

      for (const e of scoped) {
        by_model[e.model] = (by_model[e.model] ?? 0) + e.amountUsd;
        if (e.agentId) {
          by_agent[e.agentId] = (by_agent[e.agentId] ?? 0) + e.amountUsd;
        }
        by_category[e.category] = (by_category[e.category] ?? 0) + e.amountUsd;
      }

      const total_usd = scoped.reduce((s, e) => s + e.amountUsd, 0);

      return { total_usd, by_model, by_agent, by_category, budget_remaining_usd: -1 };
    },
  };
}

// ---------------------------------------------------------------------------
// Mock ModelRouter
// ---------------------------------------------------------------------------

interface MockModelRouterResult extends ModelRouter {
  getCalls(): readonly ModelRequest[];
  getCallCount(): number;
}

export function createMockModelRouter(
  responses?: Map<string, string>,
): MockModelRouterResult {
  const calls: ModelRequest[] = [];
  const costTracker = createMockCostTracker();

  return {
    async route(request: ModelRequest): Promise<ModelResponse> {
      calls.push(request);
      const content = responses?.get(request.prompt)
        ?? `Mock response for: ${request.prompt}`;
      return {
        content,
        model: 'mock-model',
        provider: 'mock',
        inputTokens: Math.ceil(request.prompt.length / 4),
        outputTokens: Math.ceil(content.length / 4),
        costUsd: 0.001,
        latencyMs: 50,
      };
    },

    getStrategy(): string {
      return 'mock';
    },

    getCostTracker(): CostTracker {
      return costTracker;
    },

    getDiscoveredModels() {
      return [];
    },

    getAvailableModels() {
      return [{ name: 'mock-model', provider: 'mock', qualityScore: 0.8 }];
    },

    getCalls(): readonly ModelRequest[] {
      return [...calls];
    },

    getCallCount(): number {
      return calls.length;
    },
  };
}
