// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Basic Topologies
 * sequential, parallel, hierarchical, dag
 *
 * LLD: phase4-multi-agent-lld.md Section 2.3
 * REWRITE-SPEC: Section 7 rows 1-4
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

function makeMessage(
  from: string,
  to: string,
  content: string,
  type: AgentMessage['type'],
): AgentMessage {
  return { id: generateId(), from, to, content, type, timestamp: now() };
}

function parseSubtasks(decomposition: string, count: number): string[] {
  const lines = decomposition
    .split('\n')
    .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return Array(count).fill(decomposition);
  }

  while (lines.length < count) {
    lines.push(lines[lines.length - 1]);
  }
  return lines.slice(0, count);
}

// ---------------------------------------------------------------------------
// 1. Sequential
// ---------------------------------------------------------------------------

export class SequentialTopology implements TopologyExecutor {
  readonly name = 'sequential';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const outputs: Record<string, string> = {};
    let currentInput = context.task.prompt;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];

      // A2A context injection: downstream agents receive the original task plus
      // the prior agent's output so they understand the full pipeline context.
      const prompt = i === 0
        ? currentInput
        : `Original task:\n${context.task.prompt}\n\nOutput from ${agents[i - 1].role} (step ${i} of ${agents.length}):\n${currentInput}\n\nYou are ${agent.role} (step ${i + 1} of ${agents.length}). Build on the previous agent's work.`;

      const output = await context.executeAgent(agent, prompt);
      outputs[agent.id] = output;

      if (i < agents.length - 1) {
        const msg = makeMessage(agent.id, agents[i + 1].id, output, 'result');
        msgHub.send(agent.id, agents[i + 1].id, msg);
      }
      currentInput = output;
    }

    const aggregated = outputs[agents[agents.length - 1].id] ?? '';
    return buildSwarmResult('sequential', outputs, aggregated, agents, startMs);
  }

  getTerminationCondition() {
    return 'Last agent completes';
  }

  getAggregationStrategy() {
    return 'Last agent output';
  }
}

// ---------------------------------------------------------------------------
// 2. Parallel
// ---------------------------------------------------------------------------

export class ParallelTopology implements TopologyExecutor {
  readonly name = 'parallel';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const outputs: Record<string, string> = {};

    const results = await Promise.allSettled(
      agents.map((agent) => context.executeAgent(agent, context.task.prompt)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        outputs[agents[i].id] = result.value;
        const msg = makeMessage(agents[i].id, 'broadcast', result.value, 'result');
        msgHub.send(agents[i].id, 'broadcast', msg);
      } else {
        outputs[agents[i].id] = `[ERROR: ${result.reason?.message ?? 'unknown'}]`;
      }
    }

    const aggregated = Object.values(outputs)
      .filter((o) => !o.startsWith('[ERROR'))
      .join('\n\n---\n\n');

    return buildSwarmResult('parallel', outputs, aggregated, agents, startMs);
  }

  getTerminationCondition() {
    return 'All agents complete (Promise.allSettled)';
  }

  getAggregationStrategy() {
    return 'Concatenated outputs';
  }
}

// ---------------------------------------------------------------------------
// 3. Hierarchical
// ---------------------------------------------------------------------------

export class HierarchicalTopology implements TopologyExecutor {
  readonly name = 'hierarchical';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    if (agents.length < 2) {
      throw new Error('Hierarchical requires at least 2 agents (1 manager + 1 worker)');
    }

    const startMs = performance.now();
    const outputs: Record<string, string> = {};
    const manager = agents[0];
    const workers = agents.slice(1);

    // Phase 1 -- Decompose
    const decomposition = await context.executeAgent(
      manager,
      `Decompose this task into subtasks for ${workers.length} workers:\n\n${context.task.prompt}`,
    );
    outputs[manager.id] = decomposition;
    const subtasks = parseSubtasks(decomposition, workers.length);

    // Phase 2 -- Worker execution (parallel)
    // A2A context injection: each worker sees the original task, the full team
    // roster, the manager's decomposition strategy, and its own subtask.
    // This lets agents like backend_engineer know frontend_engineer exists.
    const teamRoster = workers.map((w, idx) => `  ${idx + 1}. ${w.role}: ${subtasks[idx]}`).join('\n');
    const workerOutputs: Record<string, string> = {};
    const workerResults = await Promise.allSettled(
      workers.map((worker, i) => {
        const subtask = subtasks[i];
        msgHub.send(manager.id, worker.id, makeMessage(manager.id, worker.id, subtask, 'task'));
        const workerPrompt = `Original task:\n${context.task.prompt}\n\nTeam plan (from ${manager.role}):\n${teamRoster}\n\nYour assigned subtask (${worker.role}):\n${subtask}`;
        return context.executeAgent(worker, workerPrompt);
      }),
    );

    for (let i = 0; i < workerResults.length; i++) {
      const result = workerResults[i];
      const worker = workers[i];
      if (result.status === 'fulfilled') {
        workerOutputs[worker.id] = result.value;
        outputs[worker.id] = result.value;
        msgHub.send(worker.id, manager.id, makeMessage(worker.id, manager.id, result.value, 'result'));
      } else {
        workerOutputs[worker.id] = `[ERROR: ${result.reason?.message ?? 'unknown'}]`;
        outputs[worker.id] = workerOutputs[worker.id];
      }
    }

