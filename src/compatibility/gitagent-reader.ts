// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8a -- GitAgentReader
 * LLD Section 2.4
 *
 * Parses GitAgent agent.yaml files into AgentSpec.
 * Handles both single-agent (top-level fields) and multi-agent (agents array).
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ClawReader, AgentSpec, AgentRole, ToolSpec } from '../types/common.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawGitAgent {
  readonly role?: string;
  readonly name?: string;
  readonly model?: string;
  readonly system_prompt?: string;
  readonly prompt?: string;
  readonly tools?: readonly string[];
  readonly depends_on?: readonly string[];
}

function mapGitAgent(entry: RawGitAgent, index: number): AgentRole {
  return {
    role: entry.role ?? entry.name ?? `agent-${index}`,
    model: entry.model ?? '',
    systemPrompt: entry.system_prompt ?? entry.prompt ?? '',
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
// GitAgentReader
// ---------------------------------------------------------------------------

export class GitAgentReader implements ClawReader {
  canRead(path: string): boolean {
    if (!path) {
      return false;
    }
    const filename = basename(path).toLowerCase();
    return filename === 'agent.yaml' || filename === 'agent.yml';
  }

  async read(path: string): Promise<AgentSpec> {
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`GitAgentReader: Cannot read file: ${path} — ${msg}`);
    }

    let agentDef: Record<string, unknown>;
    try {
      const parsed = parseYaml(content);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Not an object');
      }
      agentDef = parsed as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`GitAgentReader: Malformed YAML in ${path} — ${msg}`);
    }

    // Extract name and description
    const name = (agentDef.name ?? 'gitagent-agent') as string;
    const description = (agentDef.description ?? '') as string;

    // Build roles
    const roles: AgentRole[] = [];
    const agentsArray = agentDef.agents as RawGitAgent[] | undefined;

    if (Array.isArray(agentsArray)) {
      // Multi-agent format
      for (let i = 0; i < agentsArray.length; i++) {
        roles.push(mapGitAgent(agentsArray[i], i));
      }
    } else if (agentDef.model || agentDef.system_prompt || agentDef.prompt || agentDef.tools) {
      // Single-agent format from top-level fields
      roles.push(mapGitAgent(agentDef as unknown as RawGitAgent, 0));
    }

    // Collect tools
    const toolNames = collectToolNames(roles);
    const tools: ToolSpec[] = toolNames.map((toolName) => ({
      name: toolName,
      description: '',
      parameters: {},
    }));

    // Build config from non-consumed keys
    const consumedKeys = new Set([
      'name', 'description', 'agents', 'model',
      'system_prompt', 'prompt', 'tools', 'role', 'depends_on',
    ]);
    const extraConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(agentDef)) {
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
      source: { format: 'gitagent', originalPath: path },
    };
  }

  getFormat(): string {
    return 'gitagent';
  }
}
