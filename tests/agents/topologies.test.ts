import { describe, it, expect, beforeEach } from 'vitest';
import { SequentialTopology, ParallelTopology, HierarchicalTopology, DAGTopology } from '../../src/agents/topologies/basic.js';
import { MixtureOfAgentsTopology, DebateTopology, MeshTopology, StarTopology } from '../../src/agents/topologies/advanced.js';
import { CircularTopology, GridTopology, ForestTopology, MakerTopology } from '../../src/agents/topologies/experimental.js';
import { createMsgHub, type MsgHub } from '../../src/agents/msghub.js';
import type { TopologyContext } from '../../src/agents/topologies/types.js';
import { createTestDb, createTestEventBus, makeAgent, resetAgentCounter } from './test-helpers.js';
import type { AgentInstance } from '../../src/agents/agent-registry.js';

function createTestContext(
  prompt: string = 'Test task',
  responseMap?: Record<string, string>,
  config?: Record<string, unknown>,
): TopologyContext {
  let callCount = 0;
  return {
    task: { prompt },
    config: config ?? {},
    executeAgent: async (agent: AgentInstance, p: string) => {
      callCount++;
      if (responseMap && responseMap[agent.role]) {
        return responseMap[agent.role];
      }
      return `output-from-${agent.role}-call-${callCount}`;
    },
  };
}

describe('Basic Topologies', () => {
  let msgHub: MsgHub;

  beforeEach(() => {
    resetAgentCounter();
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
  });

  describe('SequentialTopology', () => {
    const topology = new SequentialTopology();

    it('should have correct name and metadata', () => {
      expect(topology.name).toBe('sequential');
      expect(topology.getTerminationCondition()).toContain('Last agent');
      expect(topology.getAggregationStrategy()).toContain('Last agent');
    });

    it('should chain agent outputs', async () => {
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      const ctx = createTestContext('start', { A: 'step-1', B: 'step-2' });

      const result = await topology.run(agents, msgHub, ctx);

      expect(result.topology).toBe('sequential');
      expect(result.aggregatedOutput).toBe('step-2');
      expect(Object.keys(result.outputs)).toHaveLength(2);
    });

    it('should send messages between agents', async () => {
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      const ctx = createTestContext();

      await topology.run(agents, msgHub, ctx);

      expect(msgHub.getMessageCount()).toBeGreaterThan(0);
    });
  });

  describe('ParallelTopology', () => {
    const topology = new ParallelTopology();

    it('should have correct name', () => {
      expect(topology.name).toBe('parallel');
    });

    it('should run all agents simultaneously', async () => {
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' }), makeAgent({ role: 'C' })];
      const ctx = createTestContext('task', { A: 'out-A', B: 'out-B', C: 'out-C' });

      const result = await topology.run(agents, msgHub, ctx);

      expect(result.aggregatedOutput).toContain('out-A');
      expect(result.aggregatedOutput).toContain('out-B');
      expect(result.agentResults).toHaveLength(3);
    });

    it('should handle failed agents gracefully', async () => {
      let callIdx = 0;
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          callIdx++;
          if (callIdx === 2) throw new Error('agent-fail');
          return 'ok';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      const errorOutputs = Object.values(result.outputs).filter(o => o.startsWith('[ERROR'));
      expect(errorOutputs).toHaveLength(1);
    });
  });

  describe('HierarchicalTopology', () => {
    const topology = new HierarchicalTopology();

    it('should throw with fewer than 2 agents', async () => {
      const agents = [makeAgent({ role: 'mgr' })];
      const ctx = createTestContext();
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('at least 2 agents');
    });

    it('should decompose, delegate, and merge', async () => {
      const agents = [makeAgent({ role: 'manager' }), makeAgent({ role: 'worker1' }), makeAgent({ role: 'worker2' })];
      const ctx = createTestContext('build app');

      const result = await topology.run(agents, msgHub, ctx);

      expect(result.topology).toBe('hierarchical');
      expect(result.aggregatedOutput).toBeTruthy();
      expect(msgHub.getMessageCount()).toBeGreaterThan(0);
    });
  });

  describe('DAGTopology', () => {
    const topology = new DAGTopology();

    it('should execute agents in topological order', async () => {
      const agents = [
        makeAgent({ role: 'root', systemPrompt: 'Do task.' }),
        makeAgent({ role: 'child', systemPrompt: 'DEPENDS_ON: [root]\nDo task.' }),
      ];
      const ctx = createTestContext();

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('dag');
      expect(Object.keys(result.outputs)).toHaveLength(2);
    });

    it('should handle independent agents', async () => {
      const agents = [
        makeAgent({ role: 'A', systemPrompt: 'task' }),
        makeAgent({ role: 'B', systemPrompt: 'task' }),
      ];
      const ctx = createTestContext();

      const result = await topology.run(agents, msgHub, ctx);
      expect(Object.keys(result.outputs)).toHaveLength(2);
    });
  });
});

