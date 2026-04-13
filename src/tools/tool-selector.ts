// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase Pivot-2 -- Tool Selector
 *
 * Three-layer hybrid tool selection for Forge:
 *   Layer 1: Category-first filter (static mapping, zero-cost)
 *   Layer 2: Catalog injection (format for Forge prompt)
 *   Layer 3: Validation & fallback (strip invalid, cap at 10)
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 2.3, Algorithm 4.2
 */

import type { CategorizedToolRegistry, ToolCatalogEntry } from './tool-registry.js';
import { getDefaultCategories, type ToolCategory } from './tool-categories.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap: no agent gets more than 10 tools (research-backed) */
const MAX_TOOLS_PER_AGENT = 10;

/** Default tool count when assigning fallbacks */
const MAX_DEFAULT_TOOLS = 5;

/** Max description length in catalog entries */
const MAX_DESC_LENGTH = 80;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ToolSelector {
  /** Get tool catalog filtered by task type (for Forge prompt injection) */
  getCatalogForTask(taskType: string): readonly ToolCatalogEntry[];

  /** Validate and fix tool selections from Forge LLM output */
  validateSelections(
    selections: readonly string[],
    taskType: string,
  ): readonly string[];

  /** Get default tools for a task type (fallback when LLM returns empty) */
  getDefaultsForTaskType(taskType: string): readonly string[];

  /** Format catalog as text for injection into Forge design prompt */
  formatCatalogForPrompt(taskType: string): string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ToolSelectorImpl implements ToolSelector {
  private readonly _registry: CategorizedToolRegistry;

  constructor(registry: CategorizedToolRegistry) {
    this._registry = registry;
  }

  getCatalogForTask(taskType: string): readonly ToolCatalogEntry[] {
    const relevantCategories = getDefaultCategories(taskType);
    const entries: ToolCatalogEntry[] = [];

    for (const category of relevantCategories) {
      const tools = this._registry.listByCategory(category);
      for (const tool of tools) {
        entries.push({
          name: tool.name,
          description: tool.description.length > MAX_DESC_LENGTH
            ? tool.description.substring(0, MAX_DESC_LENGTH - 3) + '...'
            : tool.description,
          category: (tool.category ?? 'knowledge') as ToolCategory,
        });
      }
    }

    return entries;
  }

  validateSelections(
    selections: readonly string[],
    _taskType: string,
  ): readonly string[] {
    const valid = selections.filter((name) => this._registry.get(name) !== undefined);
    if (valid.length > MAX_TOOLS_PER_AGENT) {
      return valid.slice(0, MAX_TOOLS_PER_AGENT);
    }
    return valid;
  }

  getDefaultsForTaskType(taskType: string): readonly string[] {
    const relevantCategories = getDefaultCategories(taskType);
    const defaults: string[] = [];

    for (const category of relevantCategories) {
      if (defaults.length >= MAX_DEFAULT_TOOLS) break;
      const tools = this._registry.listByCategory(category);
      for (const tool of tools) {
        if (defaults.length >= MAX_DEFAULT_TOOLS) break;
        defaults.push(tool.name);
      }
    }

    return defaults;
  }

  formatCatalogForPrompt(taskType: string): string {
    const catalog = this.getCatalogForTask(taskType);
    if (catalog.length === 0) return '';

    // Group by category
    const grouped = new Map<string, ToolCatalogEntry[]>();
    for (const entry of catalog) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }

    const lines: string[] = [
      `Available Tools (select 3-8 per agent from this list):`,
    ];

    for (const [category, tools] of grouped) {
      for (const tool of tools) {
        lines.push(`  [${category}] ${tool.name}: ${tool.description}`);
      }
    }

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createToolSelector(registry: CategorizedToolRegistry): ToolSelector {
  return new ToolSelectorImpl(registry);
}
