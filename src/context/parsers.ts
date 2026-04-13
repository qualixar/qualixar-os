// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Document Parsers
 *
 * Lazy-loaded parsers for .md, .txt, .json, .yaml, .yml, .csv, .pdf, .docx, .xlsx.
 * All parsers return a ParseResult with content, format, estimated tokens, and metadata.
 * Heavy libraries (mammoth) are dynamically imported to keep boot time fast.
 *
 * Token estimation: Math.ceil(content.length / 4) -- rough GPT-4 approximation.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseResult {
  readonly content: string;
  readonly format: string;
  readonly tokens: number;
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Token Estimation
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Supported Extensions
// ---------------------------------------------------------------------------

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.csv',
  '.pdf', '.docx', '.xlsx',
]);

// ---------------------------------------------------------------------------
// Individual Parsers
// ---------------------------------------------------------------------------

async function parseText(filePath: string, format: string): Promise<ParseResult> {
  const content = await readFile(filePath, 'utf-8');
  return {
    content,
    format,
    tokens: estimateTokens(content),
    metadata: { charCount: content.length },
  };
}

async function parseJson(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const content = typeof parsed === 'string'
    ? parsed
    : JSON.stringify(parsed, null, 2);
  return {
    content,
    format: 'json',
    tokens: estimateTokens(content),
    metadata: { type: typeof parsed, isArray: Array.isArray(parsed) },
  };
}

async function parseYaml(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, 'utf-8');
  // Lazy-load yaml (already in dependencies)
  const { parse, stringify } = await import('yaml');
  const parsed = parse(raw);
  const content = parsed === null || parsed === undefined
    ? raw
    : typeof parsed === 'string'
      ? parsed
      : stringify(parsed);
  return {
    content,
    format: 'yaml',
    tokens: estimateTokens(content),
    metadata: { type: typeof parsed },
  };
}

async function parseCsv(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, 'utf-8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const content = lines.join('\n');
  return {
    content,
    format: 'csv',
    tokens: estimateTokens(content),
    metadata: { lineCount: lines.length },
  };
}

async function parseDocx(filePath: string): Promise<ParseResult> {
  try {
    // Dynamic import -- mammoth is optional. Suppress TS module resolution.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = await (import('mammoth' as string) as Promise<{
      extractRawText: (input: { path: string }) => Promise<{ value: string; messages: unknown[] }>;
    }>);
    const result = await mammoth.extractRawText({ path: filePath });
    const content = result.value;
    return {
      content,
      format: 'docx',
      tokens: estimateTokens(content),
      metadata: { messages: result.messages },
    };
  } catch {
    return {
      content: '[DOCX parsing requires mammoth: npm install mammoth]',
      format: 'docx',
      tokens: 0,
      metadata: { placeholder: true },
    };
  }
}

function parsePdf(): ParseResult {
  return {
    content: '[PDF parsing available in future release]',
    format: 'pdf',
    tokens: 0,
    metadata: { placeholder: true },
  };
}

function parseXlsx(): ParseResult {
  return {
    content: '[XLSX parsing available in future release]',
    format: 'xlsx',
    tokens: 0,
    metadata: { placeholder: true },
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export async function parseFile(filePath: string): Promise<ParseResult> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.md':
      return parseText(filePath, 'markdown');
    case '.txt':
      return parseText(filePath, 'text');
    case '.json':
      return parseJson(filePath);
    case '.yaml':
    case '.yml':
      return parseYaml(filePath);
    case '.csv':
      return parseCsv(filePath);
    case '.docx':
      return parseDocx(filePath);
    case '.pdf':
      return parsePdf();
    case '.xlsx':
      return parseXlsx();
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}
