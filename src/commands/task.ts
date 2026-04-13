// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Task Commands
 *
 * 8 commands: run, status, output, cancel, pause, resume, steer, list
 * All handlers wrap in try-catch and return CommandResult (never throw).
 *
 * Source: Phase 10 LLD Section 2.3
 */

import { z } from 'zod';
import type { CommandDefinition, CommandContext, CommandResult } from './types.js';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const RunSchema = z.object({
  prompt: z.string().min(1).describe('Task prompt'),
  type: z.enum(['code', 'research', 'analysis', 'creative', 'custom']).optional().describe('Task type'),
  mode: z.enum(['companion', 'power']).optional().describe('Execution mode'),
  budget_usd: z.number().nonnegative().optional().describe('Budget limit in USD'),
  topology: z.string().optional().describe('Swarm topology'),
  simulate: z.boolean().optional().describe('Run simulation first'),
  stream: z.boolean().optional().describe('Stream output'),
});

const TaskIdSchema = z.object({ taskId: z.string().min(1).describe('Task ID') });

const SteerSchema = z.object({
  taskId: z.string().min(1).describe('Task ID'),
  newPrompt: z.string().min(1).describe('New direction'),
});

const ListSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

type RunInput = z.infer<typeof RunSchema>;
type TaskIdInput = z.infer<typeof TaskIdSchema>;
type SteerInput = z.infer<typeof SteerSchema>;
type ListInput = z.infer<typeof ListSchema>;

// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------

export const taskCommands: readonly CommandDefinition[] = [
  {
    name: 'run',
    category: 'task',
    description: 'Run a new task through the orchestrator pipeline',
    inputSchema: RunSchema,
    streaming: true,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as RunInput;
        const result = await ctx.orchestrator.run({
          prompt: input.prompt,
          type: input.type,
          mode: input.mode,
          budget_usd: input.budget_usd,
          topology: input.topology,
          simulate: input.simulate,
        });
        return { success: true, data: result };
      } catch (err) {
        return { success: false, error: { code: 'TASK_RUN_FAILED', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'status',
    category: 'task',
    description: 'Get the current status of a running task',
    inputSchema: TaskIdSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as TaskIdInput;
        const status = ctx.orchestrator.getStatus(input.taskId);
        return { success: true, data: status };
      } catch (err) {
        return { success: false, error: { code: 'TASK_NOT_FOUND', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'output',
    category: 'task',
    description: 'Retrieve the output of a completed task',
    inputSchema: TaskIdSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as TaskIdInput;
        const rows = ctx.db.query<{ result: string }>('SELECT result FROM tasks WHERE id = ?', [input.taskId]);
        if (rows.length === 0) {
          return { success: false, error: { code: 'TASK_NOT_FOUND', message: `Task not found: ${input.taskId}` } };
        }
        const parsed = JSON.parse(rows[0].result);
        return { success: true, data: { taskId: input.taskId, output: parsed.output, artifacts: parsed.artifacts ?? [] } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'cancel',
    category: 'task',
    description: 'Cancel a running task',
    inputSchema: TaskIdSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as TaskIdInput;
        await ctx.orchestrator.cancel(input.taskId);
        return { success: true, data: { cancelled: true } };
      } catch (err) {
        return { success: false, error: { code: 'CANCEL_FAILED', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'pause',
    category: 'task',
    description: 'Pause a running task',
    inputSchema: TaskIdSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as TaskIdInput;
        await ctx.orchestrator.pause(input.taskId);
        return { success: true, data: { paused: true } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'resume',
    category: 'task',
    description: 'Resume a paused task',
    inputSchema: TaskIdSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as TaskIdInput;
        await ctx.orchestrator.resume(input.taskId);
        return { success: true, data: { resumed: true } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'steer',
    category: 'task',
    description: 'Redirect a running task with a new prompt',
    inputSchema: SteerSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as SteerInput;
        await ctx.orchestrator.redirect(input.taskId, input.newPrompt);
        return { success: true, data: { redirected: true } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'list',
    category: 'task',
    description: 'List tasks with optional status filter and pagination',
    inputSchema: ListSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as ListInput;
        let sql = 'SELECT id, status, type, prompt, cost_usd, created_at FROM tasks';
        const params: unknown[] = [];
        if (input.status) {
          sql += ' WHERE status = ?';
          params.push(input.status);
        }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(input.limit, input.offset);
        const rows = ctx.db.query(sql, params);
        return { success: true, data: rows };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
];
