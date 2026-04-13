// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Experimental Topologies
 * circular, grid, forest, maker
 *
 * LLD: phase4-multi-agent-lld.md Section 2.5
 * REWRITE-SPEC: Section 7 rows 9-12
 */

import type { AgentInstance } from '../agent-registry.js';
import type { MsgHub, AgentMessage } from '../msghub.js';
import type { TopologyExecutor, TopologyContext } from './types.js';
import { buildSwarmResult } from './types.js';
import { generateId } from '../../utils/id.js';
import { now } from '../../utils/time.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(
  from: string,
  to: string,
  content: string,
  type: AgentMessage['type'],
): AgentMessage {
  return { id: generateId(), from, to, content, type, timestamp: now() };
}

// ---------------------------------------------------------------------------
// 9. Circular
// ---------------------------------------------------------------------------

export class CircularTopology implements TopologyExecutor {
  readonly name = 'circular';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const maxPasses = (context.config?.maxPasses as number) ?? 3;
    let currentInput = context.task.prompt;
    let previousPassOutput: string | null = null;
    const outputs: Record<string, string> = {};

    for (let pass = 1; pass <= maxPasses; pass++) {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const output = await context.executeAgent(agent, currentInput);
        outputs[agent.id] = output;

        const nextIndex = (i + 1) % agents.length;
        msgHub.send(
          agent.id,
          agents[nextIndex].id,
          makeMsg(agent.id, agents[nextIndex].id, output, 'result'),
        );
        currentInput = output;
      }

      // Stability check
      if (currentInput === previousPassOutput) break;
      previousPassOutput = currentInput;
    }

    return buildSwarmResult('circular', outputs, currentInput, agents, startMs);
  }

  getTerminationCondition() {
    return 'Max passes OR stable output';
  }

  getAggregationStrategy() {
    return 'Output after final pass';
  }
}

// ---------------------------------------------------------------------------
// 10. Grid
// ---------------------------------------------------------------------------

export class GridTopology implements TopologyExecutor {
  readonly name = 'grid';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const rows = (context.config?.rows as number) ?? Math.ceil(Math.sqrt(agents.length));
    const cols = (context.config?.cols as number) ?? Math.ceil(agents.length / rows);

    if (rows * cols > agents.length) {
      throw new Error(`Grid requires rows*cols <= agent count (got ${rows}*${cols}=${rows * cols} > ${agents.length})`);
    }

    // Build grid
    const grid: AgentInstance[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = agents[r * cols + c];
      }
    }

    const outputs = new Map<string, string>();

    // Phase 1 -- Initialize all agents in parallel
    const initResults = await Promise.allSettled(
      agents.slice(0, rows * cols).map((a) =>
        context.executeAgent(a, context.task.prompt),
      ),
    );
    for (let i = 0; i < initResults.length; i++) {
      const result = initResults[i];
      const agent = agents[i];
      outputs.set(agent.id, result.status === 'fulfilled' ? result.value : '');
    }

    // Phase 2 -- Iterative refinement
    const maxRounds = (context.config?.maxRounds as number) ?? 5;

    // M-18: Execute all cells in a round in parallel, then collect results.
    for (let round = 1; round <= maxRounds; round++) {
      let changed = false;

      // Build all cell promises for this round using current neighbor outputs
      const cellPromises: Promise<{ agent: AgentInstance; output: string }>[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const agent = grid[r][c];
          const neighbors: string[] = [];

          if (r > 0) neighbors.push(outputs.get(grid[r - 1][c].id) ?? '');
          if (r < rows - 1) neighbors.push(outputs.get(grid[r + 1][c].id) ?? '');
          if (c > 0) neighbors.push(outputs.get(grid[r][c - 1].id) ?? '');
          if (c < cols - 1) neighbors.push(outputs.get(grid[r][c + 1].id) ?? '');

          const prompt = `Your previous output:\n${outputs.get(agent.id)}\n\nNeighbor outputs:\n${neighbors.join('\n---\n')}\n\nRefine your output considering your neighbors.`;
          cellPromises.push(
            context.executeAgent(agent, prompt).then((output) => ({ agent, output })),
          );
        }
      }

      // Run all cells in parallel for this round
      const settled = await Promise.allSettled(cellPromises);
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          const { agent, output: newOutput } = result.value;
          if (newOutput !== outputs.get(agent.id)) {
            changed = true;
          }
          outputs.set(agent.id, newOutput);
        }
      }

      if (!changed) break;
    }

    const plainOutputs: Record<string, string> = {};
    for (const [k, v] of outputs.entries()) plainOutputs[k] = v;

    const bottomRight = grid[rows - 1][cols - 1];
    const aggregated = outputs.get(bottomRight.id) ?? '';

    return buildSwarmResult('grid', plainOutputs, aggregated, agents, startMs);
  }

  getTerminationCondition() {
    return 'All cells stable OR max rounds';
  }

  getAggregationStrategy() {
    return 'Bottom-right corner output';
  }
}

// ---------------------------------------------------------------------------
// 11. Forest
// ---------------------------------------------------------------------------

export class ForestTopology implements TopologyExecutor {
  readonly name = 'forest';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const outputs: Record<string, string> = {};

    // Build tree structure from dependencies
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const roleToId = new Map(agents.map((a) => [a.role, a.id]));
    const children = new Map<string, string[]>();
    const roots: string[] = [];

