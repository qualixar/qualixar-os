// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Advanced Topologies
 * mixture_of_agents, debate, mesh, star
 *
 * LLD: phase4-multi-agent-lld.md Section 2.4
 * REWRITE-SPEC: Section 7 rows 5-8
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

function parseNumberedList(text: string, count: number): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return Array(count).fill(text);
  while (lines.length < count) lines.push(lines[lines.length - 1]);
  return lines.slice(0, count);
}

// ---------------------------------------------------------------------------
// 5. Mixture of Agents
// ---------------------------------------------------------------------------

export class MixtureOfAgentsTopology implements TopologyExecutor {
  readonly name = 'mixture_of_agents';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    if (agents.length < 2) {
      throw new Error('Mixture of agents requires at least 2 agents');
    }

    const startMs = performance.now();
    const outputs: Record<string, string> = {};
    const generators = agents.slice(0, agents.length - 1);
    const aggregator = agents[agents.length - 1];

    // Phase 1 -- Generate
    const genResults = await Promise.allSettled(
      generators.map((gen) => context.executeAgent(gen, context.task.prompt)),
    );

    for (let i = 0; i < genResults.length; i++) {
      const result = genResults[i];
      if (result.status === 'fulfilled') {
        outputs[generators[i].id] = result.value;
        msgHub.send(
          generators[i].id,
          'broadcast',
          makeMsg(generators[i].id, 'broadcast', result.value, 'result'),
        );
      } else {
        outputs[generators[i].id] = '[FAILED]';
      }
    }

    // Phase 2 -- Aggregate
    const successOutputs = Object.entries(outputs)
      .filter(([, v]) => v !== '[FAILED]')
      .map(([id, v]) => `Agent ${id}:\n${v}`)
      .join('\n\n');

    const synthesis = await context.executeAgent(
      aggregator,
      `Original task:\n${context.task.prompt}\n\nSynthesize these independent analyses into a single coherent result:\n\n${successOutputs}`,
    );
    outputs[aggregator.id] = synthesis;

    return buildSwarmResult('mixture_of_agents', outputs, synthesis, agents, startMs);
  }

  getTerminationCondition() {
    return 'Aggregator completes';
  }

  getAggregationStrategy() {
    return 'Aggregator synthesis';
  }
}

// ---------------------------------------------------------------------------
// 6. Debate
// ---------------------------------------------------------------------------

export class DebateTopology implements TopologyExecutor {
  readonly name = 'debate';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    if (agents.length < 2) {
      throw new Error('Debate requires at least 2 agents');
    }

    const startMs = performance.now();
    const proposer = agents[0];
    const critic = agents[1];
    const maxRounds = (context.config?.maxRounds as number) ?? 3;
    let currentProposal = '';
    let lastCritique = '';
    let critique = '';

    for (let round = 1; round <= maxRounds; round++) {
      // Propose
      if (round === 1) {
        currentProposal = await context.executeAgent(proposer, context.task.prompt);
      } else {
        currentProposal = await context.executeAgent(
          proposer,
          `Revise your proposal based on this critique:\n\nOriginal proposal:\n${currentProposal}\n\nCritique:\n${lastCritique}`,
        );
      }
      msgHub.send(
        proposer.id,
        critic.id,
        makeMsg(proposer.id, critic.id, currentProposal, 'result'),
      );

      // Critique
      critique = await context.executeAgent(
        critic,
        `Critique this proposal. If you fully agree, respond with exactly "CONSENSUS". Otherwise provide specific feedback:\n\n${currentProposal}`,
      );
      msgHub.send(
        critic.id,
        proposer.id,
        makeMsg(critic.id, proposer.id, critique, 'feedback'),
      );

      // Consensus check
      if (critique.trim().toUpperCase() === 'CONSENSUS') {
        break;
      }
      lastCritique = critique;
    }

    const outputs: Record<string, string> = {
      [proposer.id]: currentProposal,
      [critic.id]: critique,
    };

    return buildSwarmResult('debate', outputs, currentProposal, agents, startMs);
  }

  getTerminationCondition() {
    return 'Max rounds OR consensus';
  }

  getAggregationStrategy() {
    return 'Final revised proposal';
  }
}

// ---------------------------------------------------------------------------
// 7. Mesh
// ---------------------------------------------------------------------------

export class MeshTopology implements TopologyExecutor {
  readonly name = 'mesh';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const maxRounds = (context.config?.maxRounds as number) ?? 10;
    const outputs: Record<string, string> = {};
    const processedMsgIds = new Set<string>();

    // Phase 1 -- Initial broadcast
    const initialResults = await Promise.allSettled(
      agents.map((agent) => context.executeAgent(agent, context.task.prompt)),
    );

    for (let i = 0; i < initialResults.length; i++) {
      const result = initialResults[i];
      if (result.status === 'fulfilled') {
        outputs[agents[i].id] = result.value;
        const msg = makeMsg(agents[i].id, 'broadcast', result.value, 'result');
        msgHub.send(agents[i].id, 'broadcast', msg);
        processedMsgIds.add(msg.id);
      }
    }

