// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Workflow Converter
 *
 * Converts a WorkflowDocument into a TeamDesign that the existing
 * Forge / SwarmEngine pipeline can execute.
 *
 * Mapping strategy:
 *   - Each agent node → one AgentRole
 *   - Tool nodes attached to an agent inherit that agent's tools list
 *   - Graph shape → topology:
 *       single chain        → sequential
 *       fan-out from start  → parallel
 *       condition branches  → pipeline (with control hints in metadata)
 *       loop nodes present  → pipeline
 *       merge nodes         → parallel → then pipeline
 *   - Human-approval, condition, loop, merge, transform nodes add
 *     control-flow metadata into the TeamDesign reasoning string
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-2: Converter is pure — no side effects.
 */

import type { TeamDesign, AgentRole } from '../types/common.js';
import type {
  WorkflowDocument,
  WorkflowNode,
  WorkflowEdge,
} from '../types/phase21.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface WorkflowConverter {
  convert(doc: WorkflowDocument): TeamDesign;
}

// ---------------------------------------------------------------------------
// Internal Graph Helpers
// ---------------------------------------------------------------------------

function buildAdjacency(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, readonly string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.sourceNodeId)?.push(e.targetNodeId);
  }
  return new Map([...adj.entries()].map(([k, v]) => [k, v]));
}

function buildReverseAdjacency(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, readonly string[]> {
  const radj = new Map<string, string[]>();
  for (const n of nodes) radj.set(n.id, []);
  for (const e of edges) {
    radj.get(e.targetNodeId)?.push(e.sourceNodeId);
  }
  return new Map([...radj.entries()].map(([k, v]) => [k, v]));
}

/**
 * Detect topology from graph structure.
 * Returns one of: 'sequential', 'parallel', 'pipeline'.
 */
function detectTopology(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
  adj: Map<string, readonly string[]>,
): string {
  const hasCondition = nodes.some((n) => n.type === 'condition');
  const hasLoop = nodes.some((n) => n.type === 'loop');
  const hasMerge = nodes.some((n) => n.type === 'merge');
  const hasHumanApproval = nodes.some((n) => n.type === 'human_approval');

  if (hasCondition || hasLoop || hasMerge || hasHumanApproval) {
    return 'pipeline';
  }

  // Detect fan-out: any node has >1 outgoing edges
  const hasFanOut = [...adj.values()].some((targets) => targets.length > 1);
  if (hasFanOut) return 'parallel';

  // Default: sequential chain
  return 'sequential';
}

/**
 * Topological sort (Kahn's algorithm) — returns nodes in execution order.
 * Skips loop_back edges to avoid cycles.
 */
function topoSort(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): WorkflowNode[] {
  const filteredEdges = edges.filter((e) => e.targetPortId !== 'loop_back');
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const e of filteredEdges) {
    inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) ?? 0) + 1);
    adj.get(e.sourceNodeId)?.push(e.targetNodeId);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: WorkflowNode[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);

    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Role Builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(node: WorkflowNode): string {
  const base = (node.config['systemPrompt'] as string | undefined) ?? 'You are a helpful assistant.';
  return base;
}

function extractTools(node: WorkflowNode): readonly string[] {
  const rawTools = node.config['tools'];
  if (Array.isArray(rawTools)) {
    return rawTools.filter((t): t is string => typeof t === 'string');
  }
  return [];
}

/**
 * Build an AgentRole from an agent node.
 * Merges tools from adjacent tool nodes into the agent's tool list.
 */
function buildAgentRole(
  node: WorkflowNode,
  adjacentToolNodes: readonly WorkflowNode[],
  dependsOn: readonly string[],
): AgentRole {
  const agentTools = extractTools(node);
  const toolNodeTools = adjacentToolNodes.flatMap((tn) => extractTools(tn));
  const allTools = [...new Set([...agentTools, ...toolNodeTools])];

  return {
    role: (node.config['name'] as string | undefined) ?? node.label,
    model: (node.config['model'] as string | undefined) ?? 'claude-sonnet-4-6',
    systemPrompt: buildSystemPrompt(node),
    tools: allTools,
    dependsOn,
  };
}

/**
 * Build a descriptive AgentRole for non-agent nodes that influence execution.
 * These are represented as lightweight pass-through roles with clear prompts.
 */
