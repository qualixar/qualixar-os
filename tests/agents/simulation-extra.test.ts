import { describe, it, expect } from 'vitest';
import {
  createSimulationEngine,
  type SimulationEngine,
} from '../../src/agents/simulation-engine.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  createMockContainerManager,
} from './test-helpers.js';
import type { TeamDesign, TaskOptions, ContainerManager, ContainerHandle, ContainerConfig, CommandResult } from '../../src/types/common.js';

function makeDesign(overrides?: Partial<TeamDesign>): TeamDesign {
  return {
    id: 'd1',
    taskType: 'code',
    topology: 'sequential',
    agents: [
      { role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
    ],
    reasoning: 'test',
    estimatedCostUsd: 0.03,
    version: 1,
    ...overrides,
  };
}

describe('SimulationEngine -- extra coverage', () => {
  it('mock mode should detect empty agent role', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    const engine = createSimulationEngine(
      createMockModelRouter(() => 'ok'),
      createMockContainerManager(false),
      eventBus,
      db,
    );

    const design = makeDesign({
      agents: [{ role: '', model: 'claude-sonnet-4-6', systemPrompt: 'p' }],
    });
    const result = await engine.simulate(design, { prompt: 'test', type: 'custom' });
    expect(result.issues.some((i) => i.includes('empty role'))).toBe(true);
  });

  it('dry-run should handle ModelRouter errors', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    const failRouter = createMockModelRouter(() => {
      throw new Error('model-down');
    });
    const engine = createSimulationEngine(
      failRouter,
      createMockContainerManager(false),
      eventBus,
      db,
    );

    const design = makeDesign();
    const result = await engine.simulate(design, { prompt: 'test', type: 'research' });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('model-down');
  });

  it('sandbox mode with container error should push issue', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);

    const failContainer: ContainerManager = {
      async create(config: ContainerConfig): Promise<ContainerHandle> {
        return {
          id: 'c1',
          async executeCommand(cmd: string): Promise<CommandResult> {
            return { stdout: '', stderr: 'sandbox error', exitCode: 1 };
          },
          async destroy(): Promise<void> {},
        };
      },
      async destroy(): Promise<void> {},
      isAvailable: () => true,
      getFallbackMode: () => 'none' as const,
    };

    const engine = createSimulationEngine(
      createMockModelRouter(() => 'ok'),
      failContainer,
      eventBus,
      db,
    );

    const design = makeDesign();
    const result = await engine.simulate(design, { prompt: 'test', type: 'code' });
    expect(result.verdict).toBe('fail');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('sandbox mode with create error should push issue', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);

    const throwContainer: ContainerManager = {
      async create(): Promise<ContainerHandle> {
        throw new Error('docker-crashed');
      },
      async destroy(): Promise<void> {},
      isAvailable: () => true,
      getFallbackMode: () => 'none' as const,
    };

    const engine = createSimulationEngine(
      createMockModelRouter(() => 'ok'),
      throwContainer,
      eventBus,
      db,
    );

    const design = makeDesign();
    const result = await engine.simulate(design, { prompt: 'test', type: 'code' });
    expect(result.issues.some((i) => i.includes('docker-crashed'))).toBe(true);
  });

  it('mock mode should pass with valid multi-agent design', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    const engine = createSimulationEngine(
      createMockModelRouter(() => 'ok'),
      createMockContainerManager(false),
      eventBus,
      db,
    );

    const design = makeDesign({
      agents: [
        { role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
        { role: 'b', model: 'claude-sonnet-4-6', systemPrompt: 'q' },
      ],
    });
    const result = await engine.simulate(design, { prompt: 'test', type: 'custom' });
    expect(result.verdict).toBe('pass');
  });

  it('dry-run partial verdict when fewer issues than half agents', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    let callIdx = 0;
    // 3 agents, only 1 returns an error indicator -> partial
    const router = createMockModelRouter(() => {
      callIdx++;
      if (callIdx === 1) return 'Error: something wrong';
      return 'looks good';
    });
    const engine = createSimulationEngine(
      router,
      createMockContainerManager(false),
      eventBus,
      db,
    );

    const design = makeDesign({
      agents: [
        { role: 'a', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
        { role: 'b', model: 'claude-sonnet-4-6', systemPrompt: 'q' },
        { role: 'c', model: 'claude-sonnet-4-6', systemPrompt: 'r' },
      ],
    });
    const result = await engine.simulate(design, { prompt: 'test', type: 'research' });
    expect(result.verdict).toBe('partial');
    expect(result.recommendation).toBe('proceed');
  });

  it('mock partial verdict when fewer issues than half agents', async () => {
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    const engine = createSimulationEngine(
      createMockModelRouter(() => 'ok'),
      createMockContainerManager(false),
      eventBus,
      db,
    );

    // 3 agents: 1 has empty role (1 issue), invalid topology would add another
    // but we want exactly 1 issue < 3/2 = 1.5 -> partial
    // Use 1 empty role agent + 2 valid agents with valid topology
    const design = makeDesign({
      topology: 'sequential',
      agents: [
        { role: '', model: 'claude-sonnet-4-6', systemPrompt: 'p' },
        { role: 'b', model: 'claude-sonnet-4-6', systemPrompt: 'q' },
        { role: 'c', model: 'claude-sonnet-4-6', systemPrompt: 'r' },
      ],
    });
    const result = await engine.simulate(design, { prompt: 'test', type: 'custom' });
    expect(result.verdict).toBe('partial');
    expect(result.recommendation).toBe('proceed');
  });
});
