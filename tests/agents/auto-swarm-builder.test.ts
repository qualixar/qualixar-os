import { describe, it, expect, beforeEach } from 'vitest';
import { createAutoSwarmBuilder, type AutoSwarmBuilder } from '../../src/agents/auto-swarm-builder.js';
import { createForge, type Forge } from '../../src/agents/forge.js';
import {
  createTestDb,
  createTestEventBus,
  createMockModelRouter,
  createMockModeEngine,
  createMockStrategyMemory,
  createMockStrategyScorer,
} from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';

describe('AutoSwarmBuilder', () => {
  let db: QosDatabase;
  let builder: AutoSwarmBuilder;

  beforeEach(() => {
    db = createTestDb();
    const eventBus = createTestEventBus(db);

    const mockRouter = createMockModelRouter((req) => {
      if (req.prompt.includes('Parse this natural language')) {
        return JSON.stringify({
          taskType: 'research',
          suggestedTopology: 'parallel',
          suggestedAgentCount: 3,
          roles: ['researcher', 'analyst', 'writer'],
          constraints: {},
        });
      }
      if (req.prompt.includes('Classify this task')) {
        return 'research';
      }
      if (req.prompt.includes('Design an agent team')) {
        return JSON.stringify({
          topology: 'parallel',
          agents: [
            { role: 'researcher', model: 'claude-sonnet-4-6', systemPrompt: 'Research things.' },
            { role: 'analyst', model: 'claude-sonnet-4-6', systemPrompt: 'Analyze data.' },
          ],
          reasoning: 'Parallel research and analysis',
        });
      }
      return 'fallback';
    });

    const forge = createForge(
      mockRouter,
      createMockStrategyMemory(),
      createMockStrategyScorer(),
      createMockModeEngine(),
      db,
      eventBus,
    );

    builder = createAutoSwarmBuilder(mockRouter, forge);
  });

  it('should parse NL description and return a TeamDesign', async () => {
    const design = await builder.build('Research and analyze market trends for AI', 'power');

    expect(design).toBeDefined();
    expect(design.topology).toBeTruthy();
    expect(design.agents.length).toBeGreaterThan(0);
    expect(design.taskType).toBeTruthy();
  });

  it('should handle parse failure gracefully', async () => {
    const db2 = createTestDb();
    const eventBus2 = createTestEventBus(db2);

    const badRouter = createMockModelRouter(() => 'not json at all');
    const forge = createForge(
      badRouter,
      createMockStrategyMemory(),
      createMockStrategyScorer(),
      createMockModeEngine(),
      db2,
      eventBus2,
    );

    const builder2 = createAutoSwarmBuilder(badRouter, forge);

    // This will fail because Forge can't parse the design response either
    // but the auto-swarm-builder itself handles the NL parse failure
    await expect(builder2.build('Do something', 'companion')).rejects.toThrow();
  });
});
