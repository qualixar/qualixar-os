/**
 * Tests for Qualixar OS JSON Transform Tool
 *
 * Tests JSONPath-like expression evaluation: dot-notation,
 * array indexing, wildcards, nested paths, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { jsonTransform } from '../../src/tools/json-tool.js';
import { evaluatePath } from '../../src/tools/json-tool.js';

// ---------------------------------------------------------------------------
// evaluatePath (unit tests for the path engine)
// ---------------------------------------------------------------------------

describe('evaluatePath', () => {
  const data = {
    name: 'Qualixar',
    version: 2,
    users: [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ],
    config: { nested: { deep: 'value' } },
    items: [
      { price: 10 },
      { price: 20 },
      { price: 30 },
    ],
  };

  it('extracts a top-level property', () => {
    expect(evaluatePath(data, 'name')).toBe('Qualixar');
  });

  it('extracts a nested property', () => {
    expect(evaluatePath(data, 'config.nested.deep')).toBe('value');
  });

  it('extracts an array element by index', () => {
    expect(evaluatePath(data, 'users[0].name')).toBe('Alice');
  });

  it('extracts second array element', () => {
    expect(evaluatePath(data, 'users[1].age')).toBe(25);
  });

  it('extracts with wildcard on array', () => {
    const result = evaluatePath(data, 'items.*.price');
    expect(result).toEqual([10, 20, 30]);
  });

  it('extracts with wildcard on object', () => {
    const obj = { a: { x: 1 }, b: { x: 2 } };
    const result = evaluatePath(obj, '*.x');
    expect(result).toEqual([1, 2]);
  });

  it('returns undefined for missing path', () => {
    expect(evaluatePath(data, 'nonexistent.path')).toBeUndefined();
  });

  it('returns undefined for out-of-bounds index', () => {
    expect(evaluatePath(data, 'users[99].name')).toBeUndefined();
  });

  it('handles numeric top-level property', () => {
    expect(evaluatePath(data, 'version')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// jsonTransform handler (integration)
// ---------------------------------------------------------------------------

describe('jsonTransform', () => {
  it('returns error when data is missing', async () => {
    const result = await jsonTransform({ expression: 'a.b' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('data is required');
  });

  it('returns error when expression is missing', async () => {
    const result = await jsonTransform({ data: '{"a":1}' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('expression is required');
  });

  it('returns error for invalid JSON', async () => {
    const result = await jsonTransform({ data: '{bad json', expression: 'a' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('invalid JSON');
  });

  it('extracts a simple path', async () => {
    const result = await jsonTransform({
      data: '{"user":{"name":"Varun"}}',
      expression: 'user.name',
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content)).toBe('Varun');
  });

  it('returns null for missing path', async () => {
    const result = await jsonTransform({
      data: '{"a":1}',
      expression: 'b.c',
    });
    expect(result.content).toBe('null');
  });

  it('extracts wildcard array values', async () => {
    const result = await jsonTransform({
      data: '{"items":[{"id":1},{"id":2},{"id":3}]}',
      expression: 'items.*.id',
    });
    expect(JSON.parse(result.content)).toEqual([1, 2, 3]);
  });
});
