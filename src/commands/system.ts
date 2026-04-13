// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- System Commands
 *
 * Configuration inspection, model catalog, and cost summary.
 *
 * Source: Phase 10 LLD Section 2.10
 */

import { z } from 'zod';
import { defineCommand, type CommandDefinition, type CommandContext, type CommandResult } from './types.js';
import { MODEL_CATALOG } from '../router/model-call.js';

// ---------------------------------------------------------------------------
// config.get
// ---------------------------------------------------------------------------

const configGetSchema = z.object({
  key: z
    .string()
    .optional()
    .describe(
      'Dot-notated config path, e.g. "models.primary". Omit for full config.',
    ),
});

async function handleConfigGet(
  ctx: CommandContext,
  input: z.infer<typeof configGetSchema>,
): Promise<CommandResult> {
  try {
    const config = ctx.orchestrator.modeEngine.getConfig();

    if (!input.key) {
      return { success: true, data: config };
    }

    // Walk dot-notated path
    const segments = input.key.split('.');
    let current: unknown = config;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return { success: true, data: null };
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return { success: true, data: current ?? null };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'CONFIG_GET_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// config.set
// ---------------------------------------------------------------------------

const configSetSchema = z.object({
  key: z.string().min(1).describe('Config key to update'),
  value: z.unknown().describe('New value'),
});

async function handleConfigSet(
  ctx: CommandContext,
  input: z.infer<typeof configSetSchema>,
): Promise<CommandResult> {
  try {
    if (input.key === 'mode') {
      const modeValue = String(input.value);
      if (modeValue === 'companion' || modeValue === 'power') {
        ctx.orchestrator.modeEngine.switchMode(modeValue);
        return { success: true, data: { updated: true } };
      }
      return {
        success: false,
        error: {
          code: 'INVALID_MODE',
          message: 'Mode must be "companion" or "power"',
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'CONFIG_READONLY',
        message:
          'Only mode can be set at runtime. Edit ~/.qualixar-os/config.yaml for other settings.',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'CONFIG_SET_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// models.list
// ---------------------------------------------------------------------------

const modelsListSchema = z.object({}).describe('No input required');

async function handleModelsList(
  _ctx: CommandContext,
  _input: z.infer<typeof modelsListSchema>,
): Promise<CommandResult> {
  try {
    const models = MODEL_CATALOG.map((m) => ({
      name: m.name,
      provider: m.provider,
      qualityScore: m.qualityScore,
      costPerInputToken: m.costPerInputToken,
      costPerOutputToken: m.costPerOutputToken,
      maxTokens: m.maxTokens,
      available: m.available,
    }));

    return { success: true, data: models };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'MODELS_LIST_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// cost.summary
// ---------------------------------------------------------------------------

const costSummarySchema = z.object({
  taskId: z
    .string()
    .optional()
    .describe('Task ID for per-task cost, omit for global'),
});

async function handleCostSummary(
  ctx: CommandContext,
  input: z.infer<typeof costSummarySchema>,
): Promise<CommandResult> {
  try {
    const summary = ctx.orchestrator.costTracker.getSummary(input.taskId);
    return { success: true, data: summary };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COST_SUMMARY_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const systemCommands: readonly CommandDefinition[] = [
  defineCommand({
    name: 'config.get',
    category: 'system',
    description: 'Get runtime configuration, optionally by dot-notated key path',
    inputSchema: configGetSchema,
    handler: handleConfigGet,
  }),
  defineCommand({
    name: 'config.set',
    category: 'system',
    description: 'Set a runtime configuration value (only mode is writable)',
    inputSchema: configSetSchema,
    handler: handleConfigSet,
  }),
  defineCommand({
    name: 'models.list',
    category: 'system',
    description: 'List all known LLM models with pricing and quality scores',
    inputSchema: modelsListSchema,
    handler: handleModelsList,
  }),
  defineCommand({
    name: 'cost.summary',
    category: 'system',
    description: 'Get cost summary for a specific task or globally',
    inputSchema: costSummarySchema,
    handler: handleCostSummary,
  }),
];
