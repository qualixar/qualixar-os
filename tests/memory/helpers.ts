/**
 * Shared test helpers for Phase 5 memory tests.
 * Provides in-memory DB setup, mock ModelRouter, and mock EventBus.
 */

import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEventBus, type EventBus } from '../../src/events/event-bus.js';
import type { ModelRouter } from '../../src/router/model-router.js';
import type { ModelRequest, ModelResponse } from '../../src/types/common.js';
import type { QosEvent } from '../../src/types/common.js';
import type { QosEventType } from '../../src/types/events.js';
import { phase5Migrations } from '../../src/db/migrations/phase5.js';
import { phaseEMigrations } from '../../src/db/migrations/phaseE.js';

/**
 * Create an in-memory database with Phase 5 + Phase E migrations applied.
 */
export function createTestDb(): QosDatabase {
  const db = createDatabase(':memory:');
  // Apply Phase 5 migration manually
  for (const migration of phase5Migrations) {
    migration.up(db.db);
  }
  // Apply Phase E migration (embedding column on memory_entries)
  for (const migration of phaseEMigrations) {
    migration.up(db.db);
  }
  return db;
}

/**
 * Create a real EventBus backed by the test DB.
 */
export function createTestEventBus(db: QosDatabase): EventBus {
  return createEventBus(db);
}

/**
 * Captured events for test assertions.
 */
export interface CapturedEvent {
  readonly type: QosEventType;
  readonly payload: Record<string, unknown>;
}

/**
 * Create an event spy that captures emitted events.
 */
export function createEventSpy(eventBus: EventBus): CapturedEvent[] {
  const captured: CapturedEvent[] = [];
  eventBus.on('*', async (event: QosEvent) => {
    captured.push({ type: event.type, payload: event.payload });
  });
  return captured;
}

/**
 * Mock ModelRouter that returns configurable responses.
 */
export function createMockModelRouter(
  defaultResponse?: string,
): ModelRouter & { setResponse: (r: string) => void } {
  let responseContent = defaultResponse ?? '["concept1", "concept2"]';

  const mockRouter: ModelRouter & { setResponse: (r: string) => void } = {
    setResponse(r: string) {
      responseContent = r;
    },
    async route(request: ModelRequest): Promise<ModelResponse> {
      return {
        content: responseContent,
        model: 'mock-model',
        provider: 'mock',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.001,
        latencyMs: 50,
      };
    },
    getStrategy() {
      return 'mock';
    },
    getCostTracker() {
      return null as any;
    },
    getDiscoveredModels() {
      return [];
    },
    getAvailableModels() {
      return [{ name: 'mock-model', provider: 'mock', qualityScore: 0.8 }];
    },
  };

  return mockRouter;
}

/**
 * Wait for microtask queue to drain (for deferred async ops).
 */
export async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
