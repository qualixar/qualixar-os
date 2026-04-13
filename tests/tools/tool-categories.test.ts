/**
 * Tests for Qualixar OS Phase Pivot-2: Tool Categories
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 7.1, 7.7
 * Tests: RED 1-3, 28-35
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_CATEGORIES,
  TASK_CATEGORY_MAP,
  BUILTIN_CATEGORIES,
  getDefaultCategories,
  inferToolCategory,
  type ToolCategory,
  type ToolCategoryInfo,
  ToolCategorySchema,
} from '../../src/tools/tool-categories.js';

// ---------------------------------------------------------------------------
// RED 1: Category definitions
// ---------------------------------------------------------------------------

describe('TOOL_CATEGORIES', () => {
  it('should define exactly 6 tool categories', () => {
    expect(TOOL_CATEGORIES).toHaveLength(6);

    const ids = TOOL_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('web-data');
    expect(ids).toContain('code-dev');
    expect(ids).toContain('communication');
    expect(ids).toContain('knowledge');
    expect(ids).toContain('creative');
    expect(ids).toContain('enterprise');
  });

  it('each category has all required fields', () => {
    for (const cat of TOOL_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(Array.isArray(cat.defaultForTaskTypes)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// RED 2: ToolCategory Zod schema
// ---------------------------------------------------------------------------

describe('ToolCategorySchema', () => {
  it('should validate valid categories', () => {
    expect(ToolCategorySchema.parse('web-data')).toBe('web-data');
    expect(ToolCategorySchema.parse('code-dev')).toBe('code-dev');
    expect(ToolCategorySchema.parse('communication')).toBe('communication');
    expect(ToolCategorySchema.parse('knowledge')).toBe('knowledge');
    expect(ToolCategorySchema.parse('creative')).toBe('creative');
    expect(ToolCategorySchema.parse('enterprise')).toBe('enterprise');
  });

  it('should reject invalid categories', () => {
    expect(() => ToolCategorySchema.parse('invalid')).toThrow();
    expect(() => ToolCategorySchema.parse('')).toThrow();
    expect(() => ToolCategorySchema.parse(123)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RED 3: Task-type to category mapping
// ---------------------------------------------------------------------------

describe('getDefaultCategories', () => {
  it('should map "code" to code-dev + knowledge', () => {
    const cats = getDefaultCategories('code');
    expect(cats).toContain('code-dev');
    expect(cats).toContain('knowledge');
  });

  it('should map "research" to web-data + knowledge', () => {
    const cats = getDefaultCategories('research');
    expect(cats).toContain('web-data');
    expect(cats).toContain('knowledge');
  });

  it('should map "analysis" to knowledge + code-dev + web-data', () => {
    const cats = getDefaultCategories('analysis');
    expect(cats).toContain('knowledge');
    expect(cats).toContain('code-dev');
    expect(cats).toContain('web-data');
  });

  it('should map "creative" to creative + web-data + knowledge', () => {
    const cats = getDefaultCategories('creative');
    expect(cats).toContain('creative');
    expect(cats).toContain('web-data');
  });

  it('should map "custom" to all 6 categories', () => {
    const cats = getDefaultCategories('custom');
    expect(cats).toHaveLength(6);
  });

  it('should return all categories for unknown task type', () => {
    const cats = getDefaultCategories('unknown_type');
    expect(cats).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// RED 28-35: InferToolCategory
// ---------------------------------------------------------------------------

describe('inferToolCategory', () => {
  it('should infer code-dev for file/code/git tools', () => {
    expect(inferToolCategory({ name: 'git_commit' })).toBe('code-dev');
    expect(inferToolCategory({ name: 'shell_exec' })).toBe('code-dev');
    expect(inferToolCategory({ name: 'file_write' })).toBe('code-dev');
    expect(inferToolCategory({ name: 'run_tests' })).toBe('code-dev');
    expect(inferToolCategory({ name: 'lint_code' })).toBe('code-dev');
  });

  it('should infer web-data for search/crawl tools', () => {
    expect(inferToolCategory({ name: 'web_crawl' })).toBe('web-data');
    expect(inferToolCategory({ name: 'scrape_url' })).toBe('web-data');
    expect(inferToolCategory({ name: 'rss_feed' })).toBe('web-data');
    expect(inferToolCategory({ name: 'browse_page' })).toBe('web-data');
  });

  it('should infer communication for messaging tools', () => {
    expect(inferToolCategory({ name: 'send_email' })).toBe('communication');
    expect(inferToolCategory({ name: 'slack_post' })).toBe('communication');
    expect(inferToolCategory({ name: 'discord_message' })).toBe('communication');
    expect(inferToolCategory({ name: 'sms_notify' })).toBe('communication');
  });

  it('should infer creative for media tools', () => {
    expect(inferToolCategory({ name: 'generate_image' })).toBe('creative');
    expect(inferToolCategory({ name: 'text_to_speech' })).toBe('creative');
    expect(inferToolCategory({ name: 'draw_diagram' })).toBe('creative');
    expect(inferToolCategory({ name: 'render_video' })).toBe('creative');
  });

  it('should infer knowledge for DB/RAG tools', () => {
    expect(inferToolCategory({ name: 'vector_search' })).toBe('knowledge');
    expect(inferToolCategory({ name: 'database_query' })).toBe('knowledge');
    expect(inferToolCategory({ name: 'rag_retrieve' })).toBe('knowledge');
    expect(inferToolCategory({ name: 'embed_text' })).toBe('knowledge');
  });

  it('should infer enterprise for CRM/project tools', () => {
    expect(inferToolCategory({ name: 'crm_update' })).toBe('enterprise');
    expect(inferToolCategory({ name: 'jira_ticket' })).toBe('enterprise');
    expect(inferToolCategory({ name: 'deploy_service' })).toBe('enterprise');
    expect(inferToolCategory({ name: 'cloud_monitor' })).toBe('enterprise');
  });

  it('should disambiguate "search" based on context', () => {
    expect(inferToolCategory({ name: 'web_search' })).toBe('web-data');
    expect(inferToolCategory({ name: 'google_search' })).toBe('web-data');
    expect(inferToolCategory({ name: 'search_documents', description: 'Search indexed documents' })).toBe('knowledge');
    expect(inferToolCategory({ name: 'search_memory' })).toBe('knowledge');
  });

  it('should default to knowledge for unknown tools', () => {
    expect(inferToolCategory({ name: 'foobar_xyz' })).toBe('knowledge');
    expect(inferToolCategory({ name: 'custom_thing' })).toBe('knowledge');
  });

  it('should use readOnlyHint as fallback signal', () => {
    expect(inferToolCategory({
      name: 'custom_read',
      annotations: { readOnlyHint: true },
    })).toBe('knowledge');
  });
});

// ---------------------------------------------------------------------------
// Builtin category assignments
// ---------------------------------------------------------------------------

describe('BUILTIN_CATEGORIES', () => {
  it('should map all 5 builtin tools to categories', () => {
    expect(BUILTIN_CATEGORIES['web_search']).toBe('web-data');
    expect(BUILTIN_CATEGORIES['web_crawl']).toBe('web-data');
    expect(BUILTIN_CATEGORIES['file_read']).toBe('code-dev');
    expect(BUILTIN_CATEGORIES['file_write']).toBe('code-dev');
    expect(BUILTIN_CATEGORIES['shell_exec']).toBe('code-dev');
  });
});
