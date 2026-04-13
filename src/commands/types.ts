// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Universal Command Protocol Types
 *
 * Single source of truth for all command definitions, context, and results.
 * Every transport (CLI, MCP, HTTP, WS) derives from these types.
 *
 * Source: Phase 10 LLD Section 2.1
 */

import type { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Command Categories & Transport Types
// ---------------------------------------------------------------------------

export type CommandCategory =
  | 'task' | 'context' | 'workspace' | 'agents'
  | 'forge' | 'quality' | 'memory' | 'system' | 'interop';

export type Transport = 'cli' | 'mcp' | 'http' | 'ws';

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * Defines a single command in the Universal Command Protocol.
 * Each command has a Zod input schema (single source of truth),
 * a handler that receives validated input, and metadata.
 */
export interface CommandDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly category: CommandCategory;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly handler: (ctx: CommandContext, input: TInput) => Promise<CommandResult<TOutput>>;
  readonly streaming?: boolean;
  readonly type?: 'command' | 'query';
  readonly requiresAuth?: boolean;
}

// ---------------------------------------------------------------------------
// Command Context (injected into every handler)
// ---------------------------------------------------------------------------

/**
 * Shared context for all command handlers.
 * Created once per channel, immutable — handlers MUST NOT mutate.
 *
 * Note on config: ConfigManager provides get(): QosConfig and
 * getValue<T>(path): T. There is NO getConfig() method.
 */
export interface CommandContext {
  readonly orchestrator: Orchestrator;
  readonly eventBus: EventBus;
  readonly db: QosDatabase;
  readonly config: ConfigManager;
  readonly logger: Logger;
}

// ---------------------------------------------------------------------------
// Command Result (returned from every handler)
// ---------------------------------------------------------------------------

export interface CommandResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: CommandError;
  readonly metadata?: CommandMetadata;
}

export interface CommandError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface CommandMetadata {
  readonly duration_ms: number;
  readonly command: string;
  readonly transport?: Transport;
}

// ---------------------------------------------------------------------------
// Command Event (for streaming commands)
// ---------------------------------------------------------------------------

/**
 * Helper to define a typed command that erases to CommandDefinition<unknown>.
 * Zod validation ensures type safety at runtime; this satisfies the compiler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineCommand<TInput, TOutput>(cmd: CommandDefinition<TInput, TOutput>): CommandDefinition<unknown, unknown> {
  return cmd as CommandDefinition<unknown, unknown>;
}

export interface CommandEvent {
  readonly type: 'progress' | 'partial' | 'artifact' | 'complete' | 'error';
  readonly data: unknown;
  readonly seq: number;
  readonly timestamp: string;
}
