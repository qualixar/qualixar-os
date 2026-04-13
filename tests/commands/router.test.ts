/**
 * Phase 10 -- Command Router Tests
 * Source: Phase 10 LLD Section 6, Group 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { CommandRouter, createCommandRouter } from '../../src/commands/router.js';
import type { CommandContext, CommandDefinition, CommandResult } from '../../src/commands/types.js';

// ---------------------------------------------------------------------------
// Mock CommandContext
// ---------------------------------------------------------------------------

function createMockContext(): CommandContext {
  return {
    orchestrator: {} as never,
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
    } as never,
    db: {
      insert: vi.fn(),
      query: vi.fn().mockReturnValue([]),
    } as never,
    config: {
      get: vi.fn(),
      getValue: vi.fn(),
    } as never,
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as never,
  };
}

// ---------------------------------------------------------------------------
// Test command definitions
// ---------------------------------------------------------------------------

const echoSchema = z.object({ message: z.string() });

const echoCommand: CommandDefinition<{ message: string }, { echo: string }> = {
  name: 'echo',
  category: 'system',
  description: 'Echo a message back',
  inputSchema: echoSchema,
  handler: async (_ctx, input) => ({
    success: true,
    data: { echo: input.message },
  }),
};

const failCommand: CommandDefinition<Record<string, never>, never> = {
  name: 'fail',
  category: 'system',
  description: 'Always fails',
  inputSchema: z.object({}),
  handler: async () => {
    throw new Error('Intentional failure');
  },
};

const streamCommand: CommandDefinition<Record<string, never>, string> = {
  name: 'stream.test',
  category: 'task',
  description: 'Streamable command',
  inputSchema: z.object({}),
  streaming: true,
  handler: async () => ({
    success: true,
    data: 'streamed',
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandRouter', () => {
  let ctx: CommandContext;
  let router: CommandRouter;

  beforeEach(() => {
    ctx = createMockContext();
    router = new CommandRouter(ctx);
  });

  // -- Registration --

  describe('register', () => {
    it('registers a command successfully', () => {
      router.register(echoCommand);
      expect(router.size).toBe(1);
    });

    it('throws on duplicate command name', () => {
      router.register(echoCommand);
      expect(() => router.register(echoCommand)).toThrow('Duplicate command: echo');
    });

    it('throws on empty command name', () => {
      expect(() =>
        router.register({ ...echoCommand, name: '' }),
      ).toThrow('Command name must be a non-empty string');
    });
  });

  // -- Dispatch --

  describe('dispatch', () => {
    beforeEach(() => {
      router.register(echoCommand);
      router.register(failCommand);
    });

    it('dispatches valid command successfully', async () => {
      const result = await router.dispatch('echo', { message: 'hello' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ echo: 'hello' });
      expect(result.metadata?.command).toBe('echo');
      expect(result.metadata?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('returns COMMAND_NOT_FOUND for unknown command', async () => {
      const result = await router.dispatch('nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('COMMAND_NOT_FOUND');
    });

    it('returns VALIDATION_ERROR for invalid input', async () => {
      const result = await router.dispatch('echo', { message: 123 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('returns HANDLER_ERROR when handler throws', async () => {
      const result = await router.dispatch('fail', {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_ERROR');
      expect(result.error?.message).toBe('Intentional failure');
    });

    it('logs command to command_log table', async () => {
      await router.dispatch('echo', { message: 'test' });
      expect(ctx.db.insert).toHaveBeenCalledWith('command_log', expect.objectContaining({
        command: 'echo',
        success: 1,
      }));
    });

    it('emits cmd:dispatched event on success', async () => {
      await router.dispatch('echo', { message: 'test' });
      expect(ctx.eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
        type: 'cmd:dispatched',
        payload: expect.objectContaining({ command: 'echo' }),
      }));
    });

    it('emits cmd:failed event on failure', async () => {
      await router.dispatch('fail', {});
      expect(ctx.eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
        type: 'cmd:failed',
        payload: expect.objectContaining({ command: 'fail', error: 'HANDLER_ERROR' }),
      }));
    });

    it('continues dispatch even if logging fails', async () => {
      vi.mocked(ctx.db.insert).mockImplementation(() => { throw new Error('DB down'); });
      const result = await router.dispatch('echo', { message: 'test' });
      expect(result.success).toBe(true);
      expect(ctx.logger.warn).toHaveBeenCalled();
    });

    it('returns VALIDATION_ERROR with Zod issue details', async () => {
      const result = await router.dispatch('echo', {});
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.details).toBeDefined();
    });
  });

  // -- Streaming --

  describe('dispatchStream', () => {
    beforeEach(() => {
      router.register(echoCommand);
      router.register(streamCommand);
    });

    it('yields error for unknown command', async () => {
      const events: unknown[] = [];
      for await (const event of router.dispatchStream('nope', {})) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'error', data: { code: 'COMMAND_NOT_FOUND' } });
    });

    it('yields error for non-streamable command', async () => {
      const events: unknown[] = [];
      for await (const event of router.dispatchStream('echo', { message: 'hi' })) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'error', data: { code: 'NOT_STREAMABLE' } });
    });

    it('yields complete event for streamable command', async () => {
      const events: unknown[] = [];
      for await (const event of router.dispatchStream('stream.test', {})) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'complete', data: 'streamed', seq: 1 });
    });

    it('yields error for invalid input on streamable command', async () => {
      const badStream: CommandDefinition = {
        name: 'stream.bad',
        category: 'task',
        description: 'Needs input',
        inputSchema: z.object({ required: z.string() }),
        streaming: true,
        handler: async () => ({ success: true }),
      };
      router.register(badStream);

      const events: unknown[] = [];
      for await (const event of router.dispatchStream('stream.bad', {})) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'error', data: { code: 'VALIDATION_ERROR' } });
    });
  });

  // -- List & Getters --

  describe('list and getters', () => {
    it('lists all registered commands', () => {
      router.register(echoCommand);
      router.register(failCommand);
      expect(router.list()).toHaveLength(2);
    });

    it('getDefinition returns command by name', () => {
      router.register(echoCommand);
      expect(router.getDefinition('echo')).toBe(echoCommand);
    });

    it('getDefinition returns undefined for unknown', () => {
      expect(router.getDefinition('nope')).toBeUndefined();
    });

    it('getCategories returns unique categories', () => {
      router.register(echoCommand);
      router.register(streamCommand);
      const cats = router.getCategories();
      expect(cats).toContain('system');
      expect(cats).toContain('task');
    });

    it('size returns correct count', () => {
      expect(router.size).toBe(0);
      router.register(echoCommand);
      expect(router.size).toBe(1);
    });
  });

  // -- Factory --

  describe('createCommandRouter', () => {
    it('creates a CommandRouter instance', () => {
      const r = createCommandRouter(ctx);
      expect(r).toBeInstanceOf(CommandRouter);
    });
  });
});
