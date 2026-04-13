// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- JSON Transform Tool
 *
 * Extract and transform JSON data using dot-notation path expressions.
 * Supports array indexing (users[0]), wildcards (items.*.price),
 * and nested paths (a.b.c). Zero external dependencies.
 */

import type { ToolResult } from './tool-registry.js';

// ---------------------------------------------------------------------------
// Path Traversal Engine
// ---------------------------------------------------------------------------

/**
 * Tokenize a dot-notation expression into segments.
 * "users[0].name" -> ["users", "0", "name"]
 * "items.*.price" -> ["items", "*", "price"]
 */
function tokenize(expression: string): readonly string[] {
  const tokens: string[] = [];
  for (const part of expression.split('.')) {
    // Handle array indices: "users[0]" -> "users", "0"
    const bracketMatch = part.match(/^([^[]+)\[(\d+)\]$/);
    if (bracketMatch) {
      tokens.push(bracketMatch[1], bracketMatch[2]);
    } else {
      tokens.push(part);
    }
  }
  return tokens;
}

/**
 * Traverse a value by a single token, returning all matching values.
 * Wildcard (*) expands arrays and object values.
 */
function step(current: readonly unknown[], token: string): readonly unknown[] {
  const results: unknown[] = [];
  for (const item of current) {
    if (item === null || item === undefined || typeof item !== 'object') continue;

    if (token === '*') {
      // Expand array elements or object values
      if (Array.isArray(item)) {
        results.push(...item);
      } else {
        results.push(...Object.values(item as Record<string, unknown>));
      }
    } else if (Array.isArray(item)) {
      const idx = Number(token);
      if (!Number.isNaN(idx) && idx >= 0 && idx < item.length) {
        results.push(item[idx]);
      }
    } else {
      const obj = item as Record<string, unknown>;
      if (token in obj) {
        results.push(obj[token]);
      }
    }
  }
  return results;
}

/**
 * Evaluate a path expression against parsed JSON data.
 * Returns the extracted value(s).
 */
export function evaluatePath(data: unknown, expression: string): unknown {
  const tokens = tokenize(expression);
  let current: readonly unknown[] = [data];

  for (const token of tokens) {
    current = step(current, token);
    if (current.length === 0) return undefined;
  }

  // Unwrap single results for cleaner output
  return current.length === 1 ? current[0] : current;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function jsonTransform(
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const rawData = input.data as string | undefined;
  if (!rawData || typeof rawData !== 'string') {
    return { content: 'Error: data is required and must be a JSON string', isError: true };
  }

  const expression = input.expression as string | undefined;
  if (!expression || typeof expression !== 'string') {
    return { content: 'Error: expression is required and must be a string', isError: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error: invalid JSON — ${msg}`, isError: true };
  }

  try {
    const result = evaluatePath(parsed, expression);
    if (result === undefined) {
      return { content: 'null', isError: false };
    }
    return { content: JSON.stringify(result, null, 2) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error: path evaluation failed — ${msg}`, isError: true };
  }
}
