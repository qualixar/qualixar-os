// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Tool Registry
 *
 * Session 14 C-01: Register and look up tools by name.
 * Provides JSON Schema for LLM tool-use and executes tool handlers.
 *
 * Pattern: Registry -- tools registered at bootstrap, looked up by
 * the SwarmEngine during agent execution when an LLM requests a tool call.
 */

import type { EventBus } from '../events/event-bus.js';
import { webSearch, isWebSearchAvailable, isTavilyAvailable, duckDuckGoSearch, isAnySearchAvailable } from './web-search.js';
import { fileRead, fileWrite } from './file-tools.js';
import type { FileToolsConfig } from './file-tools.js';
import { shellExec } from './shell-tool.js';
import type { ShellToolConfig } from './shell-tool.js';
import { webCrawlHandler } from './web-crawler.js';
import { httpRequest } from './http-tool.js';
import { jsonTransform } from './json-tool.js';
import { textAnalyze } from './text-tool.js';
import { codeValidate } from './code-tool.js';
import type { FilesystemSandboxImpl } from '../security/filesystem-sandbox.js';
import {
  type ToolCategory,
  type ToolCategoryInfo,
  TOOL_CATEGORIES,
  BUILTIN_CATEGORIES,
  BUILTIN_NAMES,
} from './tool-categories.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (input: Record<string, unknown>) => Promise<ToolResult>;
  readonly category?: ToolCategory;
  readonly source?: 'builtin' | 'mcp' | 'skill';
  readonly annotations?: ToolAnnotations;
}

export interface ToolAnnotations {
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly idempotent?: boolean;
  readonly openWorld?: boolean;
}

/** Lightweight entry for injecting into LLM prompts (saves tokens) */
export interface ToolCatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
}

export interface ToolResult {
  readonly content: string;
  readonly isError?: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(): readonly ToolDefinition[];
  execute(name: string, input: Record<string, unknown>): Promise<ToolResult>;
  toToolSchemas(): readonly ToolSchema[];
}

/** Extended interface with category support — used by Forge, Dashboard, Connectors */
export interface CategorizedToolRegistry extends ToolRegistry {
  listByCategory(category: ToolCategory): readonly ToolDefinition[];
  getCategories(): readonly ToolCategoryInfo[];
  getCatalogSummary(): readonly ToolCatalogEntry[];
  toToolSchemasForAgent(toolNames: readonly string[]): readonly ToolSchema[];
  unregisterBySource(source: string, sourceId: string): number;
}

