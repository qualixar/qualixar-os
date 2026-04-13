// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- LocationRegistry
 * LLD Section 2.7
 *
 * Tracks where each agent lives (local process or remote URL).
 * In-memory Map + SQLite persistence via UPSERT.
 * Supports runtime hot-swap and Agent Card-based auto-discovery.
 *
 * CRITICAL (C-7 audit fix): ALL SQL operations use db.db.prepare(sql).run(params)
 * pattern -- NOT db.insert(). The insert() method doesn't support UPSERT (ON CONFLICT).
 */

import type { QosDatabase } from '../../db/database.js';
import type { EventBus } from '../../events/event-bus.js';
import type { A2AAgentCard } from '../../compatibility/a2a-server.js';
import type {
  LocationRegistry,
  AgentLocationEntry,
  AgentLocationType,
} from './types.js';

// ---------------------------------------------------------------------------
// Location change handler type
// ---------------------------------------------------------------------------

type LocationChangeHandler = (
  agentId: string,
  from: AgentLocationType,
  to: AgentLocationType,
) => void;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class LocationRegistryImpl implements LocationRegistry {
  private readonly _entries: Map<string, AgentLocationEntry> = new Map();
  private readonly _changeHandlers: Set<LocationChangeHandler> = new Set();

  constructor(
    private readonly _db: QosDatabase,
    private readonly _eventBus: EventBus,
  ) {}

  register(entry: AgentLocationEntry): void {
    if (!entry.agentId || typeof entry.agentId !== 'string') {
      throw new Error('AgentLocationEntry.agentId must be a non-empty string');
    }

    // 1. Store in memory (overwrites if exists)
    this._entries.set(entry.agentId, entry);

    // 2. UPSERT into agent_transports using raw prepared statement (C-7 fix)
    const now = new Date().toISOString();
    this._db.db
      .prepare(
        `INSERT INTO agent_transports (agent_id, location, url, agent_card, transport, avg_latency_ms, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           location = excluded.location,
           url = excluded.url,
           agent_card = excluded.agent_card,
           transport = excluded.transport,
           avg_latency_ms = excluded.avg_latency_ms,
           last_seen = excluded.last_seen`,
      )
      .run(
        entry.agentId,
        entry.location,
        entry.url ?? null,
        entry.agentCard ? JSON.stringify(entry.agentCard) : null,
        entry.transport,
        entry.avgLatencyMs,
        entry.lastSeen,
        now,
      );

    // 3. Emit event (reuses a2a:agent_registered from Phase 8b -- M-11 fix)
    this._eventBus.emit({
      type: 'a2a:agent_registered',
      payload: { agentId: entry.agentId, location: entry.location, url: entry.url },
      source: 'location-registry',
    });
  }

  lookup(agentId: string): AgentLocationEntry | undefined {
    // 1. Check in-memory cache first
    const cached = this._entries.get(agentId);
    if (cached) {
      return cached;
    }

    // 2. Fallback to DB
    const row = this._db.db
      .prepare(
        `SELECT agent_id, location, url, agent_card, transport, avg_latency_ms, last_seen
         FROM agent_transports
         WHERE agent_id = ?`,
      )
      .get(agentId) as
      | {
          agent_id: string;
          location: AgentLocationType;
          url: string | null;
          agent_card: string | null;
          transport: string;
          avg_latency_ms: number;
          last_seen: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    // 3. Parse and cache
    const entry: AgentLocationEntry = {
      agentId: row.agent_id,
      location: row.location,
      url: row.url ?? undefined,
      agentCard: row.agent_card
        ? (JSON.parse(row.agent_card) as A2AAgentCard)
        : undefined,
      transport: row.transport as AgentLocationEntry['transport'],
      avgLatencyMs: row.avg_latency_ms,
      lastSeen: row.last_seen,
    };

    this._entries.set(agentId, entry);
    return entry;
  }

  listRemote(): readonly AgentLocationEntry[] {
    return Array.from(this._entries.values()).filter(
      (e) => e.location === 'remote',
    );
  }

  listAll(): readonly AgentLocationEntry[] {
    return Array.from(this._entries.values());
  }

  discoverFromCard(card: A2AAgentCard, url: string): AgentLocationEntry {
    const entry: AgentLocationEntry = {
      agentId: card.name,
      location: 'remote',
      url,
      agentCard: card,
      transport: 'a2a',
      avgLatencyMs: 0,
      lastSeen: new Date().toISOString(),
    };

    this.register(entry);
    return entry;
  }

  remove(agentId: string): void {
    this._entries.delete(agentId);

    this._db.db
      .prepare('DELETE FROM agent_transports WHERE agent_id = ?')
      .run(agentId);

    this._eventBus.emit({
      type: 'transport:agent_removed',
      payload: { agentId },
      source: 'location-registry',
    });
  }

  isLocal(agentId: string): boolean {
    const entry = this.lookup(agentId);
    if (!entry) {
      return true; // unregistered agents default to local
    }
    return entry.location === 'local';
  }

  swapLocation(
    agentId: string,
    newLocation: AgentLocationType,
    url?: string,
  ): void {
    const existing = this._entries.get(agentId);
    if (!existing) {
      throw new Error(`Cannot swap location for unknown agent: ${agentId}`);
    }

    const oldLocation = existing.location;
    if (oldLocation === newLocation) {
      return; // no-op
    }

    // Create updated entry (immutable -- new object)
    const updatedEntry: AgentLocationEntry = {
      ...existing,
      location: newLocation,
      url: url ?? existing.url,
      lastSeen: new Date().toISOString(),
    };

    this.register(updatedEntry);

    // Notify change handlers
    for (const handler of this._changeHandlers) {
      handler(agentId, oldLocation, newLocation);
    }

    // Emit transport:location_swapped event
    this._eventBus.emit({
      type: 'transport:location_swapped',
      payload: { agentId, from: oldLocation, to: newLocation, url },
      source: 'location-registry',
    });
  }

  onLocationChange(handler: LocationChangeHandler): () => void {
    this._changeHandlers.add(handler);
    return () => {
      this._changeHandlers.delete(handler);
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new LocationRegistry instance.
 * @param db - QosDatabase (agent_transports table must exist via phase10b migration).
 * @param eventBus - EventBus for emitting location events.
 */
export function createLocationRegistry(
  db: QosDatabase,
  eventBus: EventBus,
): LocationRegistry {
  return new LocationRegistryImpl(db, eventBus);
}
