// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 12 -- Context Commands (Real Implementation)
 *
 * 3 commands: context.add, context.scan, context.list
 * Replaces Phase 10 stubs with full Context Pipeline.
 *
 * Source: Phase 12 Context Pipeline, Universal Type-C Plan Section 6
 */

import { z } from 'zod';
import type { CommandDefinition, CommandContext, CommandResult } from './types.js';
import { parseFile } from '../context/parsers.js';
import { chunkText } from '../context/chunker.js';
import { scanDirectory } from '../context/scanner.js';
import { ContextStore } from '../context/store.js';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const AddSchema = z.object({
  taskId: z.string().optional().describe('Task to attach context to'),
  paths: z.array(z.string()).min(1).describe('File paths to add'),
  urls: z.array(z.string()).optional().describe('URLs to fetch'),
});

const ScanSchema = z.object({
  directory: z.string().min(1).describe('Directory to scan'),
  recursive: z.boolean().optional().default(true).describe('Scan recursively'),
  extensions: z.array(z.string()).optional().describe('File extensions to include'),
});

const ListContextSchema = z.object({
  taskId: z.string().optional().describe('Task to list context for'),
});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

type AddInput = z.infer<typeof AddSchema>;
type ScanInput = z.infer<typeof ScanSchema>;
type ListInput = z.infer<typeof ListContextSchema>;

// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------

export const contextCommands: readonly CommandDefinition[] = [
  {
    name: 'context.add',
    category: 'context',
    description: 'Add file paths and URLs as context for a task',
    inputSchema: AddSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as AddInput;
        const store = new ContextStore(ctx.db);
        let addedCount = 0;
        let totalTokens = 0;

        for (const filePath of input.paths) {
          const parsed = await parseFile(filePath);
          const chunks = chunkText(parsed.content);

          for (const chunk of chunks) {
            store.add({
              taskId: input.taskId ?? null,
              filePath,
              content: chunk.content,
              format: parsed.format,
              tokens: chunk.tokens,
              chunkIndex: chunk.index,
              totalChunks: chunks.length,
            });
            totalTokens += chunk.tokens;
          }
          addedCount += 1;
        }

        return {
          success: true,
          data: { added: addedCount, chunks: store.list(input.taskId).length, tokens: totalTokens },
        };
      } catch (err) {
        return {
          success: false,
          error: { code: 'CONTEXT_ADD_ERROR', message: (err as Error).message },
        };
      }
    },
  },
  {
    name: 'context.scan',
    category: 'context',
    description: 'Scan a directory for context files',
    inputSchema: ScanSchema,
    type: 'command',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as ScanInput;
        const store = new ContextStore(ctx.db);
        const scanResult = await scanDirectory(input.directory, {
          recursive: input.recursive,
          extensions: input.extensions,
        });

        let totalTokens = 0;
        let chunkCount = 0;

        for (const { filePath, parseResult } of scanResult.results) {
          const chunks = chunkText(parseResult.content);
          for (const chunk of chunks) {
            store.add({
              taskId: null,
              filePath,
              content: chunk.content,
              format: parseResult.format,
              tokens: chunk.tokens,
              chunkIndex: chunk.index,
              totalChunks: chunks.length,
            });
            totalTokens += chunk.tokens;
            chunkCount += 1;
          }
        }

        return {
          success: true,
          data: {
            scanned: scanResult.files.length,
            chunks: chunkCount,
            tokens: totalTokens,
            skipped: scanResult.skipped.length,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: { code: 'CONTEXT_SCAN_ERROR', message: (err as Error).message },
        };
      }
    },
  },
  {
    name: 'context.list',
    category: 'context',
    description: 'List all context entries for a task',
    inputSchema: ListContextSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as ListInput;
        const store = new ContextStore(ctx.db);
        const entries = store.list(input.taskId);
        const totalTokens = store.getTokenCount(input.taskId);

        return {
          success: true,
          data: {
            entries,
            count: entries.length,
            totalTokens,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: { code: 'CONTEXT_LIST_ERROR', message: (err as Error).message },
        };
      }
    },
  },
];