    // Phase 3 -- Manager review
    // Use role names instead of opaque UUIDs so the manager can reason about
    // which agent produced what (e.g., "backend_engineer" vs "frontend_engineer").
    const formatted = workers
      .map((w) => `[${w.role}]:\n${workerOutputs[w.id] ?? '[NO OUTPUT]'}`)
      .join('\n\n');
    const merged = await context.executeAgent(
      manager,
      `Original task:\n${context.task.prompt}\n\nReview and merge these worker outputs into a cohesive result:\n\n${formatted}`,
    );
    outputs[manager.id] = merged;

    return buildSwarmResult('hierarchical', outputs, merged, agents, startMs);
  }

  getTerminationCondition() {
    return 'Manager approves merged result';
  }

  getAggregationStrategy() {
    return 'Manager merged result';
  }
}

// ---------------------------------------------------------------------------
// 4. DAG
// ---------------------------------------------------------------------------

export class DAGTopology implements TopologyExecutor {
  readonly name = 'dag';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
  ) {
    const startMs = performance.now();
    const outputs: Record<string, string> = {};

    // Build adjacency list
    const agentMap = new Map(agents.map((a) => [a.role, a]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const agent of agents) {
      const deps = agent.role ? (agents.find((a) => a.id === agent.id)?.tools ?? []) : [];
      // Use dependsOn from the role spec stored in agent system prompt context
      inDegree.set(agent.id, 0);
      adjacency.set(agent.id, []);
    }

    // Build dependency graph using agent index-based dependencies
    const agentDeps = this._extractDependencies(agents);
    for (const [agentId, deps] of agentDeps.entries()) {
      inDegree.set(agentId, deps.length);
      for (const dep of deps) {
        /* v8 ignore next 3 -- all agent IDs pre-populated in adjacency from initial loop */
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(agentId);
      }
    }

    // Topological sort with levels
    const levels: string[][] = [];
    let currentLevel = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id);

    let processed = 0;

    while (currentLevel.length > 0) {
      levels.push([...currentLevel]);
      const nextLevel: string[] = [];

      // Execute current level in parallel
      const levelResults = await Promise.allSettled(
        currentLevel.map((agentId) => {
          const agent = agents.find((a) => a.id === agentId)!;
          // A2A context injection: include role names with dependency outputs
          // so agents know which upstream agent produced each result.
          const depEntries = (agentDeps.get(agentId) ?? [])
            .map((dep) => {
              const depAgent = agents.find((a) => a.id === dep);
              const depRole = depAgent?.role ?? dep;
              return outputs[dep] ? `[${depRole}]:\n${outputs[dep]}` : null;
            })
            .filter(Boolean);
          const prompt = depEntries.length > 0
            ? `${context.task.prompt}\n\nOutputs from upstream agents:\n${depEntries.join('\n\n---\n\n')}`
            : context.task.prompt;
          return context.executeAgent(agent, prompt);
        }),
      );

      for (let i = 0; i < levelResults.length; i++) {
        const agentId = currentLevel[i];
        const result = levelResults[i];
        processed++;

        if (result.status === 'fulfilled') {
          outputs[agentId] = result.value;
          for (const downstream of adjacency.get(agentId) ?? []) {
            const msg = makeMessage(agentId, downstream, result.value, 'result');
            msgHub.send(agentId, downstream, msg);
          }
        } else {
          outputs[agentId] = `[ERROR: ${result.reason?.message ?? 'unknown'}]`;
        }

        for (const neighbor of adjacency.get(agentId) ?? []) {
          const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0) {
            nextLevel.push(neighbor);
          }
        }
      }

      currentLevel = nextLevel;
    }

    if (processed !== agents.length) {
      throw new Error('DAG contains cycles');
    }

    // Leaf nodes = agents with no outgoing edges
    const leafNodes = agents.filter(
      (a) => (adjacency.get(a.id) ?? []).length === 0,
    );
    const aggregated = leafNodes
      .map((a) => outputs[a.id])
      .filter(Boolean)
      .join('\n\n---\n\n');

    return buildSwarmResult('dag', outputs, aggregated, agents, startMs);
  }

  getTerminationCondition() {
    return 'All leaf nodes complete';
  }

  getAggregationStrategy() {
    return 'Leaf outputs merged';
  }

  // TODO: Migrate to explicit dependsOn field in agent role spec (audit finding L-15)
  // Current approach parses DEPENDS_ON from system prompt regex — fragile if prompt format changes.
  private _extractDependencies(
    agents: readonly AgentInstance[],
  ): Map<string, string[]> {
    const deps = new Map<string, string[]>();
    const roleToId = new Map<string, string>();
    for (const agent of agents) {
      roleToId.set(agent.role, agent.id);
    }
    for (const agent of agents) {
      // Parse dependsOn from tools field (used as dependency carrier)
      const agentDeps: string[] = [];
      // Check if systemPrompt contains DEPENDS_ON markers
      const match = agent.systemPrompt.match(/DEPENDS_ON:\s*\[([^\]]*)\]/);
      if (match) {
        const roles = match[1].split(',').map((r) => r.trim()).filter(Boolean);
        for (const role of roles) {
          const id = roleToId.get(role);
          if (id) agentDeps.push(id);
        }
      }
      deps.set(agent.id, agentDeps);
    }
    return deps;
  }
}

export const basicTopologies: readonly TopologyExecutor[] = [
  new SequentialTopology(),
  new ParallelTopology(),
  new HierarchicalTopology(),
  new DAGTopology(),
];
