/**
 * Shared test helpers for Phase 4 Multi-Agent tests.
 * Provides mock factories, in-memory DB setup, and agent instance builders.
 */

import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import { phase4Migrations } from '../../src/db/migrations/phase4.js';
import type { AgentInstance, AgentStats } from '../../src/agents/agent-registry.js';
import type { ModelRouter } from '../../src/router/model-router.js';
import type { ModelRequest, ModelResponse, FeatureGates, QosMode } from '../../src/types/common.js';
import type { ModeEngine } from '../../src/engine/mode-engine.js';
import type { StrategyMemory } from '../../src/quality/strategy-memory.js';
import type { StrategyScorer, StrategyRecommendation, TrainingStats } from '../../src/quality/strategy-scorer.js';
import type { ContainerManager, ContainerHandle, ContainerConfig, CommandResult } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// DB + EventBus
// ---------------------------------------------------------------------------

export function createTestDb(): QosDatabase {
  const db = createDatabase(':memory:');
  // Disable FK checks for tests (agents table refs tasks, but we don't want
  // to create task rows for every agent-level unit test).
  db.db.pragma('foreign_keys = OFF');
  // Apply phase 4 migrations
  for (const migration of phase4Migrations) {
    migration.up(db.db);
  }
  return db;
}

/**
 * Ensure a task exists in DB for FK constraint.
 */
export function ensureTask(db: QosDatabase, taskId: string): void {
  db.db
    .prepare(
      "INSERT OR IGNORE INTO tasks (id, type, prompt, status, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(taskId, 'code', 'test', 'pending', 'power', new Date().toISOString(), new Date().toISOString());
}

export function createTestEventBus(db: QosDatabase): EventBus {
  return createEventBus(db);
}

// ---------------------------------------------------------------------------
// Agent Instance Builder
// ---------------------------------------------------------------------------

let agentCounter = 0;

export function makeAgent(overrides?: Partial<AgentInstance>): AgentInstance {
  agentCounter++;
  const defaultStats: AgentStats = {
    messagesReceived: 0,
    messagesSent: 0,
    llmCallCount: 0,
    totalCostUsd: 0,
    totalLatencyMs: 0,
  };

  return {
    id: `agent-${agentCounter}`,
    taskId: 'test-task',
    role: `role-${agentCounter}`,
    model: 'claude-sonnet-4-6',
    systemPrompt: 'You are a helpful agent.',
    tools: [],
    status: 'idle',
    createdAt: new Date().toISOString(),
    stats: defaultStats,
    ...overrides,
  };
}

export function resetAgentCounter(): void {
  agentCounter = 0;
}

// ---------------------------------------------------------------------------
// Mock ModelRouter
// ---------------------------------------------------------------------------

export function createMockModelRouter(
  responseFactory?: (req: ModelRequest) => string,
): ModelRouter {
  const factory = responseFactory ?? (() => 'mock-response');

  return {
    async route(request: ModelRequest): Promise<ModelResponse> {
      return {
        content: factory(request),
        model: request.model ?? 'mock-model',
        provider: 'mock',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        latencyMs: 50,
      };
    },
    getStrategy() {
      return 'mock';
    },
    getCostTracker() {
      return {} as any;
    },
    getDiscoveredModels() {
      return [];
    },
    getAvailableModels() {
      return [{ name: 'mock-model', provider: 'mock', qualityScore: 0.8 }];
    },
  };
}

// ---------------------------------------------------------------------------
// Mock ModeEngine
// ---------------------------------------------------------------------------

const ALL_TOPOLOGIES = [
  'sequential', 'parallel', 'hierarchical', 'dag',
  'mixture_of_agents', 'debate', 'mesh', 'star',
  'circular', 'grid', 'forest', 'maker',
];

export function createMockModeEngine(mode: QosMode = 'power'): ModeEngine {
  return {
    currentMode: mode,
    isFeatureEnabled: () => true,
    getFeatureGates(): FeatureGates {
      return {
        topologies: mode === 'power' ? ALL_TOPOLOGIES : ALL_TOPOLOGIES.slice(0, 6),
        maxJudges: mode === 'power' ? 5 : 2,
        routingStrategies: ['cascade', 'cheapest', 'quality'],
        rlEnabled: mode === 'power',
        containerIsolation: mode === 'power',
        dashboard: true,
        channels: ['cli', 'mcp'],
        simulationEnabled: mode === 'power',
      };
    },
    switchMode: () => {},
  };
}

// ---------------------------------------------------------------------------
// Mock StrategyMemory
// ---------------------------------------------------------------------------

export function createMockStrategyMemory(): StrategyMemory {
  return {
    get: () => undefined,
    upsert: () => {},
    getByTaskType: () => [],
    getAll: () => [],
  };
}

// ---------------------------------------------------------------------------
// Mock Strategy Scorer
// ---------------------------------------------------------------------------

export function createMockStrategyScorer(): StrategyScorer {
  return {
    recordOutcome: () => {},
    getRecommendation(taskType: string): StrategyRecommendation {
      return {
        strategy: 'cascade',
        confidence: 0.5,
        basedOnSamples: 0,
        alternatives: [],
      };
    },
    getTrainingStats(): TrainingStats {
      return {
        totalOutcomes: 0,
        strategyCounts: {},
        avgRewardByStrategy: {},
        topStrategies: {},
      };
    },
    getStats(): Record<string, unknown> {
      return {};
    },
    getStrategies() {
      return null;
    },
  };
}

/** @deprecated Use createMockStrategyScorer instead */
export const createMockRLTrainer = createMockStrategyScorer;

// ---------------------------------------------------------------------------
// Mock ContainerManager
// ---------------------------------------------------------------------------

export function createMockContainerManager(available: boolean = false): ContainerManager {
  return {
    async create(config: ContainerConfig): Promise<ContainerHandle> {
      return {
        id: 'mock-container',
        async executeCommand(command: string): Promise<CommandResult> {
          return { stdout: 'ok', stderr: '', exitCode: 0 };
        },
        async destroy(): Promise<void> {},
      };
    },
    async destroy(id: string): Promise<void> {},
    isAvailable(): boolean {
      return available;
    },
    getFallbackMode(): 'sandbox' | 'none' {
      return 'none';
    },
  };
}
