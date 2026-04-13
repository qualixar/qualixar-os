/**
 * Phase 10 -- HTTP Adapter Tests
 * Source: Phase 10 LLD Section 2.15
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCmdRoutes, mapErrorToHttpStatus } from '../../../src/commands/adapters/http-adapter.js';
import type { CommandRouter } from '../../../src/commands/router.js';

// ---------------------------------------------------------------------------
// Mock Router
// ---------------------------------------------------------------------------

function createMockRouter(overrides: Partial<CommandRouter> = {}): CommandRouter {
  return {
    dispatch: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
    list: vi.fn().mockReturnValue([
      { name: 'run', category: 'task', description: 'Run a task', type: 'command' },
      { name: 'status', category: 'task', description: 'Get status', type: 'query' },
    ]),
    register: vi.fn(),
    dispatchStream: vi.fn(),
    getDefinition: vi.fn(),
    getCategories: vi.fn(),
    size: 2,
    ...overrides,
  } as unknown as CommandRouter;
}

// ---------------------------------------------------------------------------
// mapErrorToHttpStatus Tests
// ---------------------------------------------------------------------------

describe('mapErrorToHttpStatus', () => {
  it('returns 500 when no error provided', () => {
    expect(mapErrorToHttpStatus()).toBe(500);
  });

  it('returns 404 for COMMAND_NOT_FOUND', () => {
    expect(mapErrorToHttpStatus({ code: 'COMMAND_NOT_FOUND', message: 'nope' })).toBe(404);
  });

  it('returns 404 for TASK_NOT_FOUND', () => {
    expect(mapErrorToHttpStatus({ code: 'TASK_NOT_FOUND', message: 'nope' })).toBe(404);
  });

  it('returns 404 for AGENT_NOT_FOUND', () => {
    expect(mapErrorToHttpStatus({ code: 'AGENT_NOT_FOUND', message: 'nope' })).toBe(404);
  });

  it('returns 400 for VALIDATION_ERROR', () => {
    expect(mapErrorToHttpStatus({ code: 'VALIDATION_ERROR', message: 'bad' })).toBe(400);
  });

  it('returns 403 for CONFIG_READONLY', () => {
    expect(mapErrorToHttpStatus({ code: 'CONFIG_READONLY', message: 'no' })).toBe(403);
  });

  it('returns 402 for BUDGET_EXCEEDED', () => {
    expect(mapErrorToHttpStatus({ code: 'BUDGET_EXCEEDED', message: 'over' })).toBe(402);
  });

  it('returns 500 for unknown error codes', () => {
    expect(mapErrorToHttpStatus({ code: 'SOMETHING_ELSE', message: 'idk' })).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// createCmdRoutes Tests
// ---------------------------------------------------------------------------

describe('createCmdRoutes', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  it('GET / returns list of commands', async () => {
    const app = createCmdRoutes(router);
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as { commands: unknown[] };
    expect(body.commands).toHaveLength(2);
    expect(body.commands[0]).toHaveProperty('name', 'run');
  });

  it('POST /:command dispatches and returns 200 on success', async () => {
    const app = createCmdRoutes(router);
    const res = await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });
    expect(res.status).toBe(200);
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'test' });
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('POST /:command returns 404 for unknown command', async () => {
    (router.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command: nope' },
    });
    const app = createCmdRoutes(router);
    const res = await app.request('/nope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('POST /:command returns 400 for validation error', async () => {
    (router.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Bad input' },
    });
    const app = createCmdRoutes(router);
    const res = await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /:command handles empty/malformed body gracefully', async () => {
    const app = createCmdRoutes(router);
    const res = await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    // Should still dispatch with empty object due to .catch(() => ({}))
    expect(res.status).toBe(200);
    expect(router.dispatch).toHaveBeenCalledWith('run', {});
  });
});
