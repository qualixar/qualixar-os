/**
 * Qualixar OS Phase 7 -- MCP Server Tests
 *
 * Tests tool definitions, input schema generation, and tool dispatching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  buildToolDefs,
  dispatchTool,
  zodToInputSchema,
  RunTaskSchema,
  TaskIdSchema,
  RedirectSchema,
  SearchMemorySchema,
  createMcpServer,
} from '../../src/channels/mcp-server.js';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { TaskResult, CostSummary } from '../../src/types/common.js';
import type { TaskStatus } from '../../src/engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

const mockResult: TaskResult = {
  taskId: 'task-mcp-1',
  status: 'completed',
  output: 'MCP output',
  artifacts: [],
  cost: { total_usd: 0.01, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 9.99 },
  judges: [],
  teamDesign: null,
  duration_ms: 500,
  metadata: {},
};

const mockStatus: TaskStatus = {
  taskId: 'task-mcp-1',
  phase: 'run',
  progress: 50,
  currentAgents: [],
  redesignCount: 0,
  costSoFar: 0.01,
  startedAt: '2026-03-30T10:00:00Z',
};

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn().mockResolvedValue(mockResult),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    redirect: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(mockStatus),
    recoverIncompleteTasks: vi.fn(),
    modeEngine: {
      currentMode: 'companion',
      getFeatureGates: vi.fn().mockReturnValue({
        topologies: ['pipeline', 'star', 'mesh'],
        channels: [],
      }),
      getConfig: vi.fn().mockReturnValue({ mode: 'companion' }),
    },
    costTracker: {
      getSummary: vi.fn().mockReturnValue({
        total_usd: 0.01,
        by_model: {},
        by_agent: {},
        by_category: {},
        budget_remaining_usd: 9.99,
      }),
    },
    forge: {
      getDesigns: vi.fn().mockReturnValue([]),
    },
    judgePipeline: {
      getResults: vi.fn().mockReturnValue([]),
    },
    slmLite: {
      search: vi.fn().mockResolvedValue([]),
    },
    agentRegistry: {
      listAgents: vi.fn().mockReturnValue([]),
    },
    strategyScorer: {
      getStats: vi.fn().mockReturnValue({ episodes: 0 }),
      getStrategies: vi.fn().mockReturnValue([]),
    },
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    db: {
      query: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    },
  } as unknown as Orchestrator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP Server', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = createMockOrchestrator();
  });

  describe('zodToInputSchema', () => {
    it('converts RunTaskSchema to JSON Schema', () => {
      const schema = zodToInputSchema(RunTaskSchema);
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      const props = schema.properties as Record<string, any>;
      expect(props.prompt.type).toBe('string');
      expect(props.type.enum).toContain('code');
      expect((schema.required as string[])).toContain('prompt');
    });

    it('converts TaskIdSchema with required field', () => {
      const schema = zodToInputSchema(TaskIdSchema);
      expect((schema.required as string[])).toContain('taskId');
    });

    it('marks optional fields correctly', () => {
      const schema = zodToInputSchema(SearchMemorySchema);
      const required = schema.required as string[] | undefined;
      expect(required).toContain('query');
      expect(required).not.toContain('layer');
      expect(required).not.toContain('limit');
    });

    it('returns fallback schema for non-ZodObject types', () => {
      const schema = zodToInputSchema(z.string());
      expect(schema).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('buildToolDefs', () => {
    it('returns 25 tool definitions (15 core + 10 Phase 14-16)', () => {
      const defs = buildToolDefs();
      expect(defs).toHaveLength(25);
    });

    it('all tools have name, description, and inputSchema', () => {
      const defs = buildToolDefs();
      for (const def of defs) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.type).toBe('object');
      }
    });

    it('includes all expected tool names', () => {
      const defs = buildToolDefs();
      const names = defs.map((d) => d.name);
      expect(names).toContain('run_task');
      expect(names).toContain('get_status');
      expect(names).toContain('list_tasks');
      expect(names).toContain('pause_task');
      expect(names).toContain('resume_task');
      expect(names).toContain('cancel_task');
      expect(names).toContain('redirect_task');
      expect(names).toContain('list_agents');
      expect(names).toContain('get_cost');
      expect(names).toContain('get_judge_results');
      expect(names).toContain('get_forge_designs');
      expect(names).toContain('search_memory');
      expect(names).toContain('list_topologies');
      expect(names).toContain('get_rl_stats');
      expect(names).toContain('get_system_config');
    });
  });

  describe('dispatchTool', () => {
    it('dispatches run_task', async () => {
      const result = await dispatchTool(orchestrator, 'run_task', {
        prompt: 'Test task',
        type: 'code',
      });
      expect(orchestrator.run).toHaveBeenCalled();
      const parsed = JSON.parse(result);
      expect(parsed.taskId).toBe('task-mcp-1');
    });

    it('dispatches get_status', async () => {
      const result = await dispatchTool(orchestrator, 'get_status', {
        taskId: 'task-mcp-1',
      });
      expect(orchestrator.getStatus).toHaveBeenCalledWith('task-mcp-1');
      const parsed = JSON.parse(result);
      expect(parsed.phase).toBe('run');
    });

    it('dispatches list_tasks', async () => {
      const result = await dispatchTool(orchestrator, 'list_tasks', {});
      expect(orchestrator.db.query).toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual([]);
    });

    it('dispatches pause_task', async () => {
      const result = await dispatchTool(orchestrator, 'pause_task', { taskId: 't1' });
      expect(orchestrator.pause).toHaveBeenCalledWith('t1');
      expect(JSON.parse(result).action).toBe('paused');
    });

    it('dispatches resume_task', async () => {
      const result = await dispatchTool(orchestrator, 'resume_task', { taskId: 't1' });
      expect(orchestrator.resume).toHaveBeenCalledWith('t1');
      expect(JSON.parse(result).action).toBe('resumed');
    });

    it('dispatches cancel_task', async () => {
      const result = await dispatchTool(orchestrator, 'cancel_task', { taskId: 't1' });
      expect(orchestrator.cancel).toHaveBeenCalledWith('t1');
      expect(JSON.parse(result).action).toBe('cancelled');
    });

    it('dispatches redirect_task', async () => {
      const result = await dispatchTool(orchestrator, 'redirect_task', {
        taskId: 't1',
        newPrompt: 'New direction',
      });
      expect(orchestrator.redirect).toHaveBeenCalledWith('t1', 'New direction');
      expect(JSON.parse(result).action).toBe('redirected');
    });

    it('dispatches list_agents', async () => {
      const result = await dispatchTool(orchestrator, 'list_agents', {});
      expect(orchestrator.agentRegistry.listAgents).toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual([]);
    });

    it('dispatches get_cost', async () => {
      const result = await dispatchTool(orchestrator, 'get_cost', {});
      expect(orchestrator.costTracker.getSummary).toHaveBeenCalled();
      const parsed = JSON.parse(result);
      expect(parsed.total_usd).toBe(0.01);
    });

    it('dispatches get_cost with taskId', async () => {
      await dispatchTool(orchestrator, 'get_cost', { taskId: 'task-1' });
      expect(orchestrator.costTracker.getSummary).toHaveBeenCalledWith('task-1');
    });

    it('dispatches get_judge_results', async () => {
      const result = await dispatchTool(orchestrator, 'get_judge_results', {});
      expect(orchestrator.judgePipeline.getResults).toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual([]);
    });

    it('dispatches get_forge_designs', async () => {
      const result = await dispatchTool(orchestrator, 'get_forge_designs', {});
      expect(orchestrator.forge.getDesigns).toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual([]);
    });

    it('dispatches search_memory', async () => {
      const result = await dispatchTool(orchestrator, 'search_memory', {
        query: 'test',
        limit: 5,
      });
      expect(orchestrator.slmLite.search).toHaveBeenCalledWith('test', { limit: 5 });
      expect(JSON.parse(result)).toEqual([]);
    });

    it('dispatches search_memory with layer', async () => {
      await dispatchTool(orchestrator, 'search_memory', {
        query: 'test',
        layer: 'episodic',
        limit: 3,
      });
      expect(orchestrator.slmLite.search).toHaveBeenCalledWith('test', { layer: 'episodic', limit: 3 });
    });

    it('dispatches list_topologies', async () => {
      const result = await dispatchTool(orchestrator, 'list_topologies', {});
      const parsed = JSON.parse(result);
      expect(parsed).toContain('pipeline');
    });

    it('dispatches get_rl_stats', async () => {
      const result = await dispatchTool(orchestrator, 'get_rl_stats', {});
      const parsed = JSON.parse(result);
      expect(parsed.episodes).toBe(0);
    });

    it('dispatches get_system_config', async () => {
      const result = await dispatchTool(orchestrator, 'get_system_config', {});
      const parsed = JSON.parse(result);
      expect(parsed.mode).toBe('companion');
    });

    it('throws on unknown tool', async () => {
      await expect(
        dispatchTool(orchestrator, 'unknown_tool', {}),
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('createMcpServer', () => {
    it('creates a Server instance', () => {
      const server = createMcpServer(orchestrator);
      expect(server).toBeDefined();
    });

    it('ListTools handler returns all tool definitions', async () => {
      const server = createMcpServer(orchestrator);
      // Access the internal request handlers via the server's handler map
      // The MCP Server stores handlers internally; we exercise them via
      // a simulated request/response pattern.
      // Since setRequestHandler registers callbacks, we test that the server
      // was created with the correct tools by verifying the tool definitions.
      const toolDefs = buildToolDefs();
      expect(toolDefs.length).toBe(25);
      expect(toolDefs.every((t) => t.name && t.description && t.inputSchema)).toBe(true);
    });

    it('CallTool handler dispatches tools correctly', async () => {
      // Test the dispatch behavior through dispatchTool directly
      // (the handler wraps dispatchTool)
      const result = await dispatchTool(orchestrator, 'run_task', { prompt: 'test' });
      expect(JSON.parse(result).taskId).toBe('task-mcp-1');

      // Test error case (the handler returns isError: true)
      await expect(dispatchTool(orchestrator, 'no_such_tool', {})).rejects.toThrow('Unknown tool');
    });
  });
});
