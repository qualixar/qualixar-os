// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10+13 -- Workspace Commands
 *
 * 2 commands: workspace.set, workspace.files
 * workspace.set resolves and validates directory paths.
 * workspace.files lists generated output files from a task's working directory.
 *
 * Source: Phase 10 LLD Section 2.5, Phase 13 Autonomous Mode Polish
 */

import { z } from 'zod';
import { resolve, join, relative } from 'node:path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import type { CommandDefinition, CommandContext, CommandResult } from './types.js';

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const SetSchema = z.object({
  directory: z.string().min(1).describe('Working directory path'),
});

const FilesSchema = z.object({
  taskId: z.string().optional().describe('Task to list workspace files for'),
});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

type SetInput = z.infer<typeof SetSchema>;
type FilesInput = z.infer<typeof FilesSchema>;

// ---------------------------------------------------------------------------
// File info type
// ---------------------------------------------------------------------------

interface FileEntry {
  readonly path: string;
  readonly size: number;
  readonly type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXT_TO_TYPE: Record<string, string> = {
  '.ts': 'typescript', '.js': 'javascript', '.py': 'python',
  '.json': 'json', '.md': 'markdown', '.html': 'html',
  '.css': 'css', '.yaml': 'yaml', '.yml': 'yaml',
  '.sql': 'sql', '.sh': 'shell', '.txt': 'text',
};

function getFileType(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return 'unknown';
  const ext = fileName.slice(dotIndex).toLowerCase();
  return EXT_TO_TYPE[ext] ?? ext.slice(1);
}

function collectFiles(dir: string, baseDir: string): FileEntry[] {
  const results: FileEntry[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const st = statSync(fullPath);
      results.push({
        path: relative(baseDir, fullPath),
        size: st.size,
        type: getFileType(entry.name),
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------

export const workspaceCommands: readonly CommandDefinition[] = [
  {
    name: 'workspace.set',
    category: 'workspace',
    description: 'Set the working directory for tasks',
    inputSchema: SetSchema,
    type: 'command',
    handler: async (_ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as SetInput;
        const resolved = resolve(input.directory);
        let created = false;
        if (!existsSync(resolved)) {
          mkdirSync(resolved, { recursive: true });
          created = true;
        }
        return { success: true, data: { path: resolved, created } };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
  {
    name: 'workspace.files',
    category: 'workspace',
    description: 'List generated files from a task output directory',
    inputSchema: FilesSchema,
    type: 'query',
    handler: async (ctx: CommandContext, raw): Promise<CommandResult> => {
      try {
        const input = raw as FilesInput;
        const taskId = input.taskId;

        if (!taskId) {
          return { success: false, error: { code: 'MISSING_TASK_ID', message: 'taskId is required' } };
        }

        // Look up task to find its working directory
        const task = ctx.db.get<{ id: string; result: string | null }>(
          'SELECT id, result FROM tasks WHERE id = ?',
          [taskId],
        );

        if (!task) {
          return { success: false, error: { code: 'TASK_NOT_FOUND', message: `Task ${taskId} not found` } };
        }

        // Check for output directory (qos-output/{taskId}) in common locations
        const config = ctx.config.get();
        const dbPath = resolve(config.db.path);
        const dbDir = dbPath.endsWith('.db') ? resolve(dbPath, '..') : dbPath;
        const outputDir = join(dbDir, 'qos-output', taskId);

        if (!existsSync(outputDir)) {
          return { success: true, data: { taskId, files: [], outputDir: null } };
        }

        const files = collectFiles(outputDir, outputDir);

        return {
          success: true,
          data: {
            taskId,
            outputDir,
            fileCount: files.length,
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            files,
          },
        };
      } catch (err) {
        return { success: false, error: { code: 'HANDLER_ERROR', message: (err as Error).message } };
      }
    },
  },
];
