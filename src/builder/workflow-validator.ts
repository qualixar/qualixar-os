// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Workflow Validator
 *
 * Validates a WorkflowDocument before execution or conversion.
 * Returns a WorkflowValidationResult with errors and warnings.
 *
 * Checks:
 *   V1: Exactly 1 start node
 *   V2: At least 1 output node
 *   V3: No disconnected nodes (every non-start node reachable from start)
 *   V4: No cycles (except through loop nodes via loop_back port)
 *   V5: All edges reference valid nodes and ports
 *   V6: Connection matrix respected
 *   V7: Required config fields populated for each node
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-2: Validator is pure — no side effects.
 */

import type {
  WorkflowDocument,
  WorkflowNode,
  WorkflowEdge,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowValidationWarning,
} from '../types/phase21.js';
import { isConnectionAllowed } from './connection-matrix.js';
import { getNodeTypeDefinition } from './node-definitions.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface WorkflowValidator {
  validate(doc: WorkflowDocument): WorkflowValidationResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function error(
  code: string,
  message: string,
  nodeId: string | null = null,
  edgeId: string | null = null,
): WorkflowValidationError {
  return { code, message, nodeId, edgeId };
}

function warning(
  code: string,
  message: string,
  nodeId: string | null = null,
): WorkflowValidationWarning {
  return { code, message, nodeId };
}

// ---------------------------------------------------------------------------
// Graph Helpers
// ---------------------------------------------------------------------------

function buildAdjacency(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) {
    adj.set(n.id, new Set());
  }
  for (const e of edges) {
    adj.get(e.sourceNodeId)?.add(e.targetNodeId);
  }
  return adj;
}

