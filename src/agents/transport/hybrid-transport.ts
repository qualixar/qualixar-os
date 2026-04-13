// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- HybridTransport
 *
 * Routes messages to LocalTransport or A2ATransport per-agent based on the
 * LocationRegistry. Default transport for mixed teams (local + remote agents).
 *
 * Source: Phase 10b LLD Section 2.5
 */

import type { EventBus } from '../../events/event-bus.js';
import type {
  AgentTransport,
  A2ATaskMessage,
  TransportSendResult,
  TransportType,
  TransportConfig,
  LocationRegistry,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class HybridTransportImpl implements AgentTransport {
  private readonly _local: AgentTransport;
  private readonly _a2a: AgentTransport;
  private readonly _registry: LocationRegistry;
  private readonly _config: TransportConfig;
  private readonly _eventBus: EventBus;

  constructor(
    local: AgentTransport,
    a2a: AgentTransport,
    registry: LocationRegistry,
    config: TransportConfig,
    eventBus: EventBus,
  ) {
    this._local = local;
    this._a2a = a2a;
    this._registry = registry;
    this._config = config;
    this._eventBus = eventBus;
  }

  async send(message: A2ATaskMessage): Promise<TransportSendResult> {
    const entry = this._registry.lookup(message.to);

    // Broadcast: send to local + all remote agents
    if (entry === undefined && message.to === 'broadcast') {
      const localResult = await this._local.send(message);

      const remoteAgents = this._registry.listRemote();
      const remotePromises = remoteAgents.map((remote) =>
        this._a2a.send({ ...message, to: remote.agentId }),
      );
      // Fire-and-forget for remote broadcasts; primary result is local
      await Promise.allSettled(remotePromises);

      return localResult;
    }

    // Agent not in registry: fallback or throw
    if (entry === undefined) {
      if (this._config.fallbackToLocal) {
        return this._local.send(message);
      }
      throw new Error(
        `Agent not found in location registry and fallback disabled: ${message.to}`,
      );
    }

    // Local agent: delegate to local transport
    if (entry.location === 'local') {
      return this._local.send(message);
    }

    // Remote agent: try A2A, fallback to local on failure
    try {
      return await this._a2a.send(message);
    } catch (error: unknown) {
      if (this._config.fallbackToLocal) {
        this._eventBus.emit({
          type: 'transport:fallback',
          payload: {
            agentId: message.to,
            from: 'a2a',
            to: 'local',
            reason: error instanceof Error ? error.message : String(error),
          },
          source: 'hybrid-transport',
        });
        return this._local.send(message);
      }
      throw error;
    }
  }

  subscribe(
    agentId: string,
    handler: (msg: A2ATaskMessage) => void,
  ): () => void {
    // Subscribe on BOTH transports to catch messages from either path
    const unsub1 = this._local.subscribe(agentId, handler);
    const unsub2 = this._a2a.subscribe(agentId, handler);

    return () => {
      unsub1();
      unsub2();
    };
  }

  getLatency(): number {
    const localLat = this._local.getLatency();
    const a2aLat = this._a2a.getLatency();

    if (a2aLat === -1) {
      return localLat;
    }

    const allEntries = this._registry.listAll();
    const localCount = allEntries.filter((e) => e.location === 'local').length;
    const remoteCount = allEntries.filter((e) => e.location === 'remote').length;
    const total = localCount + remoteCount;

    if (total === 0) {
      return localLat;
    }

    return (localCount * localLat + remoteCount * a2aLat) / total;
  }

  getType(): TransportType {
    return 'hybrid';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHybridTransport(
  local: AgentTransport,
  a2a: AgentTransport,
  registry: LocationRegistry,
  config: TransportConfig,
  eventBus: EventBus,
): AgentTransport {
  return new HybridTransportImpl(local, a2a, registry, config, eventBus);
}
