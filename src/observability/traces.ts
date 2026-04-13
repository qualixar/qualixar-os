// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 9 — OpenTelemetry Tracing Initialization
 *
 * Idempotent SDK setup with configurable sampling, optional OTLP export,
 * and graceful shutdown with timeout protection.
 *
 * @module observability/traces
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { trace } from '@opentelemetry/api';
import type { Tracer, Attributes } from '@opentelemetry/api';
import { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the Qualixar OS tracing subsystem. */
export interface TracingConfig {
  /** Service name reported to the collector. */
  readonly serviceName: string;
  /** Optional OTLP HTTP endpoint (e.g. "http://localhost:4318"). */
  readonly endpoint?: string;
  /** Deployment environment — controls resource attributes. */
  readonly environment: 'development' | 'production' | 'test';
  /**
   * Sampling rate between 0.0 and 1.0.
   * - >= 1.0 → AlwaysOnSampler (capture every span)
   * - < 1.0  → TraceIdRatioBasedSampler
   */
  readonly sampleRate: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let sdk: NodeSDK | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the OTEL tracing SDK.
 *
 * Idempotent — calling twice with different configs is a no-op after the
 * first successful init. Shut down first if reconfiguration is needed.
 */
export function initTracing(config: TracingConfig): void {
  if (sdk !== null) {
    return; // Already initialized — idempotent guard
  }

  // Resource — identifies this service in the collector
  const resource = resourceFromAttributes({
    'service.name': config.serviceName,
    'service.version': VERSION,
    'deployment.environment': config.environment,
  } satisfies Attributes);

  // Exporter — only created when an endpoint is explicitly provided
  const traceExporter = config.endpoint
    ? new OTLPTraceExporter({ url: config.endpoint })
    : undefined;

  // Sampler — full capture in dev/test, ratio-based in production
  const sampler = config.sampleRate >= 1.0
    ? new AlwaysOnSampler()
    : new TraceIdRatioBasedSampler(config.sampleRate);

  // Build and start the SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [new HttpInstrumentation()],
    sampler,
  });

  sdk.start();

  // Graceful shutdown on SIGTERM (container orchestrators send this)
  /* v8 ignore next 3 -- SIGTERM handler cannot be tested without killing process */
  process.once('SIGTERM', () => {
    shutdownTracing();
  });
}

/**
 * Gracefully shut down the tracing SDK.
 *
 * Races the SDK shutdown against a 5-second timeout to prevent hanging
 * during process exit.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk === null) {
    return;
  }

  const current = sdk;
  sdk = null; // Mark as not-initialized immediately

  try {
    await Promise.race([
      current.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  } catch {
    // Swallow shutdown errors — we're exiting anyway
  }
}

/**
 * Obtain a named Tracer scoped to Qualixar OS v2.0.0.
 *
 * Safe to call whether or not the SDK has been initialized —
 * the global trace API returns a no-op tracer when no provider is registered.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name, VERSION);
}

/** Returns true if the tracing SDK is currently running. */
export function isInitialized(): boolean {
  return sdk !== null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Standard tracer names used across Qualixar OS subsystems.
 * Frozen to guarantee immutability at runtime.
 */
export const TRACER_NAMES = Object.freeze({
  MODEL_CALL: 'qos.model-call',
  JUDGE: 'qos.judge',
  ORCHESTRATOR: 'qos.orchestrator',
  FORGE: 'qos.forge',
  MEMORY: 'qos.memory',
  HTTP: 'qos.http',
  A2A: 'qos.a2a',
  MCP: 'qos.mcp',
} as const);
