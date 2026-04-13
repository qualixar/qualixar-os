// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- WebSocket Transport Adapter
 *
 * JSON-RPC 2.0 over WebSocket. Supports single and batch requests.
 * Source: Phase 10 LLD Section 2.16
 */
import type { WebSocket, WebSocketServer } from 'ws';
import type { CommandRouter } from '../router.js';
import type { CommandError } from '../types.js';

function mapWsMethodToCommand(method: string): string {
  return method.replace(/_/g, '.');
}

/** Maps CommandError codes to JSON-RPC 2.0 error codes. */
export function mapErrorToJsonRpcCode(error?: CommandError): number {
  switch (error?.code) {
    case 'COMMAND_NOT_FOUND': return -32601;
    case 'VALIDATION_ERROR': return -32602;
    case 'HANDLER_ERROR': return -32603;
    case 'TASK_NOT_FOUND': return -32001;
    case 'BUDGET_EXCEEDED': return -32000;
    default: return -32603;
  }
}

async function handleSingleMessage(
  msg: Record<string, unknown>,
  router: CommandRouter,
): Promise<Record<string, unknown>> {
  if (msg.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Invalid Request: missing jsonrpc 2.0' } };
  }
  if (!msg.method || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Invalid Request: missing method' } };
  }
  const commandName = mapWsMethodToCommand(msg.method);
  const result = await router.dispatch(commandName, msg.params ?? {});
  if (result.success) {
    return { jsonrpc: '2.0', id: msg.id, result: result.data };
  }
  return {
    jsonrpc: '2.0', id: msg.id,
    error: { code: mapErrorToJsonRpcCode(result.error), message: result.error?.message ?? 'Internal error', data: result.error?.details },
  };
}

/** Handles an incoming WebSocket message. Supports single and batch JSON-RPC 2.0 requests. */
export async function handleWsCommand(ws: WebSocket, rawData: string, router: CommandRouter): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    return;
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: empty batch' } }));
      return;
    }
    const responses = await Promise.all(
      parsed.map((item) => handleSingleMessage(item as Record<string, unknown>, router)),
    );
    ws.send(JSON.stringify(responses));
    return;
  }
  const response = await handleSingleMessage(parsed as Record<string, unknown>, router);
  ws.send(JSON.stringify(response));
}

/** Broadcasts an event to all connected WS clients as a JSON-RPC 2.0 notification. */
export function broadcastEvent(
  wss: WebSocketServer,
  event: { type: string; payload: unknown; id?: number },
): void {
  const msg = JSON.stringify({
    jsonrpc: '2.0', method: 'event',
    params: { type: event.type, seq: event.id ?? 0, payload: event.payload },
  });
  for (const client of wss.clients) {
    if ((client as WebSocket).readyState === 1) {
      try { (client as WebSocket).send(msg); } catch { /* dead client */ }
    }
  }
}
