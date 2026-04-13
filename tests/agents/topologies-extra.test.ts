import { describe, it, expect, beforeEach } from 'vitest';
import { SequentialTopology, ParallelTopology, HierarchicalTopology, DAGTopology, basicTopologies } from '../../src/agents/topologies/basic.js';
import { MixtureOfAgentsTopology, DebateTopology, MeshTopology, StarTopology, advancedTopologies } from '../../src/agents/topologies/advanced.js';
import { CircularTopology, GridTopology, ForestTopology, MakerTopology, experimentalTopologies } from '../../src/agents/topologies/experimental.js';
import { buildAgentResults, buildSwarmResult } from '../../src/agents/topologies/types.js';
import { createMsgHub, type MsgHub } from '../../src/agents/msghub.js';
import type { TopologyContext } from '../../src/agents/topologies/types.js';
import { createTestDb, createTestEventBus, makeAgent, resetAgentCounter } from './test-helpers.js';
import type { AgentInstance } from '../../src/agents/agent-registry.js';

describe('Topology exports', () => {
  it('basicTopologies should have 4 topologies', () => {
    expect(basicTopologies).toHaveLength(4);
    expect(basicTopologies.map(t => t.name)).toEqual(['sequential', 'parallel', 'hierarchical', 'dag']);
  });

  it('advancedTopologies should have 4 topologies', () => {
    expect(advancedTopologies).toHaveLength(4);
    expect(advancedTopologies.map(t => t.name)).toEqual(['mixture_of_agents', 'debate', 'mesh', 'star']);
  });

  it('experimentalTopologies should have 4 topologies', () => {
    expect(experimentalTopologies).toHaveLength(4);
    expect(experimentalTopologies.map(t => t.name)).toEqual(['circular', 'grid', 'forest', 'maker']);
  });
});

describe('Types helpers', () => {
  it('buildAgentResults should handle missing outputs', () => {
    const agents = [makeAgent({ role: 'a' }), makeAgent({ role: 'b' })];
    const outputs = { [agents[0].id]: 'ok' };
    const results = buildAgentResults(agents, outputs);

    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('failed');
    expect(results[1].output).toBe('');
  });

  it('buildSwarmResult should compute totals', () => {
    const agents = [
      makeAgent({ role: 'a', stats: { messagesReceived: 0, messagesSent: 0, llmCallCount: 1, totalCostUsd: 0.01, totalLatencyMs: 100 } } as Partial<AgentInstance> as AgentInstance),
    ];
    const result = buildSwarmResult('test', { [agents[0].id]: 'out' }, 'aggregated', agents, performance.now() - 50);
    expect(result.topology).toBe('test');
    expect(result.aggregatedOutput).toBe('aggregated');
    expect(result.totalCostUsd).toBeCloseTo(0.01);
  });
});

describe('Topology metadata methods', () => {
  const allTopos = [
    new SequentialTopology(),
    new ParallelTopology(),
    new HierarchicalTopology(),
    new DAGTopology(),
    new MixtureOfAgentsTopology(),
    new DebateTopology(),
    new MeshTopology(),
    new StarTopology(),
    new CircularTopology(),
    new GridTopology(),
    new ForestTopology(),
    new MakerTopology(),
  ];

  for (const topo of allTopos) {
    it(`${topo.name} should return non-empty termination condition`, () => {
      expect(topo.getTerminationCondition().length).toBeGreaterThan(0);
    });

    it(`${topo.name} should return non-empty aggregation strategy`, () => {
      expect(topo.getAggregationStrategy().length).toBeGreaterThan(0);
    });
  }
});

