// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Forge Commands
 *
 * 2 commands: forge.design, forge.topologies
 * forge.design is a dry-run designer when no taskId is provided (H-3).
 * forge.topologies returns available topologies from feature gates.
 *
 * Source: Phase 10 LLD Section 2.7
 */

import { z } from 'zod';
import { generateId } from '../utils/id.js';
import type { CommandDefinition, CommandContext, CommandResult } from './types.js';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const DesignSchema = z.object({
  taskType: z.string().min(1).describe('Type of task to design a team for'),
  prompt: z.string().min(1).describe('Task prompt for team design'),
  mode: z.enum(['companion', 'power']).optional().describe('Execution mode'),
  taskId: z.string().optional().describe('Existing task ID. If omitted, a temporary ID is generated for dry-run design.'),
});

const TopologiesSchema = z.object({});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

type DesignInput = z.infer<typeof DesignSchema>;

// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------

export const forgeCommands: readonly CommandDefinition[] = [
  {
    name: 'forge.design',
    category: 'forge',
    description: 'Design a team for a task type (dry-run if no taskId)',
    inputSchema: DesignSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as DesignInput;
        const taskId = input.taskId ?? generateId();
        const design = await ctx.orchestrator.forge.designTeam({
          taskId,
          prompt: input.prompt,
          taskType: input.taskType,
          mode: input.mode ?? 'companion',
        });
        return { success: true, data: { ...design, dryRun: !input.taskId } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'forge.topologies',
    category: 'forge',
    description: 'List all available swarm topologies',
    inputSchema: TopologiesSchema,
    type: 'query',
    handler: async (ctx: CommandContext, _raw): Promise<CommandResult> => {
      try {
        const gates = ctx.orchestrator.modeEngine.getFeatureGates();
        return { success: true, data: gates.topologies };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
];