/**
 * Provider-agnostic tool schema for sending to LLMs.
 * Converted to Anthropic or OpenAI format at the ModelCall layer.
 */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ToolRegistryImpl implements CategorizedToolRegistry {
  private readonly _tools: Map<string, ToolDefinition> = new Map();
  private readonly _categoryIndex: Map<ToolCategory, Set<string>> = new Map();
  private readonly _eventBus?: EventBus;

  constructor(eventBus?: EventBus) {
    this._eventBus = eventBus;
  }

  register(tool: ToolDefinition): void {
    const effectiveCategory = tool.category ?? BUILTIN_CATEGORIES[tool.name] ?? 'knowledge';
    const effectiveSource = tool.source ?? 'builtin';

    // R4: Builtin tools are immutable — non-builtins cannot overwrite them
    if (BUILTIN_NAMES.has(tool.name) && effectiveSource !== 'builtin') {
      throw new Error(`Cannot overwrite builtin tool '${tool.name}'`);
    }

    const existing = this._tools.get(tool.name);
    if (existing && (existing.source ?? 'builtin') === 'builtin') {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    // Allow overwriting non-builtin tools (e.g., MCP refresh)
    if (existing) {
      const oldCategory = existing.category ?? 'knowledge';
      this._categoryIndex.get(oldCategory)?.delete(tool.name);
    }

    // Store with effective defaults
    const enriched: ToolDefinition = {
      ...tool,
      category: effectiveCategory,
      source: effectiveSource,
    };
    this._tools.set(tool.name, enriched);

    // Update category index
    const catSet = this._categoryIndex.get(effectiveCategory) ?? new Set();
    catSet.add(tool.name);
    this._categoryIndex.set(effectiveCategory, catSet);

    // Only emit events for non-builtin registrations (MCP, skill).
    // Built-ins register during bootstrap — emitting events there
    // pollutes the event log and breaks E2E event count assertions.
    if (effectiveSource !== 'builtin') {
      this._eventBus?.emit({
        type: 'tool:registered',
        payload: { name: tool.name, category: effectiveCategory, source: effectiveSource },
        source: 'tool-registry',
      });
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this._tools.get(name);
  }

  list(): readonly ToolDefinition[] {
    return Array.from(this._tools.values());
  }

  listByCategory(category: ToolCategory): readonly ToolDefinition[] {
    const names = this._categoryIndex.get(category);
    if (!names || names.size === 0) return [];
    return Array.from(names)
      .map((n) => this._tools.get(n))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  getCategories(): readonly ToolCategoryInfo[] {
    return TOOL_CATEGORIES;
  }

  getCatalogSummary(): readonly ToolCatalogEntry[] {
    return Array.from(this._tools.values()).map((t) => ({
      name: t.name,
      description: t.description.length > 80
        ? t.description.substring(0, 77) + '...'
        : t.description,
      category: t.category ?? 'knowledge',
    }));
  }

  toToolSchemasForAgent(toolNames: readonly string[]): readonly ToolSchema[] {
    return toolNames
      .map((name) => this._tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
  }

  unregisterBySource(source: string, _sourceId: string): number {
    let removed = 0;
    for (const [name, tool] of this._tools) {
      if ((tool.source ?? 'builtin') === source) {
        const cat = tool.category ?? 'knowledge';
        this._categoryIndex.get(cat)?.delete(name);
        this._tools.delete(name);
        removed++;
      }
    }
    return removed;
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this._tools.get(name);
    if (!tool) {
      return { content: `Tool '${name}' not found`, isError: true };
    }

    this._eventBus?.emit({
      type: 'chat:tool_call_started',
      payload: { tool: name, input },
      source: 'tool-registry',
    });

    try {
      const result = await tool.handler(input);
      this._eventBus?.emit({
        type: 'chat:tool_call_completed',
        payload: { tool: name, isError: result.isError ?? false },
        source: 'tool-registry',
      });
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this._eventBus?.emit({
        type: 'chat:tool_call_completed',
        payload: { tool: name, isError: true, error: errMsg },
        source: 'tool-registry',
      });
      return { content: `Tool '${name}' failed: ${errMsg}`, isError: true };
    }
  }

  toToolSchemas(): readonly ToolSchema[] {
    return Array.from(this._tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }
}

// ---------------------------------------------------------------------------
// Built-in Tools (real implementations with graceful degradation)
// ---------------------------------------------------------------------------

/**
 * Create the 4 core built-in tools.
 * When sandbox is not provided, file/shell tools use stub mode
 * (for backward compatibility in tests). Pass a sandbox for real execution.
 */
export function createBuiltInTools(sandbox?: FilesystemSandboxImpl | null): readonly ToolDefinition[] {
  const hasSandbox = sandbox != null;
  const fileConfig: FileToolsConfig = { sandbox: sandbox ?? null };
  const shellConfig: ShellToolConfig = { sandbox: sandbox ?? null };

  return [
    {
      name: 'web_search',
      description: 'Search the web using Tavily API (or DuckDuckGo fallback) and return relevant results',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Maximum number of results (default: 5)' },
        },
        required: ['query'],
      },
      handler: async (input) => {
        const query = input.query as string;
        const maxResults = (input.maxResults as number) ?? 5;

        // Prefer Tavily if available, fall back to DuckDuckGo
        if (isTavilyAvailable()) {
          const results = await webSearch(query, { maxResults });
          return { content: JSON.stringify(results, null, 2) };
        }

        // DuckDuckGo fallback (free, no key)
        const results = await duckDuckGoSearch(query, { maxResults });
        return { content: JSON.stringify(results, null, 2) };
      },
    },
    {
      name: 'file_read',
      description: 'Read the contents of a file at the given path (sandbox-enforced)',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' },
        },
        required: ['path'],
      },
      handler: async (input) => {
        if (!hasSandbox) {
          return { content: `[stub] Would read file: ${input.path}` };
        }
        return fileRead(input, fileConfig);
      },
    },
    {
      name: 'file_write',
      description: 'Write content to a file at the given path (sandbox-enforced)',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      handler: async (input) => {
        if (!hasSandbox) {
          return { content: `[stub] Would write to: ${input.path}` };
        }
        return fileWrite(input, fileConfig);
      },
    },
    {
      name: 'shell_exec',
      description: 'Execute a shell command and return stdout/stderr (security-validated)',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
      handler: async (input) => {
        if (!hasSandbox) {
          return { content: `[stub] Would execute: ${input.command}` };
        }
        return shellExec(input, shellConfig);
      },
    },
  ];
}

/**
 * Create extended tools (web_crawl etc.) that don't need a sandbox.
 */
export function createExtendedTools(): readonly ToolDefinition[] {
  return [
    {
      name: 'web_crawl',
      description: 'Crawl a URL and extract text content, title, and links',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to crawl' },
        },
        required: ['url'],
      },
      handler: async (input) => webCrawlHandler(input),
    },
    {
      name: 'http_request',
      description: 'Make HTTP requests to external APIs',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL' },
          method: { type: 'string', description: 'HTTP method (default: GET)' },
          headers: { type: 'object', description: 'Request headers' },
          body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
        },
        required: ['url'],
      },
      handler: async (input) => httpRequest(input),
    },
    {
      name: 'json_transform',
      description: 'Extract and transform JSON data using JSONPath-like expressions',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'JSON string to parse' },
          expression: { type: 'string', description: 'Dot-notation path (e.g. users[0].name, items.*.price)' },
        },
        required: ['data', 'expression'],
      },
      handler: async (input) => jsonTransform(input),
    },
    {
      name: 'text_analyze',
      description: 'Analyze text content — word count, reading level, key phrases',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content to analyze' },
          analyses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Analyses to run: word_count, sentence_count, reading_level, key_phrases, char_count',
          },
        },
        required: ['text'],
      },
      handler: async (input) => textAnalyze(input),
    },
    {
      name: 'code_validate',
      description: 'Validate code syntax for common languages',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to validate' },
          language: { type: 'string', description: 'Language: json, js, ts, python, html, css, java, go, rust, etc.' },
        },
        required: ['code', 'language'],
      },
      handler: async (input) => codeValidate(input),
    },
  ];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a tool registry with the 4 core built-in tools.
 * Pass includeExtended: true to also register web_crawl and other extras.
 */
export function createToolRegistry(
  eventBus?: EventBus,
  sandbox?: FilesystemSandboxImpl | null,
  options?: { includeExtended?: boolean },
): CategorizedToolRegistry {
  const registry = new ToolRegistryImpl(eventBus);
  for (const tool of createBuiltInTools(sandbox)) {
    registry.register(tool);
  }
  if (options?.includeExtended) {
    for (const tool of createExtendedTools()) {
      registry.register(tool);
    }
  }
  return registry;
}