describe('Advanced Topologies', () => {
  let msgHub: MsgHub;

  beforeEach(() => {
    resetAgentCounter();
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
  });

  describe('MixtureOfAgentsTopology', () => {
    const topology = new MixtureOfAgentsTopology();

    it('should have correct name', () => {
      expect(topology.name).toBe('mixture_of_agents');
    });

    it('should throw with fewer than 2 agents', async () => {
      const agents = [makeAgent()];
      const ctx = createTestContext();
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('at least 2 agents');
    });

    it('should generate then aggregate', async () => {
      const agents = [
        makeAgent({ role: 'gen1' }),
        makeAgent({ role: 'gen2' }),
        makeAgent({ role: 'aggregator' }),
      ];
      const ctx = createTestContext('analyze', {
        gen1: 'analysis-1',
        gen2: 'analysis-2',
        aggregator: 'synthesis',
      });

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('synthesis');
    });
  });

  describe('DebateTopology', () => {
    const topology = new DebateTopology();

    it('should throw with fewer than 2 agents', async () => {
      const agents = [makeAgent()];
      const ctx = createTestContext();
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('at least 2 agents');
    });

    it('should reach consensus and stop early', async () => {
      const agents = [makeAgent({ role: 'proposer' }), makeAgent({ role: 'critic' })];
      const ctx = createTestContext('design', {
        proposer: 'my proposal',
        critic: 'CONSENSUS',
      });

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('my proposal');
    });

    it('should iterate up to maxRounds', async () => {
      let criticCallCount = 0;
      const agents = [makeAgent({ role: 'proposer' }), makeAgent({ role: 'critic' })];
      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { maxRounds: 2 },
        executeAgent: async (agent) => {
          if (agent.role === 'critic') {
            criticCallCount++;
            return 'needs work';
          }
          return 'proposal';
        },
      };

      await topology.run(agents, msgHub, ctx);
      expect(criticCallCount).toBe(2);
    });
  });

  describe('MeshTopology', () => {
    const topology = new MeshTopology();

    it('should converge when no new messages', async () => {
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      const ctx = createTestContext('discuss', { A: 'opinion-A', B: 'opinion-B' });

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('mesh');
      expect(result.aggregatedOutput).toBeTruthy();
    });
  });

  describe('StarTopology', () => {
    const topology = new StarTopology();

    it('should throw with fewer than 2 agents', async () => {
      const agents = [makeAgent()];
      const ctx = createTestContext();
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('at least 2 agents');
    });

    it('should decompose via hub and synthesize', async () => {
      const agents = [
        makeAgent({ role: 'hub' }),
        makeAgent({ role: 'spoke1' }),
        makeAgent({ role: 'spoke2' }),
      ];
      const ctx = createTestContext('research', {
        hub: 'synthesis',
        spoke1: 'finding-1',
        spoke2: 'finding-2',
      });

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('synthesis');
    });
  });
});

describe('Experimental Topologies', () => {
  let msgHub: MsgHub;

  beforeEach(() => {
    resetAgentCounter();
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
  });

  describe('CircularTopology', () => {
    const topology = new CircularTopology();

    it('should have correct name', () => {
      expect(topology.name).toBe('circular');
    });

    it('should pass through ring and stop on stability', async () => {
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      // Return same output to trigger stability
      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { maxPasses: 3 },
        executeAgent: async () => 'stable-output',
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('stable-output');
    });
  });

  describe('GridTopology', () => {
    const topology = new GridTopology();

    it('should throw when grid exceeds agent count', async () => {
      const agents = [makeAgent(), makeAgent()];
      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { rows: 2, cols: 2 },
        executeAgent: async () => 'out',
      };
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('Grid requires');
    });

    it('should execute 2x2 grid and stabilize', async () => {
      const agents = [makeAgent(), makeAgent(), makeAgent(), makeAgent()];
      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { rows: 2, cols: 2, maxRounds: 2 },
        executeAgent: async () => 'cell-output',
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('grid');
      expect(result.aggregatedOutput).toBe('cell-output');
    });
  });

  describe('ForestTopology', () => {
    const topology = new ForestTopology();

    it('should run independent trees and merge', async () => {
      const agents = [
        makeAgent({ role: 'root1', systemPrompt: 'root' }),
        makeAgent({ role: 'root2', systemPrompt: 'root' }),
      ];
      const ctx = createTestContext('analyze', { root1: 'tree-1', root2: 'tree-2' });

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('forest');
      expect(result.aggregatedOutput).toContain('tree-1');
      expect(result.aggregatedOutput).toContain('tree-2');
    });
  });

  describe('MakerTopology', () => {
    const topology = new MakerTopology();

    it('should throw with fewer than 3 agents', async () => {
      const agents = [makeAgent(), makeAgent()];
      const ctx = createTestContext();
      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('at least 3 agents');
    });

    it('should approve when majority votes yes', async () => {
      const agents = [
        makeAgent({ role: 'proposer' }),
        makeAgent({ role: 'voter1' }),
        makeAgent({ role: 'voter2' }),
        makeAgent({ role: 'voter3' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'design' },
        config: { maxRounds: 2 },
        executeAgent: async (agent) => {
          if (agent.role === 'proposer') return 'my proposal';
          return JSON.stringify({ approved: true, feedback: 'looks good' });
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('my proposal');
    });

    it('should refine when majority rejects', async () => {
      let proposalCount = 0;
      const agents = [
        makeAgent({ role: 'proposer' }),
        makeAgent({ role: 'voter1' }),
        makeAgent({ role: 'voter2' }),
        makeAgent({ role: 'voter3' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'design' },
        config: { maxRounds: 2, approvalThreshold: 0.66 },
        executeAgent: async (agent) => {
          if (agent.role === 'proposer') {
            proposalCount++;
            return `proposal-v${proposalCount}`;
          }
          return JSON.stringify({ approved: false, feedback: 'needs work' });
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(proposalCount).toBe(2); // Initial + 1 refinement
    });

    it('should handle non-JSON voter response as rejection', async () => {
      const agents = [
        makeAgent({ role: 'proposer' }),
        makeAgent({ role: 'voter1' }),
        makeAgent({ role: 'voter2' }),
        makeAgent({ role: 'voter3' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'design' },
        config: { maxRounds: 1 },
        executeAgent: async (agent) => {
          if (agent.role === 'proposer') return 'proposal';
          return 'I reject this proposal because...';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('maker');
    });
  });
});
