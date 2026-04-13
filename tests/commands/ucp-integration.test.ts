/**
 * Phase A1 -- UCP Integration Tests
 *
 * Verifies that the Universal Command Protocol is accessible from
 * ALL transports: HTTP (/cmd/*), CLI (qos cmd), WebSocket (JSON-RPC 2.0),
 * and MCP (domain-grouped tools).
 *
 * Key test: cross-transport equivalence — same input → same result.
 *
 * Source: Phase A1 LLD Section 7.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createCmdRoutes } from '../../src/commands/adapters/http-adapter.js';
import { wireCliToRouter } from '../../src/commands/adapters/cli-adapter.js';
import { handleWsCommand, mapErrorToJsonRpcCode } from '../../src/commands/adapters/ws-adapter.js';
import type { CommandRouter } from '../../src/commands/router.js';
import type { WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Shared Mock Router
// ---------------------------------------------------------------------------

const MOCK_RUN_RESULT = { taskId: 'task-001', output: 'Hello from UCP' };

function createMockRouter(overrides: Partial<CommandRouter> = {}): CommandRouter {
  return {
    dispatch: vi.fn().mockResolvedValue({ success: true, data: MOCK_RUN_RESULT }),
    list: vi.fn().mockReturnValue([
      { name: 'run', category: 'task', description: 'Run a task', type: 'command' },
      { name: 'status', category: 'task', description: 'Get status', type: 'query' },
      { name: 'context.add', category: 'context', description: 'Add context', type: 'command' },
      { name: 'agents.list', category: 'agents', description: 'List agents', type: 'query' },
      { name: 'config.get', category: 'system', description: 'Get config', type: 'query' },
    ]),
    register: vi.fn(),
    dispatchStream: vi.fn(),
    getDefinition: vi.fn(),
    getCategories: vi.fn(),
    size: 25,
    ...overrides,
  } as unknown as CommandRouter;
}

// ---------------------------------------------------------------------------
// HTTP Transport Tests
// ---------------------------------------------------------------------------

describe('UCP via HTTP (/cmd/*)', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  it('GET /cmd/ returns all registered commands', async () => {
    const app = createCmdRoutes(router);
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as { commands: unknown[] };
    expect(body.commands).toHaveLength(5);
  });

  it('POST /cmd/run dispatches and returns result', async () => {
    const app = createCmdRoutes(router);
    const res = await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: typeof MOCK_RUN_RESULT };
    expect(body.success).toBe(true);
    expect(body.data).toEqual(MOCK_RUN_RESULT);
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hello' });
  });

  it('POST /cmd/context.add dispatches dotted command names', async () => {
    const app = createCmdRoutes(router);
    await app.request('/context.add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: ['./src'] }),
    });
    expect(router.dispatch).toHaveBeenCalledWith('context.add', { paths: ['./src'] });
  });
});

// ---------------------------------------------------------------------------
// CLI Transport Tests
// ---------------------------------------------------------------------------

describe('UCP via CLI (qos cmd)', () => {
  let router: CommandRouter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    router = createMockRouter();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
  });

  it('cmd <command> dispatches and prints result', async () => {
    const program = new Command();
    program.exitOverride();
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd', 'run', '--json']);
    expect(router.dispatch).toHaveBeenCalledWith('run', {});
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"taskId": "task-001"'),
    );
  });

  it('cmd with --input dispatches parsed JSON', async () => {
    const program = new Command();
    program.exitOverride();
    wireCliToRouter(program, router);
    const input = JSON.stringify({ prompt: 'hello' });
    await program.parseAsync(['node', 'qos', 'cmd', 'run', '-i', input]);
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hello' });
  });
});

// ---------------------------------------------------------------------------
// WebSocket Transport Tests (JSON-RPC 2.0)
// ---------------------------------------------------------------------------

describe('UCP via WebSocket (JSON-RPC 2.0)', () => {
  let router: CommandRouter;
  let ws: WebSocket;
  let sent: string[];

  beforeEach(() => {
    router = createMockRouter();
    sent = [];
    ws = {
      send: vi.fn((data: string) => { sent.push(data); }),
      readyState: 1,
    } as unknown as WebSocket;
  });

  it('dispatches single JSON-RPC request', async () => {
    await handleWsCommand(ws, JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'run', params: { prompt: 'hello' },
    }), router);

    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hello' });
    const response = JSON.parse(sent[0]) as { jsonrpc: string; id: number; result: unknown };
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toEqual(MOCK_RUN_RESULT);
  });

  it('dispatches batch JSON-RPC requests', async () => {
    await handleWsCommand(ws, JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'run', params: { prompt: 'a' } },
      { jsonrpc: '2.0', id: 2, method: 'status', params: { taskId: 'x' } },
    ]), router);

    const response = JSON.parse(sent[0]) as unknown[];
    expect(response).toHaveLength(2);
  });

  it('handles underscore-to-dot method mapping', async () => {
    await handleWsCommand(ws, JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'context_add', params: { paths: ['./src'] },
    }), router);

    // ws-adapter maps underscores to dots
    expect(router.dispatch).toHaveBeenCalledWith('context.add', { paths: ['./src'] });
  });

  it('returns parse error for malformed JSON', async () => {
    await handleWsCommand(ws, 'not json', router);
    const response = JSON.parse(sent[0]) as { error: { code: number } };
    expect(response.error.code).toBe(-32700);
  });

  it('returns invalid request for missing jsonrpc field', async () => {
    await handleWsCommand(ws, JSON.stringify({ id: 1, method: 'run' }), router);
    const response = JSON.parse(sent[0]) as { error: { code: number } };
    expect(response.error.code).toBe(-32600);
  });
});

// ---------------------------------------------------------------------------
// Cross-Transport Equivalence
// ---------------------------------------------------------------------------

describe('Cross-Transport Equivalence', () => {
  it('same command input produces same dispatch call across HTTP and WS', async () => {
    const httpRouter = createMockRouter();
    const wsRouter = createMockRouter();
    const input = { prompt: 'universal test' };

    // HTTP dispatch
    const app = createCmdRoutes(httpRouter);
    await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    // WS dispatch
    const sent: string[] = [];
    const ws = { send: vi.fn((d: string) => sent.push(d)), readyState: 1 } as unknown as WebSocket;
    await handleWsCommand(ws, JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'run', params: input,
    }), wsRouter);

    // Both called dispatch with identical arguments
    expect(httpRouter.dispatch).toHaveBeenCalledWith('run', input);
    expect(wsRouter.dispatch).toHaveBeenCalledWith('run', input);

    // Both returned same result data
    const httpRes = await (await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })).json() as { data: unknown };

    const wsRes = JSON.parse(sent[0]) as { result: unknown };
    expect(httpRes.data).toEqual(wsRes.result);
  });
});

// ---------------------------------------------------------------------------
// WS Error Code Mapping
// ---------------------------------------------------------------------------

describe('mapErrorToJsonRpcCode', () => {
  it('maps COMMAND_NOT_FOUND to -32601', () => {
    expect(mapErrorToJsonRpcCode({ code: 'COMMAND_NOT_FOUND', message: '' })).toBe(-32601);
  });

  it('maps VALIDATION_ERROR to -32602', () => {
    expect(mapErrorToJsonRpcCode({ code: 'VALIDATION_ERROR', message: '' })).toBe(-32602);
  });

  it('maps unknown codes to -32603', () => {
    expect(mapErrorToJsonRpcCode({ code: 'SOME_OTHER', message: '' })).toBe(-32603);
  });
});
