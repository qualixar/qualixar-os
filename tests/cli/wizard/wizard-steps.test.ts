/**
 * Qualixar OS Phase 19 -- Wizard Steps Tests
 * Tests for getSteps(mode) and WIZARD_STEPS structure.
 */

import { describe, it, expect } from 'vitest';
import { WIZARD_STEPS, getSteps } from '../../../src/cli/wizard/wizard-steps.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSteps', () => {
  it("getSteps('quick') returns the correct step count", () => {
    const steps = getSteps('quick');
    // Quick mode includes all steps that list 'quick' in their modes array
    const expected = WIZARD_STEPS.filter((s) => s.modes.includes('quick'));
    expect(steps.length).toBe(expected.length);
    expect(steps.length).toBeGreaterThan(0);
  });

  it("getSteps('advanced') returns more steps than quick", () => {
    const quickSteps = getSteps('quick');
    const advancedSteps = getSteps('advanced');

    expect(advancedSteps.length).toBeGreaterThan(quickSteps.length);
  });

  it("getSteps('manual') returns the correct step count", () => {
    const steps = getSteps('manual');
    // manual mode has its own distinct steps
    expect(steps.length).toBeGreaterThan(0);
    // All returned steps must include 'manual' in their modes
    for (const step of steps) {
      expect(step.modes).toContain('manual');
    }
  });

  it('every step has a unique ID', () => {
    const ids = WIZARD_STEPS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every step has a valid promptType', () => {
    const validTypes = new Set(['select', 'input', 'confirm', 'password', 'checkbox']);
    for (const step of WIZARD_STEPS) {
      expect(validTypes.has(step.promptType), `Step '${step.id}' has invalid promptType '${step.promptType}'`).toBe(true);
    }
  });

  it('every select and checkbox step has a non-empty choices array', () => {
    for (const step of WIZARD_STEPS) {
      if (step.promptType === 'select' || step.promptType === 'checkbox') {
        expect(
          step.choices && step.choices.length > 0,
          `Step '${step.id}' (${step.promptType}) must have non-empty choices`,
        ).toBe(true);
      }
    }
  });

  it("'mode' step is present in all three modes", () => {
    const quickSteps = getSteps('quick');
    const advancedSteps = getSteps('advanced');
    const manualSteps = getSteps('manual');

    const hasMode = (steps: readonly { id: string }[]) =>
      steps.some((s) => s.id === 'mode');

    expect(hasMode(quickSteps)).toBe(true);
    expect(hasMode(advancedSteps)).toBe(true);
    expect(hasMode(manualSteps)).toBe(true);
  });
});