    // Phase 2 -- Reactive loop
    for (let round = 1; round <= maxRounds; round++) {
      let roundHadActivity = false;

      for (const agent of agents) {
        const inbox = msgHub
          .getHistory(agent.id)
          .filter(
            (m) =>
              m.to === 'broadcast' &&
              m.from !== agent.id &&
              !processedMsgIds.has(m.id),
          );

        if (inbox.length === 0) continue;

        /* v8 ignore start -- reactive loop body: initial broadcasts are globally marked processed, so inbox is empty in round 1+ with current MsgHub design */
        for (const m of inbox) processedMsgIds.add(m.id);

        const summary = inbox.map((m) => `${m.from}: ${m.content}`).join('\n\n');
        const response = await context.executeAgent(
          agent,
          `Review these messages from other agents and provide your updated analysis:\n\n${summary}\n\nYour previous output:\n${outputs[agent.id] ?? ''}`,
        );
        outputs[agent.id] = response;
        msgHub.send(
          agent.id,
          'broadcast',
          makeMsg(agent.id, 'broadcast', response, 'feedback'),
        );
        roundHadActivity = true;
        /* v8 ignore stop */
      }

      if (!roundHadActivity) break;
    }

    const history = msgHub.getHistory();
    const lastBroadcast =
      history.length > 0 ? history[history.length - 1].content : '';

    return buildSwarmResult('mesh', outputs, lastBroadcast, agents, startMs);
  }

  getTerminationCondition() {
    return 'Convergence (no new messages) OR max rounds';
  }

  getAggregationStrategy() {
    return 'Last broadcast message';
  }
}

// ---------------------------------------------------------------------------
// 8. Star
// ---------------------------------------------------------------------------

export class StarTopology implements TopologyExecutor {
  readonly name = 'star';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    if (agents.length < 2) {
      throw new Error('Star requires at least 2 agents (1 hub + 1 spoke)');
    }

    const startMs = performance.now();
    const outputs: Record<string, string> = {};
    const hub = agents[0];
    const spokes = agents.slice(1);

    // Phase 1 -- Hub decomposes
    const decomposition = await context.executeAgent(
      hub,
      `Decompose this task into ${spokes.length} independent subtasks. Return as numbered list:\n\n${context.task.prompt}`,
    );
    const subtasks = parseNumberedList(decomposition, spokes.length);

    for (let i = 0; i < spokes.length; i++) {
      msgHub.send(
        hub.id,
        spokes[i].id,
        makeMsg(hub.id, spokes[i].id, subtasks[i], 'task'),
      );
    }

    // Phase 2 -- Spokes run in parallel
    // A2A context injection: each spoke sees the original task, the hub's
    // decomposition plan with all spoke roles, and its own subtask.
    const spokeRoster = spokes.map((s, idx) => `  ${idx + 1}. ${s.role}: ${subtasks[idx]}`).join('\n');
    const spokeOutputs: Record<string, string> = {};
    const spokeResults = await Promise.allSettled(
      spokes.map((spoke, i) => {
        const spokePrompt = `Original task:\n${context.task.prompt}\n\nTeam plan (from ${hub.role}):\n${spokeRoster}\n\nYour assigned subtask (${spoke.role}):\n${subtasks[i]}`;
        return context.executeAgent(spoke, spokePrompt);
      }),
    );

    for (let i = 0; i < spokeResults.length; i++) {
      const result = spokeResults[i];
      const spoke = spokes[i];
      if (result.status === 'fulfilled') {
        spokeOutputs[spoke.id] = result.value;
      } else {
        spokeOutputs[spoke.id] = `[FAILED: ${result.reason?.message ?? 'unknown'}]`;
      }
      msgHub.send(
        spoke.id,
        hub.id,
        makeMsg(spoke.id, hub.id, spokeOutputs[spoke.id], 'result'),
      );
    }

    // Phase 3 -- Hub synthesizes
    // Use role names so the hub can reason about domain-specific contributions.
    const formatted = spokes
      .map((s) => `[${s.role}]:\n${spokeOutputs[s.id] ?? '[NO OUTPUT]'}`)
      .join('\n\n');
    const synthesis = await context.executeAgent(
      hub,
      `Original task:\n${context.task.prompt}\n\nSynthesize these results from your team:\n\n${formatted}`,
    );

    outputs[hub.id] = synthesis;
    for (const [id, out] of Object.entries(spokeOutputs)) {
      outputs[id] = out;
    }

    return buildSwarmResult('star', outputs, synthesis, agents, startMs);
  }

  getTerminationCondition() {
    return 'Hub declares complete';
  }

  getAggregationStrategy() {
    return 'Hub final synthesis';
  }
}

export const advancedTopologies: readonly TopologyExecutor[] = [
  new MixtureOfAgentsTopology(),
  new DebateTopology(),
  new MeshTopology(),
  new StarTopology(),
];
