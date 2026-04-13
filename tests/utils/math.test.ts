// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
import { describe, it, expect } from 'vitest';
import { shannonEntropyLog2, shannonEntropyLn, linearSlope } from '../../src/utils/math.js';

describe('shannonEntropyLog2', () => {
  it('returns 0 for single-element [1]', () => {
    expect(shannonEntropyLog2([1])).toBe(0);
  });

  it('returns 1.0 for [0.5, 0.5]', () => {
    expect(shannonEntropyLog2([0.5, 0.5])).toBeCloseTo(1.0, 10);
  });

  it('returns 0 for empty array', () => {
    expect(shannonEntropyLog2([])).toBe(0);
  });

  it('returns 0 when all probability is on one element', () => {
    expect(shannonEntropyLog2([0, 0, 1, 0])).toBe(0);
  });

  it('returns 2.0 for uniform [0.25, 0.25, 0.25, 0.25]', () => {
    expect(shannonEntropyLog2([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(2.0, 10);
  });
});

describe('shannonEntropyLn', () => {
  it('returns 0 for single-element [1]', () => {
    expect(shannonEntropyLn([1])).toBe(0);
  });

  it('returns ln(2) for [0.5, 0.5]', () => {
    expect(shannonEntropyLn([0.5, 0.5])).toBeCloseTo(Math.LN2, 10);
  });

  it('returns 0 for empty array', () => {
    expect(shannonEntropyLn([])).toBe(0);
  });

  it('returns 0 when all probability is on one element', () => {
    expect(shannonEntropyLn([0, 1])).toBe(0);
  });
});

describe('linearSlope', () => {
  it('returns 0 for single element', () => {
    expect(linearSlope([5])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(linearSlope([])).toBe(0);
  });

  it('returns correct slope for [1, 2, 3]', () => {
    // Perfect linear increase: slope = 1.0
    expect(linearSlope([1, 2, 3])).toBeCloseTo(1.0, 10);
  });

  it('returns correct negative slope for [3, 2, 1]', () => {
    expect(linearSlope([3, 2, 1])).toBeCloseTo(-1.0, 10);
  });

  it('returns 0 for constant values', () => {
    expect(linearSlope([5, 5, 5, 5])).toBeCloseTo(0, 10);
  });
});
