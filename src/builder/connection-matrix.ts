// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Connection Matrix
 *
 * Defines which node type pairs may be connected via workflow edges.
 * Rules are derived from the Phase 21 LLD Section 3.2 (Connection Rules).
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-2: isConnectionAllowed is pure — no side effects.
 */

import type { ConnectionMatrix, WorkflowNodeType } from '../types/phase21.js';

// ---------------------------------------------------------------------------
// Node types list (kept in sync with WorkflowNodeType union)
// ---------------------------------------------------------------------------

const ALL_TYPES: readonly WorkflowNodeType[] = [
  'start', 'agent', 'tool', 'condition', 'loop',
  'human_approval', 'output', 'merge', 'transform',
];

// ---------------------------------------------------------------------------
// Connection Matrix
//
// connection[source][target] = true means an edge from source → target is allowed.
//
// Rules (from LLD Phase 21 Section 3.2):
//   R1: start can connect to any node except another start
//   R2: output cannot have outgoing edges (no source connections)
//   R3: loop may loop back to itself (loop → loop allowed)
//   R4: condition connects to any target except start
//   R5: merge requires exactly its in_a / in_b inputs from non-start nodes
//   R6: all other types connect freely except to start
// ---------------------------------------------------------------------------

function buildMatrix(): ConnectionMatrix {
  const matrix: Record<WorkflowNodeType, Record<WorkflowNodeType, boolean>> = {} as never;

  for (const source of ALL_TYPES) {
    matrix[source] = {} as Record<WorkflowNodeType, boolean>;
    for (const target of ALL_TYPES) {
      // Default: disallow, then apply rules
      matrix[source][target] = false;
    }
  }

  // R2: output has NO outgoing connections — stays all false in matrix[output]
  // (handled by default false above)

  for (const source of ALL_TYPES) {
    if (source === 'output') {
      // R2: output cannot be a source — skip, all false
      continue;
    }

    for (const target of ALL_TYPES) {
      if (source === 'start') {
        // R1: start connects to anything except another start
        matrix[source][target] = target !== 'start';
      } else if (source === 'condition') {
        // R4: condition connects to anything except start
        matrix[source][target] = target !== 'start';
      } else if (source === 'loop') {
        // R3: loop connects to anything except start, and may loop to itself
        matrix[source][target] = target !== 'start';
      } else {
        // R6: agent, tool, human_approval, merge, transform connect freely except to start
        matrix[source][target] = target !== 'start';
      }
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(matrix).map(([k, v]) => [k, Object.freeze(v)]),
    ),
  ) as ConnectionMatrix;
}

export const CONNECTION_MATRIX: ConnectionMatrix = buildMatrix();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if an edge from sourceType → targetType is permitted
 * by the connection matrix.
 *
 * @param sourceType - The WorkflowNodeType of the source node
 * @param targetType - The WorkflowNodeType of the target node
 */
export function isConnectionAllowed(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
): boolean {
  return CONNECTION_MATRIX[sourceType]?.[targetType] ?? false;
}