function buildControlRole(node: WorkflowNode, dependsOn: readonly string[]): AgentRole {
  let systemPrompt: string;
  let role: string;

  switch (node.type) {
    case 'condition':
      role = `Condition:${node.label}`;
      systemPrompt = `Evaluate the following condition: "${node.config['expression'] ?? ''}". Reply with ONLY "true" or "false" based on the input.`;
      break;
    case 'transform':
      role = `Transform:${node.label}`;
      systemPrompt = `Apply this transformation to the input: ${node.config['expression'] ?? '{{output}}'}. Return only the transformed result.`;
      break;
    case 'human_approval':
      role = `HumanApproval:${node.label}`;
      systemPrompt = `Simulate human approval for: "${node.config['instructions'] ?? 'Review and approve or reject.'}". Reply with APPROVED or REJECTED with a brief reason.`;
      break;
    case 'merge':
      role = `Merge:${node.label}`;
      systemPrompt = `Combine the inputs using strategy "${node.config['strategy'] ?? 'concat'}". Produce a single unified output.`;
      break;
    case 'loop':
      role = `Loop:${node.label}`;
      systemPrompt = `Iterate using "${node.config['loopType'] ?? 'forEach'}" strategy, up to ${node.config['maxIterations'] ?? 10} iterations. Process each item and return results.`;
      break;
    default:
      role = node.label;
      systemPrompt = 'Process the input and return the result.';
  }

  return { role, model: 'claude-sonnet-4-6', systemPrompt, tools: [], dependsOn };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class WorkflowConverterImpl implements WorkflowConverter {
  convert(doc: WorkflowDocument): TeamDesign {
    const { nodes, edges } = doc;

    if (nodes.length === 0) {
      return {
        id: generateId(),
        taskType: 'workflow',
        topology: 'sequential',
        agents: [],
        reasoning: 'Empty workflow — no nodes to convert.',
        estimatedCostUsd: 0,
        version: 1,
      };
    }

    const adj = buildAdjacency(nodes, edges);
    const radj = buildReverseAdjacency(nodes, edges);
    const topology = detectTopology(nodes, edges, adj);

    // Sort nodes in execution order
    const sorted = topoSort(nodes, edges);

    // Identify tool nodes that are direct successors of agent nodes
    // They are "absorbed" into the agent role
    const toolNodeIds = new Set(nodes.filter((n) => n.type === 'tool').map((n) => n.id));
    const absorbedToolIds = new Set<string>();

    const roles: AgentRole[] = [];
    const nodeToRoleName = new Map<string, string>();

    for (const node of sorted) {
      // Skip start and output nodes — they are structural, not agent roles
      if (node.type === 'start' || node.type === 'output') continue;

      // Skip tool nodes that will be absorbed into an upstream agent
      if (absorbedToolIds.has(node.id)) continue;

      // For agent nodes: gather adjacent tool nodes
      let adjacentToolNodes: WorkflowNode[] = [];
      if (node.type === 'agent') {
        const successors = adj.get(node.id) ?? [];
        adjacentToolNodes = successors
          .filter((id) => toolNodeIds.has(id))
          .map((id) => nodes.find((n) => n.id === id)!)
          .filter(Boolean);

        for (const tn of adjacentToolNodes) {
          absorbedToolIds.add(tn.id);
        }
      }

      // Compute dependsOn: predecessor roles that are not start/output/tool
      const predecessors = radj.get(node.id) ?? [];
      const dependsOn: string[] = [];
      for (const predId of predecessors) {
        const predNode = nodes.find((n) => n.id === predId);
        if (!predNode || predNode.type === 'start') continue;
        const predRole = nodeToRoleName.get(predId);
        if (predRole) dependsOn.push(predRole);
      }

      const role = node.type === 'agent'
        ? buildAgentRole(node, adjacentToolNodes, dependsOn)
        : buildControlRole(node, dependsOn);

      roles.push(role);
      nodeToRoleName.set(node.id, role.role);
    }

    // Build reasoning string describing the conversion
    const controlNodes = nodes.filter((n) => !['start', 'output', 'agent', 'tool'].includes(n.type));
    const controlSummary = controlNodes.length > 0
      ? ` Control flow: ${controlNodes.map((n) => `${n.type}(${n.label})`).join(', ')}.`
      : '';

    const reasoning =
      `Converted workflow "${doc.name}" to ${topology} topology with ${roles.length} roles.` +
      ` Nodes: ${nodes.length}, Edges: ${edges.length}.${controlSummary}`;

    return {
      id: generateId(),
      taskType: 'workflow',
      topology,
      agents: roles,
      reasoning,
      estimatedCostUsd: doc.metadata.estimatedCostUsd,
      version: doc.metadata.version,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowConverter(): WorkflowConverter {
  return new WorkflowConverterImpl();
}
