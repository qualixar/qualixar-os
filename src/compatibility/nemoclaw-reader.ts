// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8a -- NemoClawReader
 * LLD Section 2.3
 *
 * Parses NemoClaw YAML policy files into AgentSpec.
 * Preserves security rules and policy config in the spec's config field.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ClawReader, AgentSpec, AgentRole, ToolSpec } from '../types/common.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawNemoAgent {
  readonly role?: string;
  readonly name?: string;
  readonly model?: string;
  readonly instructions?: string;
  readonly tools?: readonly string[];
}

function mapNemoAgent(entry: RawNemoAgent, index: number): AgentRole {
  return {
    role: entry.role ?? entry.name ?? `agent-${index}`,
    model: entry.model ?? '',
    systemPrompt: entry.instructions ?? '',
    tools: entry.tools ? [...entry.tools] : undefined,
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
// NemoClawReader
// ---------------------------------------------------------------------------

export class NemoClawReader implements ClawReader {
  canRead(path: string): boolean {
    if (!path) {
      return false;
    }
    const filename = basename(path).toLowerCase();
    const hasNemoKeyword = filename.includes('nemoclaw') || filename.includes('nemo');
    const hasYamlExt = filename.endsWith('.yaml') || filename.endsWith('.yml');
    return hasNemoKeyword && hasYamlExt;
  }

  async read(path: string): Promise<AgentSpec> {
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`NemoClawReader: Cannot read file: ${path} — ${msg}`);
    }

    let policy: Record<string, unknown>;
    try {
      const parsed = parseYaml(content);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Not an object');
      }
      policy = parsed as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`NemoClawReader: Malformed YAML in ${path} — ${msg}`);
    }

    const agentBlock = policy.agent as Record<string, unknown> | undefined;

    // Extract name and description
    const name = (agentBlock?.name ?? policy.name ?? 'nemoclaw-agent') as string;
    const description = (agentBlock?.description ?? policy.description ?? '') as string;

    // Build roles
    const roles: AgentRole[] = [];

    if (agentBlock && typeof agentBlock === 'object') {
      roles.push(mapNemoAgent(agentBlock as RawNemoAgent, 0));
    }

    const agentsArray = policy.agents as RawNemoAgent[] | undefined;
    if (Array.isArray(agentsArray)) {
      for (let i = 0; i < agentsArray.length; i++) {
        roles.push(mapNemoAgent(agentsArray[i], i));
      }
    }

    // Collect tools
    const toolNames = collectToolNames(roles);
    const tools: ToolSpec[] = toolNames.map((toolName) => ({
      name: toolName,
      description: '',
      parameters: {},
    }));

    // Build config -- preserve security and rules, plus other non-consumed keys
    const consumedKeys = new Set(['name', 'description', 'agent', 'agents']);
    const extraConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(policy)) {
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
      source: { format: 'nemoclaw', originalPath: path },
    };
  }

  getFormat(): string {
    return 'nemoclaw';
  }
}
