// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Auto Layout
 *
 * Automatically positions workflow nodes based on graph topology.
 * Returns a new list of WorkflowNode with updated positions (immutable).
 *
 * Topologies:
 *   sequential  — left-to-right horizontal chain, 250px spacing
 *   parallel    — fan-out from start, 200px vertical spacing per branch
 *   hierarchical — tree layout, BFS layers with 250px horizontal + 180px vertical
 *   default     — force-directed approximation (iterative repulsion + springs)
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-2: autoLayout is pure — returns new nodes, never mutates input.
 */

import type { WorkflowNode, WorkflowEdge, CanvasPosition } from '../types/phase21.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const H_SPACING = 250;  // Horizontal spacing between nodes (sequential)
const V_SPACING = 200;  // Vertical spacing between branches (parallel)
const TREE_H = 250;     // Horizontal gap per BFS layer (hierarchical)
const TREE_V = 180;     // Vertical gap between siblings (hierarchical)
const CANVAS_ORIGIN_X = 80;
const CANVAS_ORIGIN_Y = 100;

// Force-directed constants
const REPULSION = 8000;
const SPRING_LENGTH = 220;
const SPRING_K = 0.1;
const DAMPING = 0.85;
const FD_ITERATIONS = 80;

// ---------------------------------------------------------------------------
// Graph Helpers
// ---------------------------------------------------------------------------

function buildAdjacency(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (e.targetPortId !== 'loop_back') {
      adj.get(e.sourceNodeId)?.push(e.targetNodeId);
    }
  }
  return adj;
}

function buildReverseAdjacency(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, string[]> {
  const radj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (e.targetPortId !== 'loop_back') {
      radj.get(e.targetNodeId)?.push(e.sourceNodeId);
    }
  }
  return radj;
}

function findStartNode(nodes: readonly WorkflowNode[]): WorkflowNode | undefined {
  return nodes.find((n) => n.type === 'start');
}

// ---------------------------------------------------------------------------
// Layout Algorithms
// ---------------------------------------------------------------------------

/**
 * Sequential layout: horizontal chain, left to right.
 * Uses topological sort (BFS from start) to order nodes.
 */
function layoutSequential(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, CanvasPosition> {
  const positions = new Map<string, CanvasPosition>();
  const adj = buildAdjacency(nodes, edges);
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (const targets of adj.values()) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let x = CANVAS_ORIGIN_X;
  const cy = CANVAS_ORIGIN_Y + 200;

  while (queue.length > 0) {
    const id = queue.shift()!;
    positions.set(id, { x, y: cy });
    x += H_SPACING;

    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return positions;
}

/**
 * Parallel layout: fan-out from start node vertically, branches go right.
 * Each direct child of start gets its own horizontal lane.
 */
function layoutParallel(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, CanvasPosition> {
  const positions = new Map<string, CanvasPosition>();
  const adj = buildAdjacency(nodes, edges);
  const startNode = findStartNode(nodes);

  if (!startNode) return layoutSequential(nodes, edges);

  positions.set(startNode.id, { x: CANVAS_ORIGIN_X, y: CANVAS_ORIGIN_Y + 200 });

  const directChildren = adj.get(startNode.id) ?? [];
  const totalHeight = (directChildren.length - 1) * V_SPACING;
  const baseY = CANVAS_ORIGIN_Y + 200 - totalHeight / 2;

  directChildren.forEach((childId, i) => {
    const laneY = baseY + i * V_SPACING;
    positions.set(childId, { x: CANVAS_ORIGIN_X + H_SPACING, y: laneY });

    // Continue the branch horizontally
    let x = CANVAS_ORIGIN_X + H_SPACING * 2;
    let current = childId;
    const visited = new Set<string>([startNode.id, childId]);

    while (true) {
      const nexts = (adj.get(current) ?? []).filter((id) => !visited.has(id));
      if (nexts.length === 0) break;
      const next = nexts[0]!;
      visited.add(next);
      positions.set(next, { x, y: laneY });
      x += H_SPACING;
      current = next;
    }
  });

  return positions;
}

/**
 * Hierarchical / tree layout: BFS from start, assigns layers.
 * Within each layer nodes are spaced vertically.
 */
function layoutHierarchical(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, CanvasPosition> {
  const positions = new Map<string, CanvasPosition>();
  const adj = buildAdjacency(nodes, edges);
  const startNode = findStartNode(nodes);

  if (!startNode) return layoutSequential(nodes, edges);

  // BFS to assign layer numbers
  const layer = new Map<string, number>();
  const queue: string[] = [startNode.id];
  layer.set(startNode.id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const nextLayer = (layer.get(id) ?? 0) + 1;
    for (const neighbor of adj.get(id) ?? []) {
      if (!layer.has(neighbor)) {
        layer.set(neighbor, nextLayer);
        queue.push(neighbor);
      }
    }
  }

  // Group nodes by layer
  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }

  // Assign positions
  for (const [l, ids] of byLayer) {
    const totalHeight = (ids.length - 1) * TREE_V;
    const startY = CANVAS_ORIGIN_Y + 200 - totalHeight / 2;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: CANVAS_ORIGIN_X + l * TREE_H,
        y: startY + i * TREE_V,
      });
    });
  }

  return positions;
}

