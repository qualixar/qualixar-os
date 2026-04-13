// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Agent Commands
 *
 * 2 commands: agents.list, agents.inspect
 * Uses direct DB queries for full data (audit finding H-4: agentRegistry
 * return type is too narrow for full agent details).
 *
 * Source: Phase 10 LLD Section 2.6
 */

import { z } from 'zod';
import type { CommandDefinition, CommandContext, CommandResult } from './types.js';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const ListAgentsSchema = z.object({
  taskId: z.string().optional().describe('Filter agents by task ID'),
  status: z.enum(['idle', 'running', 'completed', 'failed', 'terminated']).optional().describe('Filter by status'),
});

const InspectSchema = z.object({
  agentId: z.string().min(1).describe('Agent ID to inspect'),
});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

type ListAgentsInput = z.infer<typeof ListAgentsSchema>;
type InspectInput = z.infer<typeof InspectSchema>;

// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------

export const agentCommands: readonly CommandDefinition[] = [
  {
    name: 'agents.list',
    category: 'agents',
    description: 'List agents, optionally filtered by task or status',
    inputSchema: ListAgentsSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as ListAgentsInput;
        if (input.taskId) {
          let sql = 'SELECT id, status, role, task_id FROM agents WHERE task_id = ?';
          const params: unknown[] = [input.taskId];
          if (input.status) {
            sql += ' AND status = ?';
            params.push(input.status);
          }
          const rows = ctx.db.query(sql, params);
          return { success: true, data: rows };
        }
        const agents = ctx.orchestrator.agentRegistry.listAgents();
        const filtered = input.status
          ? agents.filter((a) => a.status === input.status)
          : agents;
        return { success: true, data: filtered };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'agents.inspect',
    category: 'agents',
    description: 'Inspect a single agent with full details and model call history',
    inputSchema: InspectSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as InspectInput;
        const agent = ctx.db.get<{ id: string; status: string; role: string; task_id: string; output: string }>(
          'SELECT id, status, role, task_id, output FROM agents WHERE id = ?',
          [input.agentId],
        );
        if (!agent) {
          return { success: false, error: { code: 'AGENT_NOT_FOUND', message: `Agent not found: ${input.agentId}` } };
        }
        const calls = ctx.db.query('SELECT * FROM model_calls WHERE agent_id = ?', [input.agentId]);
        return { success: true, data: { agent, output: agent.output ?? '', modelCalls: calls } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
];
