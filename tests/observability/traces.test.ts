/**
 * Qualixar OS Phase 9 — Tracing Tests
 * TDD: Tests written first, then implementation.
 *
 * Strategy: Mock NodeSDK to avoid side-effects.
 * Verify idempotent init, shutdown, getTracer, TRACER_NAMES.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We mock the heavy SDK dep so tests stay fast and side-effect-free.
// vi.hoisted() keeps mock references accessible inside vi.mock factories.
// ---------------------------------------------------------------------------
const { mockStart, mockShutdown } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockShutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = mockStart;
    this.shutdown = mockShutdown;
  }),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: unknown) {
    this._opts = opts;
  }),
}));

vi.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this._name = 'http';
  }),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  AlwaysOnSampler: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this._type = 'always-on';
  }),
  TraceIdRatioBasedSampler: vi.fn().mockImplementation(function (this: Record<string, unknown>, ratio: number) {
    this._ratio = ratio;
  }),
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn().mockImplementation((attrs: Record<string, string>) => ({
    attributes: attrs,
  })),
}));

// Hoist the mockTracer so it's available inside the vi.mock factory
const { mockTracer } = vi.hoisted(() => ({
  mockTracer: { startSpan: vi.fn() },
}));

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getTracer: vi.fn().mockReturnValue(mockTracer),
    },
  };
});

// Import AFTER mocks are set up
import {
  initTracing,
  shutdownTracing,
  getTracer,
  isInitialized,
  TRACER_NAMES,
  type TracingConfig,
} from '../../src/observability/traces.js';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AlwaysOnSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tracing', () => {
  const baseConfig: TracingConfig = {
    serviceName: 'qualixar-os-test',
    environment: 'test',
    sampleRate: 1.0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure clean state between tests
    shutdownTracing();
  });

  afterEach(() => {
    shutdownTracing();
  });

  // -----------------------------------------------------------------------
  // initTracing
  // -----------------------------------------------------------------------
  describe('initTracing', () => {
    it('creates and starts a NodeSDK on first call', () => {
      initTracing(baseConfig);

      expect(NodeSDK).toHaveBeenCalledOnce();
      expect(mockStart).toHaveBeenCalledOnce();
      expect(isInitialized()).toBe(true);
    });

    it('is idempotent — second call is a no-op', () => {
      initTracing(baseConfig);
      initTracing(baseConfig);

      expect(NodeSDK).toHaveBeenCalledOnce();
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it('uses AlwaysOnSampler when sampleRate >= 1.0', () => {
      initTracing({ ...baseConfig, sampleRate: 1.0 });

      expect(AlwaysOnSampler).toHaveBeenCalledOnce();
      expect(TraceIdRatioBasedSampler).not.toHaveBeenCalled();
    });

    it('uses TraceIdRatioBasedSampler when sampleRate < 1.0', () => {
      initTracing({ ...baseConfig, sampleRate: 0.5 });

      expect(TraceIdRatioBasedSampler).toHaveBeenCalledWith(0.5);
      expect(AlwaysOnSampler).not.toHaveBeenCalled();
    });

    it('creates OTLPTraceExporter when endpoint is provided', () => {
      initTracing({ ...baseConfig, endpoint: 'http://localhost:4318' });

      expect(OTLPTraceExporter).toHaveBeenCalledWith({
        url: 'http://localhost:4318',
      });
    });

    it('does not create exporter when no endpoint is provided', () => {
      initTracing(baseConfig);

      expect(OTLPTraceExporter).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // shutdownTracing
  // -----------------------------------------------------------------------
  describe('shutdownTracing', () => {
    it('calls sdk.shutdown() when initialized', async () => {
      initTracing(baseConfig);

      await shutdownTracing();

      expect(mockShutdown).toHaveBeenCalledOnce();
      expect(isInitialized()).toBe(false);
    });

    it('is a no-op when not initialized', async () => {
      await shutdownTracing();
      // No error, no call
      expect(mockShutdown).not.toHaveBeenCalled();
    });

    it('handles shutdown timeout gracefully', { timeout: 10_000 }, async () => {
      // Make shutdown hang — the race should resolve via timeout
      mockShutdown.mockImplementationOnce(
        () => new Promise(() => { /* never resolves */ }),
      );
      initTracing(baseConfig);

      // Should resolve within ~6s (5s timeout + buffer)
      await shutdownTracing();
      expect(isInitialized()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getTracer
  // -----------------------------------------------------------------------
  describe('getTracer', () => {
    it('returns a Tracer from the global trace API', () => {
      const tracer = getTracer('test-tracer');

      expect(tracer).toBe(mockTracer);
    });

    it('passes current VERSION to getTracer', async () => {
      const { trace } = await import('@opentelemetry/api');
      getTracer('my-tracer');

      expect(trace.getTracer).toHaveBeenCalledWith('my-tracer', expect.any(String));
    });
  });

  // -----------------------------------------------------------------------
  // isInitialized
  // -----------------------------------------------------------------------
  describe('isInitialized', () => {
    it('returns false before init', () => {
      expect(isInitialized()).toBe(false);
    });

    it('returns true after init', () => {
      initTracing(baseConfig);
      expect(isInitialized()).toBe(true);
    });

    it('returns false after shutdown', async () => {
      initTracing(baseConfig);
      await shutdownTracing();
      expect(isInitialized()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // TRACER_NAMES
  // -----------------------------------------------------------------------
  describe('TRACER_NAMES', () => {
    it('exports all required tracer name constants', () => {
      expect(TRACER_NAMES).toEqual({
        MODEL_CALL: 'qos.model-call',
        JUDGE: 'qos.judge',
        ORCHESTRATOR: 'qos.orchestrator',
        FORGE: 'qos.forge',
        MEMORY: 'qos.memory',
        HTTP: 'qos.http',
        A2A: 'qos.a2a',
        MCP: 'qos.mcp',
      });
    });

    it('all values are non-empty strings', () => {
      for (const value of Object.values(TRACER_NAMES)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(TRACER_NAMES)).toBe(true);
    });
  });
});
