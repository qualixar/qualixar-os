// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8a -- OpenClawReader
 * LLD Section 2.1
 *
 * Parses SOUL.md files (OpenClaw/Cursor agent format) into AgentSpec.
 * Handles YAML frontmatter + markdown body with ## sections.
 */

import { readFile, readFile as readFileAsync } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ClawReader, AgentSpec, AgentRole, ToolSpec } from '../types/common.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Split markdown into {frontmatter, body}. */
function splitFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const trimmed = content.trim();

  if (!trimmed.startsWith('---')) {
    return { meta: {}, body: trimmed };
  }

  const secondDelim = trimmed.indexOf('---', 3);
  if (secondDelim === -1) {
    return { meta: {}, body: trimmed };
  }

  const yamlBlock = trimmed.slice(3, secondDelim).trim();
  const body = trimmed.slice(secondDelim + 3).trim();

  const parsed = parseYaml(yamlBlock);
  const meta = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};

  return { meta, body };
}

/** Extract tool names from a ## Tools section in markdown. */
function extractToolsFromBody(body: string): string[] {
  const tools: string[] = [];
  const toolsSectionRegex = /## Tools\s*\n([\s\S]*?)(?=\n## |\n# |$)/i;
  const match = toolsSectionRegex.exec(body);

  if (!match) {
    return tools;
  }

  const section = match[1];
  const lineRegex = /^[-*]\s+(\S+)/gm;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRegex.exec(section)) !== null) {
    const toolName = lineMatch[1].replace(/:$/, '');
    tools.push(toolName);
  }

  return tools;
}

// ---------------------------------------------------------------------------
// OpenClawReader
// ---------------------------------------------------------------------------

export class OpenClawReader implements ClawReader {
  canRead(path: string): boolean {
    if (!path) {
      return false;
    }
    const filename = basename(path).toLowerCase();
    // Exact match for soul.md or *.soul.md
    if (filename === 'soul.md' || filename.endsWith('.soul.md')) {
      return true;
    }
    // Flexible: any .md file containing SOUL/agent definition markers
    if (filename.endsWith('.md') && existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8').slice(0, 2000);
        return content.includes('# SOUL') || content.includes('## Identity') || content.includes('## Tools');
      } catch {
        return false;
      }
    }
    return false;
  }

  async read(path: string): Promise<AgentSpec> {
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenClawReader: Cannot read file: ${path} — ${msg}`);
    }

    const { meta, body } = splitFrontmatter(content);

    // Extract fields from frontmatter
    const name = typeof meta.name === 'string' ? meta.name : '';
    const description = typeof meta.description === 'string' ? meta.description : '';
    const model = typeof meta.model === 'string' ? meta.model : '';
    const frontmatterTools = Array.isArray(meta.tools)
      ? (meta.tools as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];

    // Extract tools from body
    const bodyTools = extractToolsFromBody(body);

    // Deduplicate tools
    const allToolNames = [...new Set([...frontmatterTools, ...bodyTools])];

    // Build roles
    const roles: AgentRole[] = [];
    if (name || model || body) {
      roles.push({
        role: name || 'default',
        model,
        systemPrompt: body,
        tools: allToolNames.length > 0 ? allToolNames : undefined,
      });
    }

    // Build ToolSpec array
    const tools: ToolSpec[] = allToolNames.map((toolName) => ({
      name: toolName,
      description: '',
      parameters: {},
    }));

    // Build config from remaining meta fields
    const consumedKeys = new Set(['name', 'description', 'model', 'tools']);
    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (!consumedKeys.has(key)) {
        config[key] = value;
      }
    }

    // Determine name with fallback to directory name
    const resolvedName = name || basename(dirname(path));

    return {
      version: 1,
      name: resolvedName,
      description,
      roles,
      tools,
      config,
      source: { format: 'openclaw', originalPath: path },
    };
  }

  getFormat(): string {
    return 'openclaw';
  }
}
