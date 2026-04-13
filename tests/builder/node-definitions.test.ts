/**
 * Qualixar OS Phase 21 -- Node Definitions Tests
 *
 * Tests for NODE_TYPE_DEFINITIONS catalog and getNodeTypeDefinition() lookup.
 * 6 tests covering count, uniqueness, constraints, config schema, and port structure.
 */

import { describe, it, expect } from 'vitest';
import {
  NODE_TYPE_DEFINITIONS,
  getNodeTypeDefinition,
} from '../../src/builder/node-definitions.js';

describe('NODE_TYPE_DEFINITIONS', () => {
  it('has exactly 9 node types', () => {
    expect(NODE_TYPE_DEFINITIONS).toHaveLength(9);
  });

  it('each node type has a unique type string', () => {
    const types = NODE_TYPE_DEFINITIONS.map((d) => d.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(types.length);
  });

  it('start node has maxInstances = 1', () => {
    const startDef = NODE_TYPE_DEFINITIONS.find((d) => d.type === 'start');
    expect(startDef).toBeDefined();
    expect(startDef!.maxInstances).toBe(1);
  });

  it('agent node has a model-picker field in configSchema', () => {
    const agentDef = NODE_TYPE_DEFINITIONS.find((d) => d.type === 'agent');
    expect(agentDef).toBeDefined();
    const modelPickerField = agentDef!.configSchema.find(
      (field) => field.type === 'model-picker',
    );
    expect(modelPickerField).toBeDefined();
    expect(modelPickerField!.name).toBe('model');
  });

  it('condition node has true and false output ports', () => {
    const conditionDef = NODE_TYPE_DEFINITIONS.find((d) => d.type === 'condition');
    expect(conditionDef).toBeDefined();
    const outputIds = conditionDef!.defaultOutputs.map((p) => p.id);
    expect(outputIds).toContain('true');
    expect(outputIds).toContain('false');
  });
});

describe('getNodeTypeDefinition()', () => {
  it('returns the correct definition for a known type', () => {
    const def = getNodeTypeDefinition('agent');
    expect(def).toBeDefined();
    expect(def!.type).toBe('agent');
    expect(def!.label).toBe('Agent');
  });

  it('returns undefined for an unknown type', () => {
    const def = getNodeTypeDefinition('nonexistent_type');
    expect(def).toBeUndefined();
  });
});
