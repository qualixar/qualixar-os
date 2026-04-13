/**
 * Phase 10 -- WebSocket Adapter Tests
 * Source: Phase 10 LLD Section 2.16
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleWsCommand,
  broadcastEvent,
  mapErrorToJsonRpcCode,
} from '../../../src/commands/adapters/ws-adapter.js';
import type { CommandRouter } from '../../../src/commands/router.js';

// ---------------------------------------------------------------------------
// Mock Router
// ---------------------------------------------------------------------------

function createMockRouter(): CommandRouter {
  return {
    dispatch: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
    list: vi.fn().mockReturnValue([]),
    register: vi.fn(),
    dispatchStream: vi.fn(),
    getDefinition: vi.fn(),
    getCategories: vi.fn(),
    size: 0,
  } as unknown as CommandRouter;
}

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function createMockWs() {
  return {
    send: vi.fn(),
    readyState: 1, // OPEN
  };
}

function createMockWss(clients: ReturnType<typeof createMockWs>[]) {
  return { clients: new Set(clients) };
}

// ---------------------------------------------------------------------------
// mapErrorToJsonRpcCode Tests
// ---------------------------------------------------------------------------

describe('mapErrorToJsonRpcCode', () => {
  it('returns -32601 for COMMAND_NOT_FOUND', () => {
    expect(mapErrorToJsonRpcCode({ code: 'COMMAND_NOT_FOUND', message: '' })).toBe(-32601);
  });

  it('returns -32602 for VALIDATION_ERROR', () => {
    expect(mapErrorToJsonRpcCode({ code: 'VALIDATION_ERROR', message: '' })).toBe(-32602);
  });

  it('returns -32603 for HANDLER_ERROR', () => {
    expect(mapErrorToJsonRpcCode({ code: 'HANDLER_ERROR', message: '' })).toBe(-32603);
  });

  it('returns -32001 for TASK_NOT_FOUND', () => {
    expect(mapErrorToJsonRpcCode({ code: 'TASK_NOT_FOUND', message: '' })).toBe(-32001);
  });

  it('returns -32000 for BUDGET_EXCEEDED', () => {
    expect(mapErrorToJsonRpcCode({ code: 'BUDGET_EXCEEDED', message: '' })).toBe(-32000);
  });

  it('returns -32603 for unknown error codes', () => {
    expect(mapErrorToJsonRpcCode({ code: 'OTHER', message: '' })).toBe(-32603);
  });

  it('returns -32603 when error is undefined', () => {
    expect(mapErrorToJsonRpcCode()).toBe(-32603);
  });
});

// ---------------------------------------------------------------------------
// handleWsCommand Tests
// ---------------------------------------------------------------------------

describe('handleWsCommand', () => {
  let ws: ReturnType<typeof createMockWs>;
  let router: CommandRouter;

  beforeEach(() => {
    ws = createMockWs();
    router = createMockRouter();
  });

  it('sends parse error for invalid JSON', async () => {
    await handleWsCommand(ws as never, 'not json', router);
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.error.code).toBe(-32700);
    expect(sent.error.message).toBe('Parse error');
  });

  it('sends error for missing jsonrpc field', async () => {
    const msg = JSON.stringify({ method: 'run', id: 1 });
    await handleWsCommand(ws as never, msg, router);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.error.code).toBe(-32600);
    expect(sent.error.message).toContain('jsonrpc 2.0');
  });

  it('sends error for missing method field', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1 });
    await handleWsCommand(ws as never, msg, router);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.error.code).toBe(-32600);
    expect(sent.error.message).toContain('method');
  });

  it('dispatches command and returns success result', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'run', params: { prompt: 'hi' }, id: 1 });
    await handleWsCommand(ws as never, msg, router);
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hi' });
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent.id).toBe(1);
    expect(sent.result).toEqual({ result: 'ok' });
  });

  it('maps underscore methods to dot notation', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'context_add', params: {}, id: 2 });
    await handleWsCommand(ws as never, msg, router);
    expect(router.dispatch).toHaveBeenCalledWith('context.add', {});
  });

  it('returns error response on dispatch failure', async () => {
    (router.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command: nope' },
    });
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'nope', params: {}, id: 3 });
    await handleWsCommand(ws as never, msg, router);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.error.code).toBe(-32601);
    expect(sent.error.message).toContain('Unknown command');
  });

  it('uses empty object when params not provided', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', method: 'status', id: 4 });
    await handleWsCommand(ws as never, msg, router);
    expect(router.dispatch).toHaveBeenCalledWith('status', {});
  });

  it('handles batch requests', async () => {
    const batch = JSON.stringify([
      { jsonrpc: '2.0', method: 'run', params: { prompt: 'a' }, id: 1 },
      { jsonrpc: '2.0', method: 'status', params: {}, id: 2 },
    ]);
    await handleWsCommand(ws as never, batch, router);
    expect(router.dispatch).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(Array.isArray(sent)).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('rejects empty batch with error', async () => {
    await handleWsCommand(ws as never, '[]', router);
    const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(sent.error.code).toBe(-32600);
    expect(sent.error.message).toContain('empty batch');
  });
});

// ---------------------------------------------------------------------------
// broadcastEvent Tests
// ---------------------------------------------------------------------------

describe('broadcastEvent', () => {
  it('sends JSON-RPC notification to all open clients', () => {
    const client1 = createMockWs();
    const client2 = createMockWs();
    const wss = createMockWss([client1, client2]);

    broadcastEvent(wss as never, { type: 'task:completed', payload: { taskId: '123' } });

    expect(client1.send).toHaveBeenCalledTimes(1);
    expect(client2.send).toHaveBeenCalledTimes(1);

    const sent = JSON.parse(client1.send.mock.calls[0][0] as string);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent.method).toBe('event');
    expect(sent.params.type).toBe('task:completed');
    expect(sent.params.payload.taskId).toBe('123');
    expect(sent.params.seq).toBe(0);
  });

  it('uses event.id as seq when provided', () => {
    const client = createMockWs();
    const wss = createMockWss([client]);

    broadcastEvent(wss as never, { type: 'task:progress', payload: {}, id: 42 });

    const sent = JSON.parse(client.send.mock.calls[0][0] as string);
    expect(sent.params.seq).toBe(42);
  });

  it('skips clients that are not in OPEN state', () => {
    const openClient = createMockWs();
    const closedClient = createMockWs();
    closedClient.readyState = 3; // CLOSED
    const wss = createMockWss([openClient, closedClient]);

    broadcastEvent(wss as never, { type: 'test', payload: {} });

    expect(openClient.send).toHaveBeenCalledTimes(1);
    expect(closedClient.send).not.toHaveBeenCalled();
  });

  it('silently ignores send errors on dead clients', () => {
    const client = createMockWs();
    client.send.mockImplementation(() => { throw new Error('dead'); });
    const wss = createMockWss([client]);

    // Should not throw
    expect(() => broadcastEvent(wss as never, { type: 'test', payload: {} })).not.toThrow();
  });
});
