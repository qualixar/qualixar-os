// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8a -- DeerFlowReader
 * LLD Section 2.2
 *
 * Parses DeerFlow conf.yaml workflow config into AgentSpec.
 * Supports both flat and nested workflow structures.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ClawReader, AgentSpec, AgentRole, ToolSpec } from '../types/common.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawAgent {
  readonly role?: string;
  readonly name?: string;
  readonly model?: string;
  readonly instructions?: string;
  readonly system_prompt?: string;
  readonly tools?: readonly string[];
  readonly depends_on?: readonly string[];
}

function mapAgent(entry: RawAgent, index: number): AgentRole {
  return {
    role: entry.role ?? entry.name ?? `agent-${index}`,
    model: entry.model ?? '',
    systemPrompt: entry.instructions ?? entry.system_prompt ?? '',
    tools: entry.tools ? [...entry.tools] : undefined,
    dependsOn: entry.depends_on ? [...entry.depends_on] : undefined,
  };
}

function collectToolNames(roles: readonly AgentRole[]): string[] {
  const toolSet = new Set<string>();
  for (const role of roles) {
    if (role.tools) {
      for (const tool of role.tools) {
        toolSet.add(tool);
      }
    }
  }
  return [...toolSet];
}

// ---------------------------------------------------------------------------
// DeerFlowReader
// ---------------------------------------------------------------------------

export class DeerFlowReader implements ClawReader {
  canRead(path: string): boolean {
    if (!path) {
      return false;
    }
    const filename = basename(path).toLowerCase();
    // Exact match for conf.yaml/conf.yml
    if (filename === 'conf.yaml' || filename === 'conf.yml') {
      return true;
    }
    // Flexible: any .yaml/.yml with DeerFlow-like content (workflow/agents keys)
    if ((filename.endsWith('.yaml') || filename.endsWith('.yml')) && existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8').slice(0, 2000);
        return content.includes('workflow:') || (content.includes('agents:') && content.includes('deerflow'));
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
      throw new Error(`DeerFlowReader: Cannot read file: ${path} — ${msg}`);
    }

    let config: Record<string, unknown>;
    try {
      const parsed = parseYaml(content);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Not an object');
      }
      config = parsed as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`DeerFlowReader: Malformed YAML in ${path} — ${msg}`);
    }

    const workflow = config.workflow as Record<string, unknown> | undefined;

    // Extract name and description
    const name = (workflow?.name ?? config.name ?? 'deerflow-agent') as string;
    const description = (workflow?.description ?? config.description ?? '') as string;

    // Build roles from agents array
    const rawAgents = (workflow?.agents ?? config.agents) as RawAgent[] | undefined;
    const roles: AgentRole[] = Array.isArray(rawAgents)
      ? rawAgents.map((entry, i) => mapAgent(entry, i))
      : [];

    // Collect unique tools
    const toolNames = collectToolNames(roles);
    const tools: ToolSpec[] = toolNames.map((toolName) => ({
      name: toolName,
      description: '',
      parameters: {},
    }));

    // Build config from non-consumed keys
    const consumedKeys = new Set(['name', 'description', 'agents', 'workflow']);
    const extraConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (!consumedKeys.has(key)) {
        extraConfig[key] = value;
      }
    }

    return {
      version: 1,
      name,
      description,
      roles,
      tools,
      config: extraConfig,
      source: { format: 'deerflow', originalPath: path },
    };
  }

  getFormat(): string {
    return 'deerflow';
  }
}