describe('Advanced topology edge cases', () => {
  let msgHub: MsgHub;

  beforeEach(() => {
    resetAgentCounter();
    const db = createTestDb();
    const eventBus = createTestEventBus(db);
    msgHub = createMsgHub(eventBus);
  });

  describe('MixtureOfAgents with failed generators', () => {
    it('should handle generator failure', async () => {
      const topology = new MixtureOfAgentsTopology();
      const agents = [makeAgent({ role: 'gen1' }), makeAgent({ role: 'gen2' }), makeAgent({ role: 'agg' })];
      let callIdx = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          callIdx++;
          if (callIdx === 1) throw new Error('gen1-fail');
          if (agent.role === 'agg') return 'synthesized';
          return 'gen2-output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.outputs[agents[0].id]).toBe('[FAILED]');
      expect(result.aggregatedOutput).toBe('synthesized');
    });
  });

  describe('Star with failed spokes', () => {
    it('should handle spoke failures gracefully', async () => {
      const topology = new StarTopology();
      const agents = [makeAgent({ role: 'hub' }), makeAgent({ role: 's1' }), makeAgent({ role: 's2' })];
      let hubCallCount = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          if (agent.role === 'hub') {
            hubCallCount++;
            if (hubCallCount === 1) return '1. subtask 1\n2. subtask 2';
            return 'final synthesis';
          }
          if (agent.role === 's1') throw new Error('spoke-fail');
          return 'spoke-output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('final synthesis');
    });
  });

  describe('Mesh with multiple rounds', () => {
    it('should iterate and converge', async () => {
      const topology = new MeshTopology();
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      let round = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'discuss' },
        config: { maxRounds: 3 },
        executeAgent: async (agent) => {
          round++;
          return `response-${round}`;
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('mesh');
    });
  });

  describe('Circular with multiple passes', () => {
    it('should detect changing outputs across passes', async () => {
      const topology = new CircularTopology();
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];
      let callCount = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'iterate' },
        config: { maxPasses: 3 },
        executeAgent: async () => {
          callCount++;
          return `output-${callCount}`;
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      // Should run multiple passes since outputs keep changing
      expect(callCount).toBeGreaterThan(2);
    });
  });

  describe('Grid with stable output', () => {
    it('should terminate early on stability', async () => {
      const topology = new GridTopology();
      const agents = [makeAgent(), makeAgent(), makeAgent(), makeAgent()];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { rows: 2, cols: 2, maxRounds: 5 },
        executeAgent: async () => 'stable',
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('stable');
    });
  });

  describe('Forest with nested trees', () => {
    it('should handle agents with DEPENDS_ON', async () => {
      const topology = new ForestTopology();
      const agents = [
        makeAgent({ role: 'root', systemPrompt: 'be root' }),
        makeAgent({ role: 'leaf', systemPrompt: 'DEPENDS_ON: [root]\nbe leaf' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => `${agent.role}-output`,
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('forest');
      expect(Object.keys(result.outputs)).toHaveLength(2);
    });
  });

  describe('Debate with exact rounds', () => {
    it('should not exceed maxRounds', async () => {
      const topology = new DebateTopology();
      const agents = [makeAgent({ role: 'p' }), makeAgent({ role: 'c' })];
      let criticCalls = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { maxRounds: 1 },
        executeAgent: async (agent) => {
          if (agent.role === 'c') {
            criticCalls++;
            return 'not convinced';
          }
          return 'proposal';
        },
      };

      await topology.run(agents, msgHub, ctx);
      expect(criticCalls).toBe(1);
    });
  });

  describe('Parallel with all failures', () => {
    it('should produce empty aggregated output when all fail', async () => {
      const topology = new ParallelTopology();
      const agents = [makeAgent({ role: 'A' }), makeAgent({ role: 'B' })];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async () => {
          throw new Error('all-fail');
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('');
    });
  });

  describe('Hierarchical with single worker', () => {
    it('should work with manager + 1 worker', async () => {
      const topology = new HierarchicalTopology();
      const agents = [makeAgent({ role: 'mgr' }), makeAgent({ role: 'w1' })];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          if (agent.role === 'mgr') return 'merged result';
          return 'worker output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.aggregatedOutput).toBe('merged result');
    });
  });

  describe('Hierarchical with empty decomposition', () => {
    it('should handle empty manager decomposition (line 36 parseSubtasks)', async () => {
      const topology = new HierarchicalTopology();
      const agents = [makeAgent({ role: 'mgr' }), makeAgent({ role: 'w1' }), makeAgent({ role: 'w2' })];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          // Manager returns empty decomposition (no numbered lines)
          if (agent.role === 'mgr') return '   ';
          return 'worker-output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      // Should still complete -- parseSubtasks falls back to filling with the raw text
      expect(result.topology).toBe('hierarchical');
    });
  });

  describe('Hierarchical with worker failure', () => {
    it('should handle rejected workers in hierarchical topology (line 180)', async () => {
      const topology = new HierarchicalTopology();
      const agents = [makeAgent({ role: 'mgr' }), makeAgent({ role: 'w1' }), makeAgent({ role: 'w2' })];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          if (agent.role === 'mgr') return '1. task one\n2. task two\nmerged';
          if (agent.role === 'w1') throw new Error('worker-crashed');
          return 'w2-output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      // The failed worker should have an error output
      const w1Output = Object.values(result.outputs).find(o => o.includes('[ERROR'));
      expect(w1Output).toBeTruthy();
    });
  });

  describe('DAG with agent failure', () => {
    it('should capture error output for failed DAG agent (line 284)', async () => {
      const topology = new DAGTopology();
      const agents = [
        makeAgent({ role: 'root', systemPrompt: 'Do task.' }),
        makeAgent({ role: 'child', systemPrompt: 'DEPENDS_ON: [root]\nFail.' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async (agent) => {
          if (agent.role === 'child') throw new Error('dag-agent-failed');
          return 'root-output';
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      const failedOutput = Object.values(result.outputs).find(o => o.includes('[ERROR'));
      expect(failedOutput).toContain('dag-agent-failed');
    });
  });

  describe('DAG with dependency from unknown agent', () => {
    it('should handle deps referencing agents not yet in adjacency (line 239)', async () => {
      const topology = new DAGTopology();
      // Agent B depends on A, but we set up the agents so that B is processed first
      // in the dependency extraction, creating a new adjacency entry for A
      const agents = [
        makeAgent({ role: 'A', systemPrompt: 'DEPENDS_ON: [C]\nDo task.' }),
        makeAgent({ role: 'B', systemPrompt: 'Do task.' }),
        makeAgent({ role: 'C', systemPrompt: 'Do task.' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async () => 'output',
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(Object.keys(result.outputs).length).toBeGreaterThan(0);
    });
  });

  describe('DAG cycle detection', () => {
    it('should throw when DAG contains cycles (line 300)', async () => {
      const topology = new DAGTopology();
      // Create mutual dependency: A depends on B, B depends on A
      const agents = [
        makeAgent({ role: 'A', systemPrompt: 'DEPENDS_ON: [B]\nDo task.' }),
        makeAgent({ role: 'B', systemPrompt: 'DEPENDS_ON: [A]\nDo task.' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: {},
        executeAgent: async () => 'output',
      };

      await expect(topology.run(agents, msgHub, ctx)).rejects.toThrow('DAG contains cycles');
    });
  });

  describe('Grid with changing outputs', () => {
    it('should detect changes between rounds (line 144)', async () => {
      const topology = new GridTopology();
      const agents = [makeAgent(), makeAgent(), makeAgent(), makeAgent()];
      let callCount = 0;

      const ctx: TopologyContext = {
        task: { prompt: 'test' },
        config: { rows: 2, cols: 2, maxRounds: 2 },
        executeAgent: async () => {
          callCount++;
          // Return different output each time so changed=true triggers
          return `output-${callCount}`;
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('grid');
      // Init phase (4) + at least 1 refinement round (4 cells) = 8+
      expect(callCount).toBeGreaterThan(4);
    });
  });

  describe('Maker with voter failure', () => {
    it('should handle rejected vote promise (line 327)', async () => {
      const topology = new MakerTopology();
      const agents = [
        makeAgent({ role: 'proposer' }),
        makeAgent({ role: 'voter1' }),
        makeAgent({ role: 'voter2' }),
      ];

      const ctx: TopologyContext = {
        task: { prompt: 'design' },
        config: { maxRounds: 1 },
        executeAgent: async (agent) => {
          if (agent.role === 'proposer') return 'my proposal';
          if (agent.role === 'voter1') throw new Error('voter-crashed');
          return JSON.stringify({ approved: true, feedback: 'ok' });
        },
      };

      const result = await topology.run(agents, msgHub, ctx);
      expect(result.topology).toBe('maker');
    });
  });
});
