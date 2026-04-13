// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase Pivot-2 -- Tool Categories
 *
 * Flat taxonomy of 6 tool genres. No hierarchy (research confirms flat is best).
 * Used by: ToolRegistry (categorization), Forge (auto-selection), Dashboard (palette).
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 2.1
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool Category Type & Schema
// ---------------------------------------------------------------------------

export type ToolCategory =
  | 'web-data'
  | 'code-dev'
  | 'communication'
  | 'knowledge'
  | 'creative'
  | 'enterprise';

export const ToolCategorySchema = z.enum([
  'web-data',
  'code-dev',
  'communication',
  'knowledge',
  'creative',
  'enterprise',
]);

// ---------------------------------------------------------------------------
// Category Metadata
// ---------------------------------------------------------------------------

export interface ToolCategoryInfo {
  readonly id: ToolCategory;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
  readonly defaultForTaskTypes: readonly string[];
}

export const TOOL_CATEGORIES: readonly ToolCategoryInfo[] = [
  {
    id: 'web-data',
    label: 'Web & Data',
    description: 'Search, crawl, scrape, RSS, API connectors',
    icon: '\u{1F310}',
    color: '#3b82f6',
    defaultForTaskTypes: ['research', 'analysis', 'creative', 'custom'],
  },
  {
    id: 'code-dev',
    label: 'Code & Dev',
    description: 'GitHub, code execution, linter, test runner, shell',
    icon: '\u{1F4BB}',
    color: '#22c55e',
    defaultForTaskTypes: ['code', 'analysis', 'custom'],
  },
  {
    id: 'communication',
    label: 'Communication',
    description: 'Slack, email, Discord, webhook, SMS',
    icon: '\u{1F4E8}',
    color: '#a855f7',
    defaultForTaskTypes: ['custom'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Vector search, document reader, DB query, RAG',
    icon: '\u{1F4DA}',
    color: '#f59e0b',
    defaultForTaskTypes: ['code', 'research', 'analysis', 'creative', 'custom'],
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Image gen, video gen, TTS, diagrams, charts',
    icon: '\u{1F3A8}',
    color: '#ec4899',
    defaultForTaskTypes: ['creative', 'custom'],
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'CRM, project management, analytics, cloud ops',
    icon: '\u{1F3E2}',
    color: '#64748b',
    defaultForTaskTypes: ['custom'],
  },
];

// ---------------------------------------------------------------------------
// Task-Type to Category Mapping
// ---------------------------------------------------------------------------

export const TASK_CATEGORY_MAP: Readonly<Record<string, readonly ToolCategory[]>> = {
  code:     ['code-dev', 'knowledge'],
  research: ['web-data', 'knowledge'],
  analysis: ['knowledge', 'code-dev', 'web-data'],
  creative: ['creative', 'web-data', 'knowledge'],
  custom:   ['web-data', 'code-dev', 'communication', 'knowledge', 'creative', 'enterprise'],
};

const ALL_CATEGORIES: readonly ToolCategory[] = [
  'web-data', 'code-dev', 'communication', 'knowledge', 'creative', 'enterprise',
];

/**
 * Get the default categories for a task type.
 * Unknown task types return all categories (same as 'custom').
 */
export function getDefaultCategories(taskType: string): readonly ToolCategory[] {
  return TASK_CATEGORY_MAP[taskType] ?? ALL_CATEGORIES;
}

// ---------------------------------------------------------------------------
// Built-in Tool Category Assignments
// ---------------------------------------------------------------------------

export const BUILTIN_CATEGORIES: Readonly<Record<string, ToolCategory>> = {
  web_search:     'web-data',
  web_crawl:      'web-data',
  file_read:      'code-dev',
  file_write:     'code-dev',
  shell_exec:     'code-dev',
  http_request:   'web-data',
  json_transform: 'knowledge',
  text_analyze:   'knowledge',
  code_validate:  'code-dev',
};

/** Set of builtin tool names — used to enforce immutability (R4) */
export const BUILTIN_NAMES = new Set(Object.keys(BUILTIN_CATEGORIES));

// ---------------------------------------------------------------------------
// Category Inference for MCP Tools (Algorithm 4.4)
// ---------------------------------------------------------------------------

interface McpToolLike {
  readonly name: string;
  readonly description?: string;
  readonly annotations?: { readonly readOnlyHint?: boolean };
}

// Pattern groups ordered by specificity (first match wins)
const CATEGORY_PATTERNS: readonly { readonly pattern: RegExp; readonly category: ToolCategory }[] = [
  // Creative before code-dev: "tts/speech/image" must win over "test" substring false positives
  { pattern: /image|video|audio|draw|render|tts|diagram|chart|svg|canvas|speech/, category: 'creative' },
  { pattern: /file|code|git|shell|exec|lint|test_|_test|^test|build|compile|format/, category: 'code-dev' },
  { pattern: /slack|email|discord|send|notify|webhook|sms|telegram|chat/, category: 'communication' },
  { pattern: /crm|jira|asana|deploy|cloud|monitor|analytics|project_mgmt/, category: 'enterprise' },
  { pattern: /web|crawl|scrape|rss|browse|url|http|fetch_page/, category: 'web-data' },
  { pattern: /embed|vector|memory|document|database|sql|rag|index/, category: 'knowledge' },
];

// Disambiguation patterns for ambiguous keywords like "search"
const WEB_SEARCH_SIGNALS = /web|google|bing|duck/;

/**
 * Infer tool category from MCP tool name, description, and annotations.
 * Rules are evaluated top-to-bottom; first match wins.
 */
export function inferToolCategory(tool: McpToolLike): ToolCategory {
  const name = tool.name.toLowerCase();
  const desc = (tool.description ?? '').toLowerCase();
  const combined = `${name} ${desc}`;

  // Check explicit patterns first
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(combined)) {
      return category;
    }
  }

  // Disambiguate "search/query/find"
  if (/search|query|find/.test(combined)) {
    if (WEB_SEARCH_SIGNALS.test(combined)) {
      return 'web-data';
    }
    return 'knowledge';
  }

  // Annotation-based fallback
  if (tool.annotations?.readOnlyHint) {
    return 'knowledge';
  }

  // Default
  return 'knowledge';
}
