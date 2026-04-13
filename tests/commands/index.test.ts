/**
 * Phase 10 -- Command Registry Integration Tests
 * Source: Phase 10 LLD Section 2.12
 *
 * Verifies all 25 commands register correctly, no duplicates,
 * all 9 categories present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAllCommands, createWiredCommandRouter } from '../../src/commands/index.js';
import { CommandRouter } from '../../src/commands/router.js';
import type { CommandContext, CommandCategory } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {
      run: vi.fn(),
      getStatus: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      redirect: vi.fn(),
      modeEngine: {
        currentMode: 'companion',
        getConfig: vi.fn().mockReturnValue({}),
        getFeatureGates: vi.fn().mockReturnValue({ topologies: [] }),
        switchMode: vi.fn(),
      },
      costTracker: {
        getSummary: vi.fn().mockReturnValue({}),
      },
      forge: {
        designTeam: vi.fn(),
        getDesigns: vi.fn().mockReturnValue([]),
      },
      judgePipeline: {
        getResults: vi.fn().mockReturnValue(null),
      },
      slmLite: {
        search: vi.fn().mockResolvedValue([]),
      },
      agentRegistry: {
        listAgents: vi.fn().mockReturnValue([]),
        getAgent: vi.fn(),
      },
    } as never,
    eventBus: { emit: vi.fn() } as never,
    db: {
      insert: vi.fn(),
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    } as never,
    config: { get: vi.fn(), getValue: vi.fn() } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command Registry (index.ts)', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  describe('registerAllCommands', () => {
    it('registers exactly 25 commands', () => {
      const router = new CommandRouter(ctx);
      registerAllCommands(router);
      expect(router.size).toBe(25);
    });

    it('all command names are unique', () => {
      const router = new CommandRouter(ctx);
      registerAllCommands(router);

      const commands = router.list();
      const names = commands.map((c) => c.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('all 9 categories are represented', () => {
      const router = new CommandRouter(ctx);
      registerAllCommands(router);

      const categories = router.getCategories();
      const expectedCategories: CommandCategory[] = [
        'task',
        'context',
        'workspace',
        'agents',
        'forge',
        'quality',
        'memory',
        'system',
        'interop',
      ];

      for (const cat of expectedCategories) {
        expect(categories).toContain(cat);
      }
    });

    it('throws on duplicate registration (calling registerAll twice)', () => {
      const router = new CommandRouter(ctx);
      registerAllCommands(router);
      expect(() => registerAllCommands(router)).toThrow('Duplicate command');
    });
  });

  describe('createWiredCommandRouter', () => {
    it('returns a CommandRouter with 25 commands', () => {
      const router = createWiredCommandRouter(ctx);
      expect(router).toBeInstanceOf(CommandRouter);
      expect(router.size).toBe(25);
    });

    it('all commands are dispatchable', async () => {
      const router = createWiredCommandRouter(ctx);
      const commands = router.list();

      for (const cmd of commands) {
        const def = router.getDefinition(cmd.name);
        expect(def).toBeDefined();
        expect(def!.name).toBe(cmd.name);
      }
    });
  });

  describe('command names match expected set', () => {
    const expectedNames = [
      // task (8)
      'run', 'status', 'output', 'cancel', 'pause', 'resume', 'steer', 'list',
      // context (3)
      'context.add', 'context.scan', 'context.list',
      // workspace (2)
      'workspace.set', 'workspace.files',
      // agents (2)
      'agents.list', 'agents.inspect',
      // forge (2)
      'forge.design', 'forge.topologies',
      // quality (1)
      'judges.results',
      // memory (2)
      'memory.search', 'memory.store',
      // system (4)
      'config.get', 'config.set', 'models.list', 'cost.summary',
      // interop (1)
      'import',
    ];

    it('all expected commands are registered', () => {
      const router = createWiredCommandRouter(ctx);
      const registered = router.list().map((c) => c.name);

      for (const name of expectedNames) {
        expect(registered).toContain(name);
      }
    });

    it('no unexpected commands are registered', () => {
      const router = createWiredCommandRouter(ctx);
      const registered = router.list().map((c) => c.name);

      for (const name of registered) {
        expect(expectedNames).toContain(name);
      }
    });
  });

  describe('category distribution', () => {
    it('task category has 8 commands', () => {
      const router = createWiredCommandRouter(ctx);
      const taskCmds = router.list().filter((c) => c.category === 'task');
      expect(taskCmds).toHaveLength(8);
    });

    it('context category has 3 commands', () => {
      const router = createWiredCommandRouter(ctx);
      const cmds = router.list().filter((c) => c.category === 'context');
      expect(cmds).toHaveLength(3);
    });

    it('system category has 4 commands', () => {
      const router = createWiredCommandRouter(ctx);
      const cmds = router.list().filter((c) => c.category === 'system');
      expect(cmds).toHaveLength(4);
    });

    it('memory category has 2 commands', () => {
      const router = createWiredCommandRouter(ctx);
      const cmds = router.list().filter((c) => c.category === 'memory');
      expect(cmds).toHaveLength(2);
    });

    it('quality category has 1 command', () => {
      const router = createWiredCommandRouter(ctx);
      const cmds = router.list().filter((c) => c.category === 'quality');
      expect(cmds).toHaveLength(1);
    });

    it('interop category has 1 command', () => {
      const router = createWiredCommandRouter(ctx);
      const cmds = router.list().filter((c) => c.category === 'interop');
      expect(cmds).toHaveLength(1);
    });
  });
});