function reachableFrom(startId: string, adj: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

/**
 * Detect cycles using DFS. loop_back edges are excluded from cycle detection
 * because loops are explicitly allowed to create back-edges via that port.
 */
function hasCycleExcludingLoopBack(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): boolean {
  // Build adjacency excluding loop_back edges
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());

  for (const e of edges) {
    if (e.targetPortId === 'loop_back') continue;
    adj.get(e.sourceNodeId)?.add(e.targetNodeId);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const neighbor of adj.get(id) ?? []) {
      if (color.get(neighbor) === GRAY) return true; // back-edge = cycle
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class WorkflowValidatorImpl implements WorkflowValidator {
  validate(doc: WorkflowDocument): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationWarning[] = [];

    const { nodes, edges } = doc;

    // Build lookup maps
    const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
    const portMap = new Map<string, Set<string>>();
    for (const n of nodes) {
      const ports = new Set([
        ...n.inputs.map((p) => p.id),
        ...n.outputs.map((p) => p.id),
      ]);
      portMap.set(n.id, ports);
    }

    // V1: Exactly 1 start node
    const startNodes = nodes.filter((n) => n.type === 'start');
    if (startNodes.length === 0) {
      errors.push(error('V1_NO_START', 'Workflow must have exactly one Start node.'));
    } else if (startNodes.length > 1) {
      for (const s of startNodes) {
        errors.push(error('V1_MULTIPLE_START', 'Only one Start node is allowed.', s.id));
      }
    }

    // V2: At least 1 output node
    const outputNodes = nodes.filter((n) => n.type === 'output');
    if (outputNodes.length === 0) {
      errors.push(error('V2_NO_OUTPUT', 'Workflow must have at least one Output node.'));
    }

    // V3: No disconnected nodes
    if (startNodes.length === 1) {
      const adj = buildAdjacency(nodes, edges);
      const reachable = reachableFrom(startNodes[0]!.id, adj);

      for (const n of nodes) {
        if (!reachable.has(n.id)) {
          errors.push(error(
            'V3_DISCONNECTED',
            `Node "${n.label}" (${n.id}) is not reachable from the Start node.`,
            n.id,
          ));
        }
      }
    }

    // V4: No cycles (except via loop_back)
    if (nodes.length > 0 && hasCycleExcludingLoopBack(nodes, edges)) {
      errors.push(error(
        'V4_CYCLE',
        'Workflow contains a cycle. Use Loop nodes with loop_back ports for intentional loops.',
      ));
    }

    // V5: All edges reference valid nodes and ports
    for (const e of edges) {
      const sourceNode = nodeMap.get(e.sourceNodeId);
      const targetNode = nodeMap.get(e.targetNodeId);

      if (!sourceNode) {
        errors.push(error('V5_INVALID_SOURCE_NODE', `Edge references missing source node: ${e.sourceNodeId}`, null, e.id));
        continue;
      }
      if (!targetNode) {
        errors.push(error('V5_INVALID_TARGET_NODE', `Edge references missing target node: ${e.targetNodeId}`, null, e.id));
        continue;
      }

      const sourcePorts = portMap.get(e.sourceNodeId) ?? new Set();
      const targetPorts = portMap.get(e.targetNodeId) ?? new Set();

      if (!sourcePorts.has(e.sourcePortId)) {
        errors.push(error(
          'V5_INVALID_SOURCE_PORT',
          `Edge source port "${e.sourcePortId}" does not exist on node "${sourceNode.label}".`,
          e.sourceNodeId,
          e.id,
        ));
      }
      if (!targetPorts.has(e.targetPortId)) {
        errors.push(error(
          'V5_INVALID_TARGET_PORT',
          `Edge target port "${e.targetPortId}" does not exist on node "${targetNode.label}".`,
          e.targetNodeId,
          e.id,
        ));
      }

      // V6: Connection matrix check
      if (!isConnectionAllowed(sourceNode.type, targetNode.type)) {
        errors.push(error(
          'V6_CONNECTION_MATRIX',
          `Connection from "${sourceNode.type}" to "${targetNode.type}" is not permitted.`,
          e.sourceNodeId,
          e.id,
        ));
      }
    }

    // V7: Required config fields
    for (const n of nodes) {
      const def = getNodeTypeDefinition(n.type);
      if (!def) {
        warnings.push(warning('V7_UNKNOWN_TYPE', `Unknown node type "${n.type}".`, n.id));
        continue;
      }

      for (const field of def.configSchema) {
        if (!field.required) continue;
        const value = n.config[field.name];
        const isEmpty = value === undefined || value === null || value === '';
        if (isEmpty) {
          errors.push(error(
            'V7_REQUIRED_CONFIG',
            `Node "${n.label}": required config field "${field.label}" is not set.`,
            n.id,
          ));
        }
      }
    }

    // Warnings: condition nodes with no outgoing edges
    for (const n of nodes) {
      if (n.type === 'condition') {
        const outgoing = edges.filter((e) => e.sourceNodeId === n.id);
        if (outgoing.length === 0) {
          warnings.push(warning('W1_CONDITION_NO_OUTPUTS', `Condition node "${n.label}" has no outgoing edges.`, n.id));
        } else {
          const hasTrueBranch = outgoing.some((e) => e.sourcePortId === 'true');
          const hasFalseBranch = outgoing.some((e) => e.sourcePortId === 'false');
          if (!hasTrueBranch) {
            warnings.push(warning('W1_CONDITION_MISSING_TRUE', `Condition node "${n.label}" has no "true" branch.`, n.id));
          }
          if (!hasFalseBranch) {
            warnings.push(warning('W1_CONDITION_MISSING_FALSE', `Condition node "${n.label}" has no "false" branch.`, n.id));
          }
        }
      }

      // Warning: isolated output node with no incoming edge
      if (n.type === 'output') {
        const incoming = edges.filter((e) => e.targetNodeId === n.id);
        if (incoming.length === 0) {
          warnings.push(warning('W2_OUTPUT_NO_INPUT', `Output node "${n.label}" has no incoming edges.`, n.id));
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWorkflowValidator(): WorkflowValidator {
  return new WorkflowValidatorImpl();
}
