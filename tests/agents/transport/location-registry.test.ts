/**
 * Qualixar OS Phase 10b -- LocationRegistry Tests
 *
 * Tests the in-memory + SQLite location registry for agent transport routing.
 * Mocks QosDatabase (with db.db.prepare().run() chain) and EventBus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QosDatabase } from '../../../src/db/database.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type { AgentLocationEntry } from '../../../src/agents/transport/types.js';
import { createLocationRegistry } from '../../../src/agents/transport/location-registry.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockStatement(returnValue?: unknown) {
  return {
    run: vi.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(returnValue),
    all: vi.fn().mockReturnValue(returnValue ?? []),
  };
}

function createMockDb(): QosDatabase {
  const mockStmt = createMockStatement();
  return {
    db: {
      prepare: vi.fn().mockReturnValue(mockStmt),
    },
    insert: vi.fn(),
    update: vi.fn(),
    query: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    close: vi.fn(),
    runMigrations: vi.fn(),
  } as unknown as QosDatabase;
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
  };
}

function makeEntry(overrides: Partial<AgentLocationEntry> = {}): AgentLocationEntry {
  return {
    agentId: 'agent-1',
    location: 'local',
    transport: 'auto',
    avgLatencyMs: 0,
    lastSeen: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocationRegistry', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createMockDb();
    eventBus = createMockEventBus();
  });

  describe('register', () => {
    it('should store entry in memory and persist via UPSERT', () => {
      const registry = createLocationRegistry(db, eventBus);
      const entry = makeEntry();

      registry.register(entry);

      // Verify the entry is in memory
      expect(registry.lookup('agent-1')).toEqual(entry);

      // Verify UPSERT was called via db.db.prepare().run()
      expect(db.db.prepare).toHaveBeenCalled();
      const prepareCall = (db.db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prepareCall).toContain('INSERT INTO agent_transports');
      expect(prepareCall).toContain('ON CONFLICT(agent_id) DO UPDATE');
    });

    it('should emit a2a:agent_registered event', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'agent-x', location: 'remote', url: 'http://remote' }));

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'a2a:agent_registered',
          payload: { agentId: 'agent-x', location: 'remote', url: 'http://remote' },
          source: 'location-registry',
        }),
      );
    });

    it('should throw on empty agentId', () => {
      const registry = createLocationRegistry(db, eventBus);

      expect(() =>
        registry.register(makeEntry({ agentId: '' })),
      ).toThrow('AgentLocationEntry.agentId must be a non-empty string');
    });

    it('should serialize agentCard as JSON', () => {
      const registry = createLocationRegistry(db, eventBus);
      const card = { name: 'remote-agent', protocol: 'a2a/v1.0', capabilities: ['run'] };
      registry.register(makeEntry({ agentId: 'agent-card', agentCard: card }));

      const stmt = (db.db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value;
      const runArgs = stmt.run.mock.calls[0];
      // agent_card is the 4th argument (index 3)
      expect(runArgs[3]).toBe(JSON.stringify(card));
    });

    it('should overwrite existing entry on re-register', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'agent-1', location: 'local' }));
      registry.register(makeEntry({ agentId: 'agent-1', location: 'remote', url: 'http://new' }));

      const result = registry.lookup('agent-1');
      expect(result?.location).toBe('remote');
      expect(result?.url).toBe('http://new');
    });
  });

  describe('lookup', () => {
    it('should return entry from in-memory cache', () => {
      const registry = createLocationRegistry(db, eventBus);
      const entry = makeEntry({ agentId: 'cached' });
      registry.register(entry);

      const result = registry.lookup('cached');
      expect(result).toEqual(entry);
    });

    it('should fallback to DB if not in memory', () => {
      // Create a fresh db mock where prepare returns the DB row
      const dbRow = {
        agent_id: 'db-agent',
        location: 'remote',
        url: 'http://db-url',
        agent_card: JSON.stringify({ name: 'db-agent', protocol: 'a2a', capabilities: [] }),
        transport: 'a2a',
        avg_latency_ms: 42,
        last_seen: '2026-04-01T12:00:00.000Z',
      };

      const mockStmt = createMockStatement(dbRow);
      const freshDb = {
        db: {
          prepare: vi.fn().mockReturnValue(mockStmt),
        },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createLocationRegistry(freshDb, eventBus);
      const result = registry.lookup('db-agent');

      expect(result).toBeDefined();
      expect(result?.agentId).toBe('db-agent');
      expect(result?.location).toBe('remote');
      expect(result?.url).toBe('http://db-url');
      expect(result?.agentCard).toEqual({ name: 'db-agent', protocol: 'a2a', capabilities: [] });
      expect(result?.avgLatencyMs).toBe(42);
    });

    it('should return undefined if not found anywhere', () => {
      const mockStmt = createMockStatement(undefined);
      const freshDb = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createLocationRegistry(freshDb, eventBus);
      expect(registry.lookup('nonexistent')).toBeUndefined();
    });

    it('should cache DB result in memory after first lookup', () => {
      const dbRow = {
        agent_id: 'cacheable',
        location: 'local',
        url: null,
        agent_card: null,
        transport: 'local',
        avg_latency_ms: 0,
        last_seen: '2026-04-01T00:00:00.000Z',
      };

      const mockStmt = createMockStatement(dbRow);
      const freshDb = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createLocationRegistry(freshDb, eventBus);

      // First lookup hits DB
      registry.lookup('cacheable');
      // Second lookup should use cache (prepare called only once for lookup)
      registry.lookup('cacheable');

      // prepare is called once for the DB lookup (SELECT)
      const selectCalls = (freshDb.db.prepare as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('SELECT'),
      );
      expect(selectCalls.length).toBe(1);
    });
  });

  describe('listRemote', () => {
    it('should return only remote entries', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'local-1', location: 'local' }));
      registry.register(makeEntry({ agentId: 'remote-1', location: 'remote', url: 'http://r1' }));
      registry.register(makeEntry({ agentId: 'remote-2', location: 'remote', url: 'http://r2' }));

      const remotes = registry.listRemote();
      expect(remotes.length).toBe(2);
      expect(remotes.every((e) => e.location === 'remote')).toBe(true);
    });
  });

  describe('listAll', () => {
    it('should return all registered entries', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'a1' }));
      registry.register(makeEntry({ agentId: 'a2' }));
      registry.register(makeEntry({ agentId: 'a3' }));

      expect(registry.listAll().length).toBe(3);
    });
  });

  describe('discoverFromCard', () => {
    it('should create remote entry from A2AAgentCard and register it', () => {
      const registry = createLocationRegistry(db, eventBus);
      const card = { name: 'discovered-agent', protocol: 'a2a/v1.0', capabilities: ['execute'] };

      const entry = registry.discoverFromCard(card, 'http://discovered.example.com');

      expect(entry.agentId).toBe('discovered-agent');
      expect(entry.location).toBe('remote');
      expect(entry.url).toBe('http://discovered.example.com');
      expect(entry.agentCard).toBe(card);
      expect(entry.transport).toBe('a2a');
      expect(entry.avgLatencyMs).toBe(0);

      // Should also be registered (emits event)
      expect(eventBus.emit).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove from memory and DB', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'to-remove' }));

      registry.remove('to-remove');

      expect(registry.lookup('to-remove')).toBeUndefined();

      // Verify DELETE was issued
      const deleteCalls = (db.db.prepare as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('DELETE FROM agent_transports'),
      );
      expect(deleteCalls.length).toBe(1);
    });

    it('should emit transport:agent_removed event', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'remove-me' }));

      registry.remove('remove-me');

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:agent_removed',
          payload: { agentId: 'remove-me' },
          source: 'location-registry',
        }),
      );
    });
  });

  describe('isLocal', () => {
    it('should return true for unregistered agents', () => {
      const mockStmt = createMockStatement(undefined);
      const freshDb = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createLocationRegistry(freshDb, eventBus);
      expect(registry.isLocal('unknown')).toBe(true);
    });

    it('should return true for local agents', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'local-agent', location: 'local' }));

      expect(registry.isLocal('local-agent')).toBe(true);
    });

    it('should return false for remote agents', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'remote-agent', location: 'remote' }));

      expect(registry.isLocal('remote-agent')).toBe(false);
    });
  });

  describe('swapLocation', () => {
    it('should swap location from local to remote', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'swap-me', location: 'local' }));

      registry.swapLocation('swap-me', 'remote', 'http://new-url');

      const updated = registry.lookup('swap-me');
      expect(updated?.location).toBe('remote');
      expect(updated?.url).toBe('http://new-url');
    });

    it('should emit transport:location_swapped event', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'swap-evt', location: 'local' }));

      registry.swapLocation('swap-evt', 'remote', 'http://r');

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:location_swapped',
          payload: { agentId: 'swap-evt', from: 'local', to: 'remote', url: 'http://r' },
          source: 'location-registry',
        }),
      );
    });

    it('should notify registered change handlers', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'notify-me', location: 'local' }));

      const handler = vi.fn();
      registry.onLocationChange(handler);

      registry.swapLocation('notify-me', 'remote');

      expect(handler).toHaveBeenCalledWith('notify-me', 'local', 'remote');
    });

    it('should be a no-op when swapping to same location', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'same-loc', location: 'local' }));

      const emitCountBefore = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.length;
      registry.swapLocation('same-loc', 'local');

      // No new event emitted (only the initial register event)
      expect((eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.length).toBe(emitCountBefore);
    });

    it('should throw for unknown agent', () => {
      const registry = createLocationRegistry(db, eventBus);

      expect(() =>
        registry.swapLocation('ghost', 'remote'),
      ).toThrow('Cannot swap location for unknown agent: ghost');
    });

    it('should allow unsubscribing change handlers', () => {
      const registry = createLocationRegistry(db, eventBus);
      registry.register(makeEntry({ agentId: 'unsub-test', location: 'local' }));

      const handler = vi.fn();
      const unsubscribe = registry.onLocationChange(handler);

      unsubscribe();
      registry.swapLocation('unsub-test', 'remote');

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