/**
 * Force-directed layout: simple spring + repulsion simulation.
 * Used as the fallback for graphs that don't fit other patterns.
 */
function layoutForceDirected(nodes: readonly WorkflowNode[]): Map<string, CanvasPosition> {
  const pos = new Map<string, { x: number; y: number }>();
  const vel = new Map<string, { vx: number; vy: number }>();

  // Initialize with random positions in a grid
  nodes.forEach((n, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    pos.set(n.id, { x: CANVAS_ORIGIN_X + col * 220, y: CANVAS_ORIGIN_Y + row * 180 });
    vel.set(n.id, { vx: 0, vy: 0 });
  });

  for (let iter = 0; iter < FD_ITERATIONS; iter++) {
    const forces = new Map<string, { fx: number; fy: number }>(
      nodes.map((n) => [n.id, { fx: 0, fy: 0 }]),
    );

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(a.id)!.fx += fx;
        forces.get(a.id)!.fy += fy;
        forces.get(b.id)!.fx -= fx;
        forces.get(b.id)!.fy -= fy;
      }
    }

    // Update velocities and positions
    for (const n of nodes) {
      const f = forces.get(n.id)!;
      const v = vel.get(n.id)!;
      v.vx = (v.vx + f.fx) * DAMPING;
      v.vy = (v.vy + f.fy) * DAMPING;
      const p = pos.get(n.id)!;
      pos.set(n.id, { x: p.x + v.vx, y: p.y + v.vy });
    }
  }

  // Convert to integer positions with floor
  const result = new Map<string, CanvasPosition>();
  for (const [id, p] of pos) {
    result.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Automatically positions workflow nodes based on topology hint.
 *
 * @param nodes   - Input workflow nodes (not mutated)
 * @param edges   - Workflow edges used to infer graph structure
 * @param topology - Optional topology hint: 'sequential', 'parallel', 'hierarchical'
 * @returns New array of WorkflowNode with updated positions
 */
export function autoLayout(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
  topology?: string,
): readonly WorkflowNode[] {
  if (nodes.length === 0) return nodes;

  let positions: Map<string, CanvasPosition>;

  const adj = buildAdjacency(nodes, edges);
  const hasFanOut = [...adj.values()].some((ts) => ts.length > 1);

  const effectiveTopology = topology ??
    (hasFanOut ? 'parallel' : 'sequential');

  switch (effectiveTopology) {
    case 'sequential':
      positions = layoutSequential(nodes, edges);
      break;
    case 'parallel':
      positions = layoutParallel(nodes, edges);
      break;
    case 'hierarchical':
      positions = layoutHierarchical(nodes, edges);
      break;
    default:
      positions = layoutForceDirected(nodes);
      break;
  }

  return nodes.map((n) => {
    const pos = positions.get(n.id);
    if (!pos) return n;
    return { ...n, position: pos };
  });
}
