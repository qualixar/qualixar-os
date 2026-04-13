/**
 * Qualixar OS Phase 21 -- Auto Layout Tests
 *
 * Tests for autoLayout() covering sequential, parallel, and default position rules.
 * HR-2: autoLayout is pure — input nodes are never mutated.
 */

import { describe, it, expect } from 'vitest';
import { autoLayout } from '../../src/builder/auto-layout.js';
import type { WorkflowNode, WorkflowEdge } from '../../src/types/phase21.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, type: WorkflowNode['type'] = 'agent'): WorkflowNode {
  return {
    id,
    type,
    label: id,
    position: { x: 0, y: 0 },
    config: {},
    inputs: [],
    outputs: [],
    size: { width: 200, height: 80 },
  };
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): WorkflowEdge {
  return {
    id,
    sourceNodeId,
    sourcePortId: 'out',
    targetNodeId,
    targetPortId: 'in',
    label: null,
    condition: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('autoLayout()', () => {
  it('sequential layout positions nodes left-to-right (increasing x)', () => {
    const nodes: WorkflowNode[] = [
      makeNode('n1', 'start'),
      makeNode('n2', 'agent'),
      makeNode('n3', 'output'),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge('e1', 'n1', 'n2'),
      makeEdge('e2', 'n2', 'n3'),
    ];

    const laid = autoLayout(nodes, edges, 'sequential');
    const positions = laid.map((n) => n.position);

    // Verify strictly increasing x across the chain
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
    expect(positions[1]!.x).toBeLessThan(positions[2]!.x);
  });

  it('parallel layout fans out vertically from the start node', () => {
    const nodes: WorkflowNode[] = [
      makeNode('n-start', 'start'),
      makeNode('n-a', 'agent'),
      makeNode('n-b', 'agent'),
      makeNode('n-out', 'output'),
    ];
    // start fans into two parallel branches
    const edges: WorkflowEdge[] = [
      makeEdge('e1', 'n-start', 'n-a'),
      makeEdge('e2', 'n-start', 'n-b'),
      makeEdge('e3', 'n-a', 'n-out'),
    ];

    const laid = autoLayout(nodes, edges, 'parallel');
    const posA = laid.find((n) => n.id === 'n-a')!.position;
    const posB = laid.find((n) => n.id === 'n-b')!.position;

    // Parallel branches must be on different vertical lanes
    expect(posA.y).not.toBe(posB.y);
    // Both children are to the right of the start node
    const startPos = laid.find((n) => n.id === 'n-start')!.position;
    expect(posA.x).toBeGreaterThan(startPos.x);
    expect(posB.x).toBeGreaterThan(startPos.x);
  });

  it('all nodes receive valid positions (x >= 0 and y >= 0)', () => {
    const nodes: WorkflowNode[] = [
      makeNode('n1', 'start'),
      makeNode('n2', 'agent'),
      makeNode('n3', 'condition'),
      makeNode('n4', 'output'),
    ];
    const edges: WorkflowEdge[] = [
      makeEdge('e1', 'n1', 'n2'),
      makeEdge('e2', 'n2', 'n3'),
      makeEdge('e3', 'n3', 'n4'),
    ];

    const laid = autoLayout(nodes, edges);
    for (const n of laid) {
      expect(n.position.x).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('single node returns with a defined position', () => {
    const nodes: WorkflowNode[] = [makeNode('only', 'start')];
    const laid = autoLayout(nodes, [], 'sequential');
    expect(laid).toHaveLength(1);
    expect(laid[0]!.position).toBeDefined();
    expect(typeof laid[0]!.position.x).toBe('number');
    expect(typeof laid[0]!.position.y).toBe('number');
  });

  it('empty nodes array returns an empty array', () => {
    const result = autoLayout([], []);
    expect(result).toHaveLength(0);
  });
});
