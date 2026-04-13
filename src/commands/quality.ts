// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Quality Commands
 *
 * Provides judge results inspection for completed tasks.
 *
 * Source: Phase 10 LLD Section 2.8
 */

import { z } from 'zod';
import { defineCommand, type CommandDefinition, type CommandContext, type CommandResult } from './types.js';

// ---------------------------------------------------------------------------
// judges.results
// ---------------------------------------------------------------------------

const judgesResultsSchema = z.object({
  taskId: z.string().min(1).describe('Task ID to retrieve judge results for'),
});

async function handleJudgesResults(
  ctx: CommandContext,
  input: z.infer<typeof judgesResultsSchema>,
): Promise<CommandResult> {
  try {
    const results = ctx.orchestrator.judgePipeline.getResults(input.taskId);

    if (!results || results.length === 0) {
      return { success: true, data: [] };
    }

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'JUDGE_RESULTS_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const qualityCommands: readonly CommandDefinition[] = [
  defineCommand({
    name: 'judges.results',
    category: 'quality',
    description: 'Retrieve judge assessment results for a task',
    inputSchema: judgesResultsSchema,
    handler: handleJudgesResults,
  }),
];
