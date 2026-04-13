/**
 * Phase 10 -- Command Types Tests
 * Source: Phase 10 LLD Section 6, Group 1
 */
import { describe, it, expect } from 'vitest';
import type {
  CommandCategory,
  Transport,
  CommandDefinition,
  CommandContext,
  CommandResult,
  CommandError,
  CommandMetadata,
  CommandEvent,
} from '../../src/commands/types.js';

describe('Command Types', () => {
  it('CommandCategory includes all 9 categories', () => {
    const categories: CommandCategory[] = [
      'task', 'context', 'workspace', 'agents',
      'forge', 'quality', 'memory', 'system', 'interop',
    ];
    expect(categories).toHaveLength(9);
  });

  it('Transport includes all 4 types', () => {
    const transports: Transport[] = ['cli', 'mcp', 'http', 'ws'];
    expect(transports).toHaveLength(4);
  });

  it('CommandResult success shape is valid', () => {
    const result: CommandResult<string> = {
      success: true,
      data: 'hello',
      metadata: { duration_ms: 42, command: 'test' },
    };
    expect(result.success).toBe(true);
    expect(result.data).toBe('hello');
    expect(result.error).toBeUndefined();
  });

  it('CommandResult error shape is valid', () => {
    const result: CommandResult = {
      success: false,
      error: { code: 'TEST_ERROR', message: 'test failed', details: { field: 'x' } },
    };
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TEST_ERROR');
    expect(result.data).toBeUndefined();
  });

  it('CommandError has code and message', () => {
    const err: CommandError = { code: 'E001', message: 'something broke' };
    expect(err.code).toBe('E001');
    expect(err.message).toBe('something broke');
    expect(err.details).toBeUndefined();
  });

  it('CommandMetadata tracks duration and command name', () => {
    const meta: CommandMetadata = { duration_ms: 150, command: 'run', transport: 'cli' };
    expect(meta.duration_ms).toBe(150);
    expect(meta.command).toBe('run');
    expect(meta.transport).toBe('cli');
  });

  it('CommandMetadata transport is optional', () => {
    const meta: CommandMetadata = { duration_ms: 10, command: 'status' };
    expect(meta.transport).toBeUndefined();
  });

  it('CommandEvent has correct shape', () => {
    const event: CommandEvent = {
      type: 'progress',
      data: { percent: 50 },
      seq: 1,
      timestamp: '2026-04-02T00:00:00.000Z',
    };
    expect(event.type).toBe('progress');
    expect(event.seq).toBe(1);
  });

  it('CommandEvent type covers all variants', () => {
    const types: CommandEvent['type'][] = ['progress', 'partial', 'artifact', 'complete', 'error'];
    expect(types).toHaveLength(5);
  });

  it('CommandDefinition shape is type-safe', async () => {
    const { z } = await import('zod');
    const def: CommandDefinition<{ name: string }, { id: string }> = {
      name: 'test.cmd',
      category: 'system',
      description: 'A test command',
      inputSchema: z.object({ name: z.string() }),
      handler: async (_ctx, input) => ({
        success: true,
        data: { id: input.name },
      }),
    };
    expect(def.name).toBe('test.cmd');
    expect(def.streaming).toBeUndefined();
    expect(def.requiresAuth).toBeUndefined();
  });
});
