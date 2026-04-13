/**
 * Qualixar OS Phase 21 -- Connection Matrix Tests
 *
 * Tests for CONNECTION_MATRIX and isConnectionAllowed() covering the 6 rules
 * defined in LLD Phase 21 Section 3.2.
 * 5 tests covering start→agent, start→start, output sources, condition targets, agent→agent.
 */

import { describe, it, expect } from 'vitest';
import {
  CONNECTION_MATRIX,
  isConnectionAllowed,
} from '../../src/builder/connection-matrix.js';
import type { WorkflowNodeType } from '../../src/types/phase21.js';

const ALL_TYPES: WorkflowNodeType[] = [
  'start', 'agent', 'tool', 'condition', 'loop',
  'human_approval', 'output', 'merge', 'transform',
];

describe('CONNECTION_MATRIX and isConnectionAllowed()', () => {
  it('start can connect to agent', () => {
    expect(isConnectionAllowed('start', 'agent')).toBe(true);
    expect(CONNECTION_MATRIX['start']['agent']).toBe(true);
  });

  it('start cannot connect to start (R1 — self-loop prevention)', () => {
    expect(isConnectionAllowed('start', 'start')).toBe(false);
    expect(CONNECTION_MATRIX['start']['start']).toBe(false);
  });

  it('output cannot have outgoing connections to any type (R2)', () => {
    for (const target of ALL_TYPES) {
      expect(isConnectionAllowed('output', target)).toBe(false);
    }
  });

  it('condition can connect to any non-start type (R4)', () => {
    const nonStartTypes = ALL_TYPES.filter((t) => t !== 'start');
    for (const target of nonStartTypes) {
      expect(isConnectionAllowed('condition', target)).toBe(true);
    }
    // condition → start must be forbidden
    expect(isConnectionAllowed('condition', 'start')).toBe(false);
  });

  it('agent can connect to agent (R6 — free connections except to start)', () => {
    expect(isConnectionAllowed('agent', 'agent')).toBe(true);
    // agent → start must still be forbidden
    expect(isConnectionAllowed('agent', 'start')).toBe(false);
  });
});
