// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Memory Commands
 *
 * Search and store memory entries via SuperLocalMemory or direct DB queries.
 *
 * Source: Phase 10 LLD Section 2.9
 *
 * Audit note (H-8): OrchestratorSLMLite.search() returns
 * { layer, content } without trustScore. When minTrust is specified,
 * we fall back to a direct DB query on memory_entries.
 */

import { z } from 'zod';
import { defineCommand, type CommandDefinition, type CommandContext, type CommandResult } from './types.js';
import { generateId } from '../utils/id.js';

// ---------------------------------------------------------------------------
// memory.search
// ---------------------------------------------------------------------------

const memorySearchSchema = z.object({
  query: z.string().min(1).describe('Search query for memory entries'),
  layer: z
    .enum(['working', 'episodic', 'semantic', 'procedural'])
    .optional()
    .describe('Filter by memory layer'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum results to return'),
  minTrust: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'Minimum trust score filter. Uses direct DB query since ' +
        'OrchestratorSLMLite.search() returns { layer, content } without trustScore.',
    ),
});

async function handleMemorySearch(
  ctx: CommandContext,
  input: z.infer<typeof memorySearchSchema>,
): Promise<CommandResult> {
  try {
    if (input.minTrust !== undefined) {
      // Direct DB query path -- needed because SLMLite.search()
      // does not expose trust_score in its return type.
      let sql =
        'SELECT id, layer, content, trust_score, access_count, created_at ' +
        'FROM memory_entries WHERE content LIKE ? AND trust_score >= ?';
      const params: unknown[] = [`%${input.query}%`, input.minTrust];

      if (input.layer) {
        sql += ' AND layer = ?';
        params.push(input.layer);
      }

      sql += ' ORDER BY trust_score DESC LIMIT ?';
      params.push(input.limit);

      const rows = ctx.db.query(sql, params);
      return { success: true, data: rows };
    }

    // Standard path via SLMLite
    const results = await ctx.orchestrator.slmLite.search(input.query, {
      layer: input.layer,
      limit: input.limit,
    });
    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'MEMORY_SEARCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// memory.store
// ---------------------------------------------------------------------------

const memoryStoreSchema = z.object({
  content: z.string().min(1).describe('Content to store in memory'),
  layer: z
    .enum(['working', 'episodic', 'semantic', 'procedural'])
    .describe('Memory layer to store in'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata key-value pairs'),
  source: z
    .enum(['agent', 'user', 'system', 'behavioral'])
    .optional()
    .default('user')
    .describe('Source of the memory entry'),
});

async function handleMemoryStore(
  ctx: CommandContext,
  input: z.infer<typeof memoryStoreSchema>,
): Promise<CommandResult> {
  try {
    const id = generateId();
    ctx.db.insert('memory_entries', {
      id,
      content: input.content,
      layer: input.layer,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      source: input.source,
      trust_score: 0.5,
      access_count: 0,
      created_at: new Date().toISOString(),
    });

    return { success: true, data: { id } };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'MEMORY_STORE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const memoryCommands: readonly CommandDefinition[] = [
  defineCommand({
    name: 'memory.search',
    category: 'memory',
    description: 'Search memory entries by query, with optional layer and trust filters',
    inputSchema: memorySearchSchema,
    handler: handleMemorySearch,
  }),
  defineCommand({
    name: 'memory.store',
    category: 'memory',
    description: 'Store a new memory entry in a specific layer',
    inputSchema: memoryStoreSchema,
    handler: handleMemoryStore,
  }),
];
