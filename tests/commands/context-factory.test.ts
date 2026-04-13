/**
 * Phase A1 -- Command Context Factory Tests
 * Source: Phase A1 LLD Section 7.1
 */
import { describe, it, expect, vi } from 'vitest';
import { createCommandContext } from '../../src/commands/context-factory.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

function createMockOrchestrator(): Orchestrator {
  return {
    db: { query: vi.fn(), insert: vi.fn(), get: vi.fn() },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    modeEngine: {
      getConfig: vi.fn().mockReturnValue({
        models: { primary: 'gpt-4o', secondary: 'gpt-4o-mini' },
        mode: 'companion',
        db: { path: ':memory:' },
        security: { policy: 'default' },
      }),
    },
  } as unknown as Orchestrator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCommandContext', () => {
  it('returns a valid CommandContext with all required fields', () => {
    const orch = createMockOrchestrator();
    const ctx = createCommandContext(orch);

    expect(ctx).toBeDefined();
    expect(ctx.orchestrator).toBe(orch);
    expect(ctx.db).toBe(orch.db);
    expect(ctx.eventBus).toBe(orch.eventBus);
    expect(ctx.config).toBeDefined();
    expect(ctx.config.get).toBeTypeOf('function');
    expect(ctx.logger).toBeDefined();
    expect(ctx.logger.info).toBeTypeOf('function');
  });

  it('config.get() returns the orchestrator config', () => {
    const orch = createMockOrchestrator();
    const ctx = createCommandContext(orch);
    const config = ctx.config.get();

    expect(config.mode).toBe('companion');
    expect(config.models.primary).toBe('gpt-4o');
  });

  it('creates independent contexts for different orchestrators', () => {
    const orch1 = createMockOrchestrator();
    const orch2 = createMockOrchestrator();

    const ctx1 = createCommandContext(orch1);
    const ctx2 = createCommandContext(orch2);

    expect(ctx1.orchestrator).toBe(orch1);
    expect(ctx2.orchestrator).toBe(orch2);
    expect(ctx1.orchestrator).not.toBe(ctx2.orchestrator);
  });
});
