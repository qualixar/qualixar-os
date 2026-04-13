// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Code Validate Tool
 *
 * Validate code syntax for common languages.
 * JSON: JSON.parse(). JS/TS: bracket/paren matching + basic checks.
 * Others: bracket balance check. No eval, no execution.
 */

import type { ToolResult } from './tool-registry.js';

// ---------------------------------------------------------------------------
// Bracket Matching Engine
// ---------------------------------------------------------------------------

const OPEN_BRACKETS = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const BRACKET_PAIRS: Readonly<Record<string, string>> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

interface BracketResult {
  readonly balanced: boolean;
  readonly errors: readonly string[];
}

function checkBrackets(code: string): BracketResult {
  const stack: { char: string; line: number }[] = [];
  const errors: string[] = [];
  let inString: string | null = null;
  let escaped = false;
  let line = 1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (ch === '\n') { line++; continue; }

    // Track string literals to skip brackets inside them
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (OPEN_BRACKETS.has(ch)) {
      stack.push({ char: ch, line });
    } else if (CLOSE_BRACKETS.has(ch)) {
      const expected = BRACKET_PAIRS[ch];
      if (stack.length === 0) {
        errors.push(`Line ${line}: unexpected '${ch}' with no matching opener`);
      } else if (stack[stack.length - 1].char !== expected) {
        const top = stack[stack.length - 1];
        errors.push(`Line ${line}: '${ch}' does not match '${top.char}' from line ${top.line}`);
      } else {
        stack.pop();
      }
    }
  }

  for (const remaining of stack) {
    errors.push(`Line ${remaining.line}: unclosed '${remaining.char}'`);
  }

  if (inString) {
    errors.push('Unterminated string literal');
  }

  return { balanced: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// JSON Validation
// ---------------------------------------------------------------------------

function validateJson(code: string): { valid: boolean; errors: readonly string[] } {
  try {
    JSON.parse(code);
    return { valid: true, errors: [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [msg] };
  }
}

// ---------------------------------------------------------------------------
// JS/TS Additional Checks
// ---------------------------------------------------------------------------

function validateJsTs(code: string): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  // Bracket balance first
  const brackets = checkBrackets(code);
  errors.push(...brackets.errors);

  // Common syntax issues (heuristic, not a full parser)
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Detect duplicate operators
    if (/[^=!<>]==[^=]/.test(line) === false && /===\s*===/.test(line)) {
      errors.push(`Line ${i + 1}: possible duplicate === operator`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Language Router
// ---------------------------------------------------------------------------

const SUPPORTED_LANGUAGES = new Set([
  'json', 'javascript', 'js', 'typescript', 'ts',
  'python', 'py', 'html', 'css', 'java', 'c', 'cpp', 'go', 'rust',
]);

function validateCode(
  code: string,
  language: string,
): { valid: boolean; language: string; errors: readonly string[] } {
  const lang = language.toLowerCase().trim();

  if (lang === 'json') {
    const result = validateJson(code);
    return { ...result, language: 'json' };
  }

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    const result = validateJsTs(code);
    return { ...result, language: lang };
  }

  // All other languages: bracket balance check
  const brackets = checkBrackets(code);
  return {
    valid: brackets.balanced,
    language: lang,
    errors: brackets.errors,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function codeValidate(
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const code = input.code as string | undefined;
  if (!code || typeof code !== 'string') {
    return { content: 'Error: code is required and must be a string', isError: true };
  }

  const language = input.language as string | undefined;
  if (!language || typeof language !== 'string') {
    return { content: 'Error: language is required and must be a string', isError: true };
  }

  if (!SUPPORTED_LANGUAGES.has(language.toLowerCase().trim())) {
    // Still attempt bracket balance for unsupported languages
    const brackets = checkBrackets(code);
    return {
      content: JSON.stringify({
        valid: brackets.balanced,
        language: language.toLowerCase().trim(),
        note: 'Language not fully supported — bracket balance check only',
        errors: brackets.errors,
      }, null, 2),
    };
  }

  const result = validateCode(code, language);
  return { content: JSON.stringify(result, null, 2) };
}
