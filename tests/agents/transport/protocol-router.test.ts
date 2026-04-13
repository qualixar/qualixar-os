/**
 * Qualixar OS Phase 10b -- ProtocolRouter Tests
 *
 * Tests the rule-based transport selection decision tree,
 * team transport selection, metric recording, and recommendations.
 * Mocks QosDatabase (db.db.prepare().run() chain), EventBus, LocationRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QosDatabase } from '../../../src/db/database.js';
import type { EventBus } from '../../../src/events/event-bus.js';
import type {
  LocationRegistry,
  AgentTransport,
  AgentLocationEntry,
  TransportConfig,
  ProtocolMetric,
} from '../../../src/agents/transport/types.js';
import { DEFAULT_TRANSPORT_CONFIG } from '../../../src/agents/transport/types.js';
import { createProtocolRouter } from '../../../src/agents/transport/protocol-router.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockStatement(returnValue?: unknown) {
  return {
    run: vi.fn().mockReturnValue({ changes: 5, lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(returnValue),
    all: vi.fn().mockReturnValue(returnValue ?? []),
  };
}

function createMockDb(statementReturn?: unknown): QosDatabase {
  const mockStmt = createMockStatement(statementReturn);
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

function createMockTransport(type: 'local' | 'a2a' | 'hybrid'): AgentTransport {
  return {
    send: vi.fn().mockResolvedValue({
      messageId: `msg-${type}`,
      delivered: true,
      latencyMs: 10,
      transport: type,
    }),
    subscribe: vi.fn().mockReturnValue(() => {}),
    getLatency: vi.fn().mockReturnValue(type === 'local' ? 1 : 100),
    getType: vi.fn().mockReturnValue(type),
  };
}

function createMockRegistry(
  lookupResults: Map<string, AgentLocationEntry | undefined> = new Map(),
  localOverrides: Map<string, boolean> = new Map(),
): LocationRegistry {
  return {
    register: vi.fn(),
    lookup: vi.fn((agentId: string) => lookupResults.get(agentId)),
    listRemote: vi.fn().mockReturnValue([]),
    listAll: vi.fn().mockReturnValue([]),
    discoverFromCard: vi.fn(),
    remove: vi.fn(),
    isLocal: vi.fn((agentId: string) => {
      if (localOverrides.has(agentId)) {
        return localOverrides.get(agentId)!;
      }
      const entry = lookupResults.get(agentId);
      if (!entry) return true;
      return entry.location === 'local';
    }),
    swapLocation: vi.fn(),
    onLocationChange: vi.fn().mockReturnValue(() => {}),
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

describe('ProtocolRouter', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let transports: {
    readonly local: AgentTransport;
    readonly a2a: AgentTransport;
    readonly hybrid: AgentTransport;
  };
  let config: TransportConfig;

  beforeEach(() => {
    db = createMockDb();
    eventBus = createMockEventBus();
    transports = {
      local: createMockTransport('local'),
      a2a: createMockTransport('a2a'),
      hybrid: createMockTransport('hybrid'),
    };
    config = DEFAULT_TRANSPORT_CONFIG;
  });

  describe('selectTransport', () => {
    it('should return local for unknown agent (not in registry)', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('unknown-agent');
      expect(result).toBe(transports.local);
    });

    it('should return local for agent with transport = local', () => {
      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set('local-agent', makeEntry({ agentId: 'local-agent', transport: 'local' }));
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('local-agent');
      expect(result).toBe(transports.local);
    });

    it('should return a2a for agent with transport = a2a and remote location', () => {
      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'remote-a2a',
        makeEntry({ agentId: 'remote-a2a', transport: 'a2a', location: 'remote', url: 'http://r' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('remote-a2a');
      expect(result).toBe(transports.a2a);
    });

    it('should return local for agent with transport = a2a but location = local', () => {
      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'local-a2a',
        makeEntry({ agentId: 'local-a2a', transport: 'a2a', location: 'local' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('local-a2a');
      expect(result).toBe(transports.local);
    });

    it('should return local for agent with transport = auto and local location', () => {
      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'auto-local',
        makeEntry({ agentId: 'auto-local', transport: 'auto', location: 'local' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('auto-local');
      expect(result).toBe(transports.local);
    });

    it('should return a2a for agent with transport = auto and remote location (no metrics)', () => {
      // No metrics -> confidence = 0 -> no override -> default a2a for remote
      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'auto-remote',
        makeEntry({ agentId: 'auto-remote', transport: 'auto', location: 'remote' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransport('auto-remote');
      expect(result).toBe(transports.a2a);
    });

    it('should fallback to local when auto/remote but high confidence recommends local', () => {
      // 20+ metrics recommending local -> confidence >= 1.0
      const metricsRows = Array.from({ length: 25 }, () => ({
        transport: 'local',
        latency_ms: 5,
        success: 1,
      }));

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'auto-hist',
        makeEntry({ agentId: 'auto-hist', transport: 'auto', location: 'remote' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(registry, transports, eventBus, dbWithMetrics, config);

      const result = router.selectTransport('auto-hist');
      expect(result).toBe(transports.local);
    });

    it('should fallback to local when auto/remote and success rate < 0.5 with high confidence', () => {
      // 20+ metrics with low success rate
      const metricsRows = Array.from({ length: 25 }, (_, i) => ({
        transport: 'a2a',
        latency_ms: 200,
        success: i < 5 ? 1 : 0, // only 5/25 = 20% success
      }));

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const lookups = new Map<string, AgentLocationEntry>();
      lookups.set(
        'auto-failing',
        makeEntry({ agentId: 'auto-failing', transport: 'auto', location: 'remote' }),
      );
      const registry = createMockRegistry(lookups);
      const router = createProtocolRouter(
        registry,
        transports,
        eventBus,
        dbWithMetrics,
        { ...config, fallbackToLocal: true },
      );

      const result = router.selectTransport('auto-failing');
      expect(result).toBe(transports.local);
    });
  });

  describe('selectTransportForTeam', () => {
    it('should return local for pure local team', () => {
      const localOverrides = new Map<string, boolean>([
        ['a1', true],
        ['a2', true],
        ['a3', true],
      ]);
      const registry = createMockRegistry(new Map(), localOverrides);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransportForTeam([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
      expect(result).toBe(transports.local);
    });

    it('should return a2a for pure remote team', () => {
      const localOverrides = new Map<string, boolean>([
        ['r1', false],
        ['r2', false],
      ]);
      const registry = createMockRegistry(new Map(), localOverrides);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransportForTeam([{ id: 'r1' }, { id: 'r2' }]);
      expect(result).toBe(transports.a2a);
    });

    it('should return hybrid for mixed team', () => {
      const localOverrides = new Map<string, boolean>([
        ['local-1', true],
        ['remote-1', false],
      ]);
      const registry = createMockRegistry(new Map(), localOverrides);
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const result = router.selectTransportForTeam([{ id: 'local-1' }, { id: 'remote-1' }]);
      expect(result).toBe(transports.hybrid);
    });
  });

  describe('recordMetric', () => {
    it('should INSERT metric via db.db.prepare().run()', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const metric: ProtocolMetric = {
        id: 'metric-1',
        agentId: 'agent-1',
        transport: 'local',
        latencyMs: 15,
        success: true,
        createdAt: '2026-04-01T00:00:00.000Z',
      };

      router.recordMetric(metric);

      expect(db.db.prepare).toHaveBeenCalled();
      const prepareCall = (db.db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prepareCall).toContain('INSERT INTO protocol_metrics');

      const stmt = (db.db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(stmt.run).toHaveBeenCalledWith(
        'metric-1', 'agent-1', 'local', 15, 1, null, '2026-04-01T00:00:00.000Z',
      );
    });

    it('should generate ID if metric.id is empty', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const metric: ProtocolMetric = {
        id: '',
        agentId: 'agent-1',
        transport: 'a2a',
        latencyMs: 100,
        success: false,
        createdAt: '2026-04-01T00:00:00.000Z',
      };

      router.recordMetric(metric);

      const stmt = (db.db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value;
      const idArg = stmt.run.mock.calls[0][0] as string;
      // Generated ID should be a UUID (not empty)
      expect(idArg).toBeTruthy();
      expect(idArg.length).toBeGreaterThan(0);
    });

    it('should emit transport:metric_recorded event', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      router.recordMetric({
        id: 'evt-metric',
        agentId: 'agent-x',
        transport: 'a2a',
        latencyMs: 200,
        success: true,
        createdAt: '2026-04-01T00:00:00.000Z',
      });

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:metric_recorded',
          payload: { agentId: 'agent-x', transport: 'a2a', latencyMs: 200 },
          source: 'protocol-router',
        }),
      );
    });

    it('should store success as 0 for failed metrics', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      router.recordMetric({
        id: 'fail-metric',
        agentId: 'agent-1',
        transport: 'a2a',
        latencyMs: 5000,
        success: false,
        createdAt: '2026-04-01T00:00:00.000Z',
      });

      const stmt = (db.db.prepare as ReturnType<typeof vi.fn>).mock.results[0].value;
      const successArg = stmt.run.mock.calls[0][4];
      expect(successArg).toBe(0);
    });
  });

  describe('getRecommendation', () => {
    it('should return default when no metrics exist', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const rec = router.getRecommendation('no-data-agent');
      expect(rec.transport).toBe('local');
      expect(rec.confidence).toBe(0.0);
      expect(rec.reason).toBe('No performance data');
      expect(rec.avgLatencyMs).toBe(0);
      expect(rec.successRate).toBe(1.0);
    });

    it('should recommend transport with highest score', () => {
      // Local: fast + high success = high score
      // A2A: slow + moderate success = low score
      const metricsRows = [
        { transport: 'local', latency_ms: 5, success: 1 },
        { transport: 'local', latency_ms: 3, success: 1 },
        { transport: 'a2a', latency_ms: 500, success: 1 },
        { transport: 'a2a', latency_ms: 600, success: 0 },
      ];

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, dbWithMetrics, config);

      const rec = router.getRecommendation('agent-mixed');
      expect(rec.transport).toBe('local');
      expect(rec.successRate).toBe(1.0); // both local metrics succeeded
      expect(rec.avgLatencyMs).toBe(4); // (5+3)/2
    });

    it('should calculate confidence based on data volume', () => {
      const metricsRows = Array.from({ length: 10 }, () => ({
        transport: 'local',
        latency_ms: 5,
        success: 1,
      }));

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, dbWithMetrics, config);

      const rec = router.getRecommendation('agent-10');
      expect(rec.confidence).toBe(0.5); // 10/20 = 0.5
    });

    it('should cap confidence at 1.0', () => {
      const metricsRows = Array.from({ length: 50 }, () => ({
        transport: 'a2a',
        latency_ms: 50,
        success: 1,
      }));

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, dbWithMetrics, config);

      const rec = router.getRecommendation('agent-50');
      expect(rec.confidence).toBe(1.0); // 50/20 capped at 1.0
    });

    it('should produce reason with metric count', () => {
      const metricsRows = Array.from({ length: 7 }, () => ({
        transport: 'local',
        latency_ms: 10,
        success: 1,
      }));

      const mockStmt = createMockStatement();
      mockStmt.all = vi.fn().mockReturnValue(metricsRows);
      const dbWithMetrics = {
        db: { prepare: vi.fn().mockReturnValue(mockStmt) },
        insert: vi.fn(),
        update: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        close: vi.fn(),
        runMigrations: vi.fn(),
      } as unknown as QosDatabase;

      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, dbWithMetrics, config);

      const rec = router.getRecommendation('agent-7');
      expect(rec.reason).toBe('Based on 7 historical metrics');
    });
  });

  describe('pruneOldMetrics', () => {
    it('should DELETE old metrics and return count', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      const deleted = router.pruneOldMetrics(30);

      expect(deleted).toBe(5); // mock returns changes: 5

      const prepareCall = (db.db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(prepareCall).toContain('DELETE FROM protocol_metrics');
      expect(prepareCall).toContain("datetime('now'");
    });

    it('should emit transport:metrics_pruned event', () => {
      const registry = createMockRegistry();
      const router = createProtocolRouter(registry, transports, eventBus, db, config);

      router.pruneOldMetrics(14);

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transport:metrics_pruned',
          payload: { olderThanDays: 14, deletedCount: 5 },
          source: 'protocol-router',
        }),
      );
    });
  });
});
