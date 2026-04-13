// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Interop Commands
 *
 * Import agent definitions from external formats (OpenClaw, DeerFlow,
 * NemoClaw, GitAgent) via AgentConverter.
 *
 * Source: Phase 10 LLD Section 2.11
 */

import { z } from 'zod';
import * as nodePath from 'node:path';
import { defineCommand, type CommandDefinition, type CommandContext, type CommandResult } from './types.js';
import { AgentConverter } from '../compatibility/converter.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------

const importSchema = z.object({
  path: z.string().min(1).describe('Path to agent definition file'),
  format: z
    .enum(['openclaw', 'deerflow', 'nemoclaw', 'gitagent'])
    .optional()
    .describe('Agent format, auto-detected if omitted'),
});

async function handleImport(
  ctx: CommandContext,
  input: z.infer<typeof importSchema>,
): Promise<CommandResult> {
  try {
    const resolved = nodePath.resolve(input.path);
    const converter = new AgentConverter();
    const spec = await converter.detectAndConvert(resolved);
    const agentId = generateId();

    ctx.db.insert('imported_agents', {
      id: agentId,
      source_format: spec.source.format,
      original_path: resolved,
      agent_spec: JSON.stringify(spec),
      version: spec.version,
      created_at: new Date().toISOString(),
    });

    ctx.eventBus.emit({
      type: 'compat:agent_imported' as never,
      payload: {
        agentId,
        name: spec.name,
        sourceFormat: spec.source.format,
      },
      source: 'command',
    });

    return {
      success: true,
      data: {
        id: agentId,
        name: spec.name,
        format: spec.source.format,
        roles: spec.roles.length,
        tools: spec.tools.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'IMPORT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const interopCommands: readonly CommandDefinition[] = [
  defineCommand({
    name: 'import',
    category: 'interop',
    description: 'Import an agent definition from an external format',
    inputSchema: importSchema,
    handler: handleImport,
  }),
];