    for (const agent of agents) {
      const match = agent.systemPrompt.match(/DEPENDS_ON:\s*\[([^\]]*)\]/);
      const deps = match
        ? match[1].split(',').map((r) => r.trim()).filter(Boolean)
            .map((role) => roleToId.get(role)).filter(Boolean) as string[]
        : [];

      if (deps.length === 0) {
        roots.push(agent.id);
      } else {
        for (const dep of deps) {
          if (!children.has(dep)) children.set(dep, []);
          children.get(dep)!.push(agent.id);
        }
      }
    }

    /* v8 ignore next 4 -- fallback for fully cyclic deps: all agents have valid DEPENDS_ON forming a cycle, causing infinite recursion in executeTree; defensive guard */
    if (roots.length === 0) {
      // Treat all agents as independent roots
      for (const agent of agents) roots.push(agent.id);
    }

    // Recursive tree execution
    const executeTree = async (agentId: string): Promise<string> => {
      const childIds = children.get(agentId) ?? [];
      const agent = agentById.get(agentId)!;

      if (childIds.length === 0) {
        const output = await context.executeAgent(agent, context.task.prompt);
        outputs[agentId] = output;
        return output;
      }

      const childResults = await Promise.all(
        childIds.map((cid) => executeTree(cid)),
      );

      for (let i = 0; i < childIds.length; i++) {
        msgHub.send(
          childIds[i],
          agentId,
          makeMsg(childIds[i], agentId, childResults[i], 'result'),
        );
      }

      const prompt = `Synthesize these results from your child agents:\n\n${childResults.join('\n\n---\n\n')}\n\nOriginal task:\n${context.task.prompt}`;
      const output = await context.executeAgent(agent, prompt);
      outputs[agentId] = output;
      return output;
    };

    const treeResults = await Promise.all(
      roots.map((rootId) => executeTree(rootId)),
    );

    const aggregated = treeResults.join('\n\n=== Tree Boundary ===\n\n');

    return buildSwarmResult('forest', outputs, aggregated, agents, startMs);
  }

  getTerminationCondition() {
    return 'All tree roots complete';
  }

  getAggregationStrategy() {
    return 'Merged root outputs';
  }
}

// ---------------------------------------------------------------------------
// 12. Maker
// ---------------------------------------------------------------------------

export class MakerTopology implements TopologyExecutor {
  readonly name = 'maker';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    if (agents.length < 3) {
      throw new Error('Maker requires at least 3 agents (1 proposer + 2 voters)');
    }

    const startMs = performance.now();
    const proposer = agents[0];
    const voters = agents.slice(1);
    const maxRounds = (context.config?.maxRounds as number) ?? 5;
    const approvalThreshold = (context.config?.approvalThreshold as number) ?? 0.66;
    let currentProposal = '';
    let lastFeedback: string | null = null;
    const outputs: Record<string, string> = {};

    for (let round = 1; round <= maxRounds; round++) {
      // Phase 1 -- Propose
      if (round === 1) {
        currentProposal = await context.executeAgent(proposer, context.task.prompt);
      } else {
        currentProposal = await context.executeAgent(
          proposer,
          `Refine your proposal based on voter feedback:\n\nPrevious proposal:\n${currentProposal}\n\nFeedback:\n${lastFeedback}`,
        );
      }
      msgHub.send(
        proposer.id,
        'broadcast',
        makeMsg(proposer.id, 'broadcast', currentProposal, 'result'),
      );

      // Phase 2 -- Vote
      const voteResults = await Promise.allSettled(
        voters.map((voter) =>
          context.executeAgent(
            voter,
            `Evaluate this proposal. Respond with JSON: {"approved": true/false, "feedback": "..."}\n\n${currentProposal}`,
          ),
        ),
      );

      let approvals = 0;
      const feedbacks: string[] = [];

      for (let i = 0; i < voteResults.length; i++) {
        const result = voteResults[i];
        const voter = voters[i];
        let parsed: { approved: boolean; feedback: string };

        if (result.status === 'fulfilled') {
          try {
            parsed = JSON.parse(result.value);
          } catch {
            parsed = { approved: false, feedback: result.value };
          }
        } else {
          parsed = { approved: false, feedback: 'Vote failed' };
        }

        if (parsed.approved) approvals++;
        feedbacks.push(`${voter.role}: ${parsed.feedback}`);
        outputs[voter.id] = JSON.stringify(parsed);

        msgHub.send(
          voter.id,
          proposer.id,
          makeMsg(voter.id, proposer.id, JSON.stringify(parsed), 'feedback'),
        );
      }

      // Phase 3 -- Check majority
      const approvalRate = approvals / voters.length;
      if (approvalRate >= approvalThreshold) {
        outputs[proposer.id] = currentProposal;
        return buildSwarmResult('maker', outputs, currentProposal, agents, startMs);
      }

      lastFeedback = feedbacks.join('\n\n');
    }

    // Max rounds reached
    outputs[proposer.id] = currentProposal;
    return buildSwarmResult('maker', outputs, currentProposal, agents, startMs);
  }

  getTerminationCondition() {
    return 'Vote passes >66% OR max rounds';
  }

  getAggregationStrategy() {
    return 'Majority-approved proposal';
  }
}

export const experimentalTopologies: readonly TopologyExecutor[] = [
  new CircularTopology(),
  new GridTopology(),
  new ForestTopology(),
  new MakerTopology(),
];
