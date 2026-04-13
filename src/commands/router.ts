// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Command Router
 *
 * Transport-agnostic command dispatch. All transports (CLI, MCP, HTTP, WS)
 * delegate to this router. Commands are registered at startup, validated
 * via Zod, and dispatched to handlers with CommandContext.
 *
 * Source: Phase 10 LLD Section 2.2
 */

import { generateId } from '../utils/id.js';
import type {
  CommandDefinition,
  CommandContext,
  CommandResult,
  CommandEvent,
  CommandCategory,
} from './types.js';

// ---------------------------------------------------------------------------
// Command Router
// ---------------------------------------------------------------------------

export class CommandRouter {
  private readonly _commands = new Map<string, CommandDefinition<unknown, unknown>>();

  constructor(private readonly _ctx: CommandContext) {}

  /**
   * Register a command definition. Throws on duplicate name.
   */
  register<TIn, TOut>(def: CommandDefinition<TIn, TOut>): void {
    if (!def.name || typeof def.name !== 'string') {
      throw new Error('Command name must be a non-empty string');
    }
    if (this._commands.has(def.name)) {
      throw new Error(`Duplicate command: ${def.name}`);
    }
    this._commands.set(def.name, def as CommandDefinition<unknown, unknown>);
  }

  /**
   * Dispatch a command by name with raw input.
   * Validates input via Zod, calls handler, logs to command_log, emits events.
   */
  async dispatch(name: string, rawInput: unknown): Promise<CommandResult<unknown>> {
    const def = this._commands.get(name);
    if (!def) {
      return {
        success: false,
        error: { code: 'COMMAND_NOT_FOUND', message: `Unknown command: ${name}` },
      };
    }

    const parsed = def.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.message,
          details: parsed.error.issues,
        },
      };
    }

    const start = Date.now();
    let result: CommandResult<unknown>;

    try {
      result = await def.handler(this._ctx, parsed.data);
    } catch (err) {
      result = {
        success: false,
        error: {
          code: 'HANDLER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    const duration_ms = Date.now() - start;

    // Attach metadata (immutable — create new object)
    result = {
      ...result,
      metadata: { duration_ms, command: name, ...(result.metadata ?? {}) },
    };

    // Log to command_log table (non-blocking — failures don't crash dispatch)
    this._logCommand(name, rawInput, result, duration_ms);

    // Emit events for real-time subscribers (dashboard, WS)
    this._emitEvent(name, result, duration_ms);

    return result;
  }

  /**
   * Dispatch a streaming command. For Phase 10 Stage 1, wraps dispatch()
   * result in a single 'complete' event. True streaming deferred to Stage 2.
   */
  async *dispatchStream(name: string, rawInput: unknown): AsyncIterable<CommandEvent> {
    const def = this._commands.get(name);

    if (!def) {
      yield {
        type: 'error',
        data: { code: 'COMMAND_NOT_FOUND', message: `Unknown command: ${name}` },
        seq: 0,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    if (!def.streaming) {
      yield {
        type: 'error',
        data: { code: 'NOT_STREAMABLE', message: 'Command does not support streaming' },
        seq: 0,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    const parsed = def.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      yield {
        type: 'error',
        data: { code: 'VALIDATION_ERROR', message: parsed.error.message, details: parsed.error.issues },
        seq: 0,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    // Stage 1: wrap dispatch result in a single complete event
    const result = await this.dispatch(name, rawInput);
    yield {
      type: result.success ? 'complete' : 'error',
      data: result.success ? result.data : result.error,
      seq: 1,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * List all registered commands.
   */
  list(): readonly CommandDefinition<unknown, unknown>[] {
    return Array.from(this._commands.values());
  }

  /**
   * Get a command definition by name.
   */
  getDefinition(name: string): CommandDefinition<unknown, unknown> | undefined {
    return this._commands.get(name);
  }

  /**
   * Get all unique categories from registered commands.
   */
  getCategories(): readonly CommandCategory[] {
    const cats = new Set<CommandCategory>();
    for (const def of this._commands.values()) {
      cats.add(def.category);
    }
    return Array.from(cats);
  }

  /**
   * Get the number of registered commands.
   */
  get size(): number {
    return this._commands.size;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _logCommand(
    name: string,
    input: unknown,
    result: CommandResult<unknown>,
    durationMs: number,
  ): void {
    try {
      this._ctx.db.insert('command_log', {
        id: generateId(),
        command: name,
        input: JSON.stringify(input),
        output: JSON.stringify(result.data ?? null),
        success: result.success ? 1 : 0,
        transport: result.metadata?.transport ?? 'unknown',
        duration_ms: durationMs,
        error: result.error ? JSON.stringify(result.error) : null,
        task_id: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      this._ctx.logger.warn({ err }, 'Failed to log command');
    }
  }

  private _emitEvent(
    name: string,
    result: CommandResult<unknown>,
    durationMs: number,
  ): void {
    try {
      if (result.success) {
        this._ctx.eventBus.emit({
          type: 'cmd:dispatched',
          payload: {
            command: name,
            duration_ms: durationMs,
            transport: result.metadata?.transport ?? 'unknown',
          },
          source: 'command-router',
        });
      } else {
        this._ctx.eventBus.emit({
          type: 'cmd:failed',
          payload: {
            command: name,
            error: result.error?.code,
            duration_ms: durationMs,
          },
          source: 'command-router',
        });
      }
    } catch {
      // Event emission failures must not crash dispatch
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCommandRouter(ctx: CommandContext): CommandRouter {
  return new CommandRouter(ctx);
}
