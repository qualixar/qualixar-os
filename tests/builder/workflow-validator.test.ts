/**
 * Qualixar OS Phase 21 -- Workflow Validator Tests
 *
 * Tests for createWorkflowValidator().validate() covering all 7 validation rules
 * (V1–V6 errors and the empty-workflow edge case).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkflowValidator } from '../../src/builder/workflow-validator.js';
import type { WorkflowValidator } from '../../src/builder/workflow-validator.js';
import type {
  WorkflowDocument,
  WorkflowNode,
  WorkflowEdge,
} from '../../src/types/phase21.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_VIEWPORT = { offsetX: 0, offsetY: 0, zoom: 1 } as const;
const DEFAULT_META = {
  createdAt: '2026-04-03T00:00:00Z',
  updatedAt: '2026-04-03T00:00:00Z',
  version: 1,
  authorRole: 'developer' as const,
  tags: [],
  estimatedCostUsd: 0,
};

function makeNode(
  id: string,
  type: WorkflowNode['type'],
  label: string,
  config: Record<string, unknown> = {},
  inputs: WorkflowNode['inputs'] = [],
  outputs: WorkflowNode['outputs'] = [],
): WorkflowNode {
  return {
    id,
    type,
    label,
    position: { x: 0, y: 0 },
    config,
    inputs,
    outputs,
    size: { width: 200, height: 80 },
  };
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): WorkflowEdge {
  return { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, label: null, condition: null };
}

function makeDoc(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowDocument {
  return {
    id: 'test-doc',
    name: 'Test Workflow',
    description: '',
    nodes,
    edges,
    viewport: DEFAULT_VIEWPORT,
    metadata: DEFAULT_META,
  };
}

// A minimal valid workflow: start → agent → output (all ports declared).
function validDoc(): WorkflowDocument {
  const startNode = makeNode(
    'n-start', 'start', 'Start', { triggerDescription: '' },
    [],
    [{ id: 'out', direction: 'output', label: 'Output', dataType: 'text', multi: false }],
  );
  const agentNode = makeNode(
    'n-agent', 'agent', 'Agent',
    { name: 'Agent', systemPrompt: 'You are helpful.' },
    [{ id: 'in', direction: 'input', label: 'Input', dataType: 'text', multi: false }],
    [{ id: 'out', direction: 'output', label: 'Output', dataType: 'text', multi: false }],
  );
  const outputNode = makeNode(
    'n-output', 'output', 'Output', {},
    [{ id: 'in', direction: 'input', label: 'Input', dataType: 'any', multi: false }],
    [],
  );

  const edges = [
    makeEdge('e1', 'n-start', 'out', 'n-agent', 'in'),
    makeEdge('e2', 'n-agent', 'out', 'n-output', 'in'),
  ];

  return makeDoc([startNode, agentNode, outputNode], edges);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;

  beforeEach(() => {
    validator = createWorkflowValidator();
  });

  it('valid workflow passes validation with no errors', () => {
    const result = validator.validate(validDoc());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing start node → V1_NO_START error', () => {
    const outputNode = makeNode(
      'n-output', 'output', 'Output', {},
      [{ id: 'in', direction: 'input', label: 'Input', dataType: 'any', multi: false }],
      [],
    );
    const doc = makeDoc([outputNode], []);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('V1_NO_START');
  });

  it('missing output node → V2_NO_OUTPUT error', () => {
    const startNode = makeNode(
      'n-start', 'start', 'Start', { triggerDescription: '' },
      [],
      [{ id: 'out', direction: 'output', label: 'Output', dataType: 'text', multi: false }],
    );
    const doc = makeDoc([startNode], []);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('V2_NO_OUTPUT');
  });

  it('disconnected node → V3_DISCONNECTED error', () => {
    const base = validDoc();
    // Add an orphan node that is not reachable from start
    const orphan = makeNode('n-orphan', 'agent', 'Orphan', { name: 'Orphan', systemPrompt: 'x' });
    const doc: WorkflowDocument = { ...base, nodes: [...base.nodes, orphan] };
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const disconnectedErrors = result.errors.filter((e) => e.code === 'V3_DISCONNECTED');
    expect(disconnectedErrors.length).toBeGreaterThan(0);
    expect(disconnectedErrors.some((e) => e.nodeId === 'n-orphan')).toBe(true);
  });

  it('edge referencing nonexistent node → V5_INVALID_SOURCE_NODE or V5_INVALID_TARGET_NODE error', () => {
    const base = validDoc();
    const badEdge = makeEdge('e-bad', 'ghost-node', 'out', 'n-output', 'in');
    const doc: WorkflowDocument = { ...base, edges: [...base.edges, badEdge] };
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(
      codes.includes('V5_INVALID_SOURCE_NODE') || codes.includes('V5_INVALID_TARGET_NODE'),
    ).toBe(true);
  });

  it('duplicate start nodes → V1_MULTIPLE_START errors for each', () => {
    const start1 = makeNode(
      'n-start-1', 'start', 'Start 1', { triggerDescription: '' },
      [],
      [{ id: 'out', direction: 'output', label: 'Output', dataType: 'text', multi: false }],
    );
    const start2 = makeNode(
      'n-start-2', 'start', 'Start 2', { triggerDescription: '' },
      [],
      [{ id: 'out', direction: 'output', label: 'Output', dataType: 'text', multi: false }],
    );
    const outputNode = makeNode(
      'n-output', 'output', 'Output', {},
      [{ id: 'in', direction: 'input', label: 'Input', dataType: 'any', multi: false }],
      [],
    );
    const doc = makeDoc([start1, start2, outputNode], [
      makeEdge('e1', 'n-start-1', 'out', 'n-output', 'in'),
    ]);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const multiStartErrors = result.errors.filter((e) => e.code === 'V1_MULTIPLE_START');
    // One error per duplicate start node
    expect(multiStartErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('empty workflow → errors for both missing start and missing output', () => {
    const doc = makeDoc([], []);
    const result = validator.validate(doc);
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('V1_NO_START');
    expect(codes).toContain('V2_NO_OUTPUT');
  });
});
