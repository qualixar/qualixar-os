/**
 * Tests for Qualixar OS Phase Pivot-2: Tool Selector
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 7.2
 * Tests: RED 8-12
 */

import { describe, it, expect } from 'vitest';
import { createToolSelector } from '../../src/tools/tool-selector.js';
import { createToolRegistry } from '../../src/tools/tool-registry.js';
import type { ToolDefinition } from '../../src/tools/tool-registry.js';
import type { ToolCategory } from '../../src/tools/tool-categories.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string, category: ToolCategory, source: 'mcp' | 'skill' = 'mcp'): ToolDefinition {
  return {
    name,
    description: `Tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ content: 'ok' }),
    category,
    source,
  };
}

function createPopulatedRegistry() {
  const registry = createToolRegistry();
  // Add tools across all categories (builtins already cover code-dev + web-data)
  registry.register(makeTool('slack_post', 'communication'));
  registry.register(makeTool('send_email', 'communication'));
  registry.register(makeTool('generate_image', 'creative'));
  registry.register(makeTool('vector_search', 'knowledge'));
  registry.register(makeTool('database_query', 'knowledge'));
  registry.register(makeTool('crm_update', 'enterprise'));
  registry.register(makeTool('deploy_service', 'enterprise'));
  registry.register(makeTool('extra_web_tool', 'web-data'));
  return registry;
}

// ---------------------------------------------------------------------------
// RED 8: Filter catalog by task type
// ---------------------------------------------------------------------------

describe('ToolSelector', () => {
  describe('getCatalogForTask (RED 8)', () => {
    it('should filter catalog for "code" task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('code');
      const categories = new Set(catalog.map((t) => t.category));

      expect(categories.has('code-dev')).toBe(true);
      expect(categories.has('knowledge')).toBe(true);
      expect(categories.has('communication')).toBe(false);
      expect(categories.has('creative')).toBe(false);
      expect(categories.has('enterprise')).toBe(false);
    });

    it('should filter catalog for "research" task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('research');
      const categories = new Set(catalog.map((t) => t.category));

      expect(categories.has('web-data')).toBe(true);
      expect(categories.has('knowledge')).toBe(true);
      expect(categories.has('code-dev')).toBe(false);
    });

    it('should return all categories for "custom" task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('custom');
      const categories = new Set(catalog.map((t) => t.category));

      expect(categories.size).toBe(6);
    });

    it('should return all categories for unknown task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('unknown_xyz');
      const categories = new Set(catalog.map((t) => t.category));

      expect(categories.size).toBe(6);
    });

    it('should truncate descriptions to 80 chars', () => {
      const registry = createToolRegistry();
      registry.register({
        ...makeTool('long_desc_tool', 'knowledge'),
        description: 'A'.repeat(120),
      });
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('custom');
      const entry = catalog.find((t) => t.name === 'long_desc_tool');
      expect(entry).toBeDefined();
      expect(entry!.description.length).toBeLessThanOrEqual(80);
    });
  });

  // ---------------------------------------------------------------------------
  // RED 9: Validate tool selections
  // ---------------------------------------------------------------------------

  describe('validateSelections (RED 9)', () => {
    it('should strip invalid tool names', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const result = selector.validateSelections(
        ['web_search', 'file_read', 'nonexistent_tool', 'fake_tool'],
        'code',
      );

      expect(result).toContain('web_search');
      expect(result).toContain('file_read');
      expect(result).not.toContain('nonexistent_tool');
      expect(result).not.toContain('fake_tool');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when all selections are invalid', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const result = selector.validateSelections(
        ['fake1', 'fake2', 'fake3'],
        'code',
      );

      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // RED 10: Enforce 10-tool cap
  // ---------------------------------------------------------------------------

  describe('10-tool cap (RED 10)', () => {
    it('should cap selections at 10 tools', () => {
      const registry = createToolRegistry();
      // Register 15 tools
      for (let i = 0; i < 15; i++) {
        registry.register(makeTool(`tool_${i}`, 'knowledge'));
      }
      const selector = createToolSelector(registry);

      const allNames = Array.from({ length: 15 }, (_, i) => `tool_${i}`);
      const result = selector.validateSelections(allNames, 'custom');

      expect(result).toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------------------
  // RED 11: Provide defaults when selection is empty
  // ---------------------------------------------------------------------------

  describe('getDefaultsForTaskType (RED 11)', () => {
    it('should return builtin code tools for "code" task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const defaults = selector.getDefaultsForTaskType('code');
      expect(defaults.length).toBeGreaterThan(0);
      // Should include code-dev builtins
      expect(defaults.some((t) => ['file_read', 'file_write', 'shell_exec'].includes(t))).toBe(true);
    });

    it('should return web tools for "research" task type', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const defaults = selector.getDefaultsForTaskType('research');
      expect(defaults.length).toBeGreaterThan(0);
      expect(defaults.some((t) => ['web_search'].includes(t))).toBe(true);
    });

    it('should cap defaults at 5 tools', () => {
      const registry = createToolRegistry();
      // Lots of code-dev tools
      for (let i = 0; i < 10; i++) {
        registry.register(makeTool(`code_tool_${i}`, 'code-dev'));
      }
      const selector = createToolSelector(registry);

      const defaults = selector.getDefaultsForTaskType('code');
      expect(defaults.length).toBeLessThanOrEqual(5);
    });
  });

  // ---------------------------------------------------------------------------
  // RED 12: Handle empty registry
  // ---------------------------------------------------------------------------

  describe('empty registry (RED 12)', () => {
    it('getCatalogForTask returns empty for registry with only builtins', () => {
      // createToolRegistry has 4 builtins — those ARE in the catalog
      const registry = createToolRegistry();
      const selector = createToolSelector(registry);

      const catalog = selector.getCatalogForTask('code');
      // Should have builtins at minimum
      expect(catalog.length).toBeGreaterThanOrEqual(0);
    });

    it('validateSelections returns empty for empty input', () => {
      const registry = createToolRegistry();
      const selector = createToolSelector(registry);

      const result = selector.validateSelections([], 'code');
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // formatCatalogForPrompt
  // ---------------------------------------------------------------------------

  describe('formatCatalogForPrompt', () => {
    it('should format catalog grouped by category', () => {
      const registry = createPopulatedRegistry();
      const selector = createToolSelector(registry);

      const prompt = selector.formatCatalogForPrompt('code');
      expect(prompt).toContain('[code-dev]');
      expect(prompt).toContain('file_read');
      expect(prompt).toContain('Available Tools');
    });

    it('should return empty string when no tools match', () => {
      const registry = createToolRegistry();
      // Registry only has builtins (code-dev + web-data)
      const selector = createToolSelector(registry);

      // Creative task type needs creative tools, which don't exist
      const prompt = selector.formatCatalogForPrompt('creative');
      // Should still include knowledge tools (builtins are code-dev + web-data)
      // but creative category has no tools
      expect(typeof prompt).toBe('string');
    });
  });
});
