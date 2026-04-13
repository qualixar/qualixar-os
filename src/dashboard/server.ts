// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Dashboard Server
 * LLD Section 2.2
 *
 * Static file server (Hono) + WebSocket relay for real-time dashboard.
 * Bridges EventBus events to connected browser clients.
 *
 * Hard Rules:
 *   - readonly on all interface properties
 *   - ESM .js extensions on local imports
 *   - <50-line functions
 *   - Heartbeat ping/pong every 30s
 */

import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer, WebSocket } from 'ws';
import type { EventBus } from '../events/event-bus.js';
import type { Orchestrator } from '../engine/orchestrator.js';
import type { QosEvent } from '../types/common.js';
import type { QosEventType } from '../types/events.js';
import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSEvent {
  readonly type: 'task:update' | 'agent:update' | 'judge:verdict'
    | 'cost:update' | 'forge:update' | 'memory:update'
    | 'swarm:update' | 'log';
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

export interface WSCommand {
  readonly action: 'subscribe' | 'unsubscribe'
    | 'task:pause' | 'task:resume' | 'task:cancel';
  readonly taskId?: string;
  readonly eventTypes?: readonly string[];
}

export interface DashboardServer {
  readonly app: Hono;
  readonly wss: WebSocketServer;
  readonly connectedClients: number;
  attachToServer(server: HttpServer): void;
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<string, WSEvent['type']> = {
  'task:created': 'task:update',
  'task:started': 'task:update',
  'task:completed': 'task:update',
  'task:failed': 'task:update',
  'task:cancelled': 'task:update',
  'agent:spawned': 'agent:update',
  'agent:started': 'agent:update',
  'agent:completed': 'agent:update',
  'agent:failed': 'agent:update',
  'judge:verdict': 'judge:verdict',
  'judge:approved': 'judge:verdict',
  'judge:rejected': 'judge:verdict',
  'cost:recorded': 'cost:update',
  'cost:budget_warning': 'cost:update',
  'cost:budget_exceeded': 'cost:update',
  'forge:designed': 'forge:update',
  'forge:redesigning': 'forge:update',
  'memory:recalled': 'memory:update',
  'memory:stored': 'memory:update',
  'memory:behavior_captured': 'memory:update',
  'swarm:started': 'swarm:update',
  'swarm:completed': 'swarm:update',
};

// ---------------------------------------------------------------------------
// Map event to WSEvent
// ---------------------------------------------------------------------------

function mapEventToWSEvent(event: QosEvent): WSEvent | null {
  const wsType = EVENT_TYPE_MAP[event.type];
  if (!wsType) {
    return {
      type: 'log',
      payload: { eventType: event.type, ...event.payload },
      timestamp: event.timestamp,
    };
  }
  return {
    type: wsType,
    payload: { eventType: event.type, ...event.payload },
    timestamp: event.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Parse incoming WS command
// ---------------------------------------------------------------------------

function parseWSCommand(data: string): WSCommand | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (typeof parsed.action !== 'string') return null;
    return {
      action: parsed.action as WSCommand['action'],
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : undefined,
      eventTypes: Array.isArray(parsed.eventTypes) ? parsed.eventTypes as string[] : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handle command from client
// ---------------------------------------------------------------------------

async function handleCommand(
  command: WSCommand,
  orchestrator: Orchestrator,
): Promise<Record<string, unknown>> {
  switch (command.action) {
    case 'task:pause':
      if (!command.taskId) return { error: 'taskId required' };
      await orchestrator.pause(command.taskId);
      return { ok: true, action: 'paused', taskId: command.taskId };
    case 'task:resume':
      if (!command.taskId) return { error: 'taskId required' };
      await orchestrator.resume(command.taskId);
      return { ok: true, action: 'resumed', taskId: command.taskId };
    case 'task:cancel':
      if (!command.taskId) return { error: 'taskId required' };
      await orchestrator.cancel(command.taskId);
      return { ok: true, action: 'cancelled', taskId: command.taskId };
    case 'subscribe':
    case 'unsubscribe':
      return { ok: true, action: command.action };
    default:
      return { error: `Unknown action: ${command.action}` };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;

export function createDashboardServer(
  eventBus: EventBus,
  orchestrator: Orchestrator,
): DashboardServer {
  const app = new Hono();
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // -- Static files --
  app.use('/dashboard/*', serveStatic({ root: './dist' }));

  // -- REST fallback endpoints --
  app.get('/api/health', (c) => c.json({ status: 'ok', clients: clients.size }));

  // -- EventBus subscription --
  const eventHandler = async (event: QosEvent): Promise<void> => {
    const wsEvent = mapEventToWSEvent(event);
    if (!wsEvent) return;
    const message = JSON.stringify(wsEvent);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };
  eventBus.on('*', eventHandler);

  // -- WebSocket connection handling --
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    eventBus.emit({
      type: 'dashboard:client_connected',
      payload: { clientCount: clients.size },
      source: 'dashboard',
    });

    ws.on('message', (raw: Buffer | string) => {
      const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
      const command = parseWSCommand(data);
      if (!command) {
        ws.send(JSON.stringify({ error: 'Invalid command' }));
        return;
      }
      handleCommand(command, orchestrator)
        .then((result) => ws.send(JSON.stringify(result)))
        .catch((err: Error) => ws.send(JSON.stringify({ error: err.message })));
    });

    ws.on('close', () => {
      clients.delete(ws);
      eventBus.emit({
        type: 'dashboard:client_disconnected',
        payload: { clientCount: clients.size },
        source: 'dashboard',
      });
    });

    ws.on('pong', () => {
      // Client is alive -- no action needed
    });
  });

  // -- Heartbeat --
  function startHeartbeat(): void {
    heartbeatTimer = setInterval(() => {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  function attachToServer(server: HttpServer): void {
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = request.url ?? '';
      if (url.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    });
    startHeartbeat();
  }

  function shutdown(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    eventBus.off('*', eventHandler);
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
  }

  return {
    app,
    wss,
    get connectedClients() {
      return clients.size;
    },
    attachToServer,
    shutdown,
  };
}
