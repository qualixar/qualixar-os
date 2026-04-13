/**
 * Tests for Qualixar OS Code Validate Tool
 *
 * Tests JSON validation, JS/TS bracket matching, generic bracket
 * balance for other languages, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { codeValidate } from '../../src/tools/code-tool.js';

describe('codeValidate', () => {
  // -------------------------------------------------------------------------
  // Input Validation
  // -------------------------------------------------------------------------

  it('returns error when code is missing', async () => {
    const result = await codeValidate({ language: 'json' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('code is required');
  });

  it('returns error when language is missing', async () => {
    const result = await codeValidate({ code: '{}' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('language is required');
  });

  // -------------------------------------------------------------------------
  // JSON Validation
  // -------------------------------------------------------------------------

  it('validates correct JSON', async () => {
    const result = await codeValidate({
      code: '{"name":"Qualixar","version":2}',
      language: 'json',
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toHaveLength(0);
  });

  it('detects invalid JSON', async () => {
    const result = await codeValidate({
      code: '{name: "bad"}',
      language: 'json',
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('detects trailing comma in JSON', async () => {
    const result = await codeValidate({
      code: '{"a":1,}',
      language: 'json',
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // JavaScript / TypeScript Validation
  // -------------------------------------------------------------------------

  it('validates correct JavaScript', async () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = await codeValidate({ code, language: 'js' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
  });

  it('detects unmatched brace in JS', async () => {
    const code = 'function broken() { return 1;';
    const result = await codeValidate({ code, language: 'javascript' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.some((e: string) => e.includes('unclosed'))).toBe(true);
  });

  it('detects unmatched parenthesis in TS', async () => {
    const code = 'const x = fn((a, b);';
    const result = await codeValidate({ code, language: 'typescript' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
  });

  it('handles string literals with brackets inside', async () => {
    const code = 'const s = "a { b } c";';
    const result = await codeValidate({ code, language: 'js' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Generic Language (Bracket Balance)
  // -------------------------------------------------------------------------

  it('validates balanced brackets in Python', async () => {
    const code = 'def add(a, b):\n    return (a + b)';
    const result = await codeValidate({ code, language: 'python' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
  });

  it('detects unbalanced brackets in Go', async () => {
    const code = 'func main() { fmt.Println("hello")';
    const result = await codeValidate({ code, language: 'go' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Unsupported Language Fallback
  // -------------------------------------------------------------------------

  it('still checks brackets for unsupported languages', async () => {
    const result = await codeValidate({
      code: '(balanced)',
      language: 'brainfuck',
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
    expect(parsed.note).toContain('not fully supported');
  });

  it('detects unbalanced brackets in unsupported language', async () => {
    const result = await codeValidate({
      code: '((unbalanced)',
      language: 'brainfuck',
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  it('handles empty code string', async () => {
    const result = await codeValidate({ code: '', language: 'json' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('code is required');
  });

  it('validates complex nested JSON', async () => {
    const code = JSON.stringify({
      users: [{ name: 'a', roles: ['admin'] }],
      meta: { count: 1 },
    });
    const result = await codeValidate({ code, language: 'json' });
    const parsed = JSON.parse(result.content);
    expect(parsed.valid).toBe(true);
  });
});
