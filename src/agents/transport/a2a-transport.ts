// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- A2ATransport
 *
 * HTTP-based A2A transport for communicating with remote agents.
 * Implements retry with exponential backoff and per-agent circuit breaker.
 *
 * Source: Phase 10b LLD Section 2.4
 *
 * CRITICAL: Uses converter.toWireType() when serializing type field for remote calls.
 */

import type { Logger } from 'pino';
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
// Circuit Breaker State
// ---------------------------------------------------------------------------

interface CircuitBreakerState {
  failures: number;
  state: 'closed' | 'open' | 'half-open';
  lastFailure: number; // timestamp ms
  resetAfterMs: number; // default 60_000
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;
const LATENCY_WINDOW_SIZE = 20;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class A2ATransportImpl implements AgentTransport {
  private readonly _locationRegistry: LocationRegistry;
  private readonly _config: TransportConfig;
  private readonly _eventBus: EventBus;
  private readonly _logger: Logger;
  private readonly _circuitBreakers: Map<string, CircuitBreakerState>;
  private readonly _latencyWindow: Map<string, number[]>;
  private readonly _handlers: Map<string, Set<(msg: A2ATaskMessage) => void>>;

  constructor(
    locationRegistry: LocationRegistry,
    config: TransportConfig,
    eventBus: EventBus,
    logger: Logger,
  ) {
    this._locationRegistry = locationRegistry;
    this._config = config;
    this._eventBus = eventBus;
    this._logger = logger;
    this._circuitBreakers = new Map();
    this._latencyWindow = new Map();
    this._handlers = new Map();
  }

  async send(message: A2ATaskMessage): Promise<TransportSendResult> {
    // 1. Look up target agent
    const entry = this._locationRegistry.lookup(message.to);
    if (!entry) {
      throw new Error(`Agent not found in location registry: ${message.to}`);
    }
    if (entry.location !== 'remote') {
      throw new Error(`A2ATransport cannot send to local agent: ${message.to}`);
    }

    const url = entry.url;
    if (!url) {
      throw new Error(`No URL for remote agent: ${message.to}`);
    }

    // 2. Check circuit breaker
    const cb = this._getOrCreateCircuitBreaker(message.to);
    const now = Date.now();

    if (cb.state === 'open') {
      if (now - cb.lastFailure < cb.resetAfterMs) {
        throw new Error(`Circuit breaker open for agent: ${message.to}`);
      }
      // Time elapsed -- transition to half-open
      cb.state = 'half-open';
    }

    // 3. Retry loop
    const maxAttempts = this._config.retryCount + 1;
    let lastLatencyMs = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const startMs = performance.now();

        const response = await fetch(`${url}/a2a/tasks/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: message.id,
            prompt: message.payload.content,
            taskType: message.payload.metadata?.taskType,
          }),
          signal: AbortSignal.timeout(this._config.a2aTimeoutMs),
        });

        lastLatencyMs = performance.now() - startMs;

        if (response.ok) {
          // Success: update latency window, reset circuit breaker
          this._recordLatency(message.to, lastLatencyMs);
          cb.failures = 0;
          cb.state = 'closed';

          this._eventBus.emit({
            type: 'transport:message_sent',
            payload: {
              from: message.from,
              to: message.to,
              transport: 'a2a',
              latencyMs: lastLatencyMs,
            },
            source: 'a2a-transport',
          });

          return Object.freeze({
            messageId: message.id,
            delivered: true,
            latencyMs: lastLatencyMs,
            transport: 'a2a' as TransportType,
          });
        }

        // Response not ok: retry or fail
        if (attempt < maxAttempts - 1) {
          const baseDelay = this._config.retryBaseDelayMs * Math.pow(2, attempt);
          const jitter = baseDelay * Math.random() * 0.25;
          await this._delay(baseDelay + jitter);
          continue;
        }

        // Final attempt failed
        return this._handleFailure(message, cb, lastLatencyMs);
      } catch (error: unknown) {
        lastLatencyMs = performance.now() - (performance.now() - lastLatencyMs);

        // Network error on final attempt
        if (attempt >= maxAttempts - 1) {
          this._logger.warn(
            { agentId: message.to, error },
            'A2ATransport send failed after all retries',
          );
          return this._handleFailure(message, cb, lastLatencyMs);
        }

        // Retry on network error
        const baseDelay = this._config.retryBaseDelayMs * Math.pow(2, attempt);
        const jitter = baseDelay * Math.random() * 0.25;
        await this._delay(baseDelay + jitter);
      }
    }

    // Should not reach here, but guard
    return this._handleFailure(message, cb, lastLatencyMs);
  }

  subscribe(
    agentId: string,
    handler: (msg: A2ATaskMessage) => void,
  ): () => void {
    if (!this._handlers.has(agentId)) {
      this._handlers.set(agentId, new Set());
    }
    this._handlers.get(agentId)!.add(handler);

    return () => {
      this._handlers.get(agentId)?.delete(handler);
    };
  }

  /**
   * Dispatch an inbound A2A message to registered handlers.
   * Called by A2AServer integration when remote messages arrive.
   */
  dispatchInbound(agentId: string, message: A2ATaskMessage): void {
    const handlers = this._handlers.get(agentId);
    if (!handlers || handlers.size === 0) {
      this._logger.warn({ agentId }, 'No handlers registered for inbound A2A message');
      return;
    }
    for (const handler of handlers) {
      handler(message);
    }
  }

  getLatency(): number {
    const allLatencies: number[] = [];
    for (const window of this._latencyWindow.values()) {
      allLatencies.push(...window);
    }
    if (allLatencies.length === 0) {
      return -1; // No data
    }
    const sum = allLatencies.reduce((a, b) => a + b, 0);
    return sum / allLatencies.length;
  }

  getType(): TransportType {
    return 'a2a';
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _getOrCreateCircuitBreaker(agentId: string): CircuitBreakerState {
    let cb = this._circuitBreakers.get(agentId);
    if (!cb) {
      cb = {
        failures: 0,
        state: 'closed',
        lastFailure: 0,
        resetAfterMs: CIRCUIT_BREAKER_RESET_MS,
      };
      this._circuitBreakers.set(agentId, cb);
    }
    return cb;
  }

  private _recordLatency(agentId: string, latencyMs: number): void {
    let window = this._latencyWindow.get(agentId);
    if (!window) {
      window = [];
      this._latencyWindow.set(agentId, window);
    }
    window.push(latencyMs);
    if (window.length > LATENCY_WINDOW_SIZE) {
      window.shift();
    }
  }

  private _handleFailure(
    message: A2ATaskMessage,
    cb: CircuitBreakerState,
    latencyMs: number,
  ): TransportSendResult {
    cb.failures++;
    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.state = 'open';
      cb.lastFailure = Date.now();
    }

    this._eventBus.emit({
      type: 'transport:send_failed',
      payload: {
        from: message.from,
        to: message.to,
        transport: 'a2a',
        failures: cb.failures,
        circuitState: cb.state,
      },
      source: 'a2a-transport',
    });

    return Object.freeze({
      messageId: message.id,
      delivered: false,
      latencyMs,
      transport: 'a2a' as TransportType,
    });
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createA2ATransport(
  locationRegistry: LocationRegistry,
  config: TransportConfig,
  eventBus: EventBus,
  logger: Logger,
): A2ATransportImpl {
  return new A2ATransportImpl(locationRegistry, config, eventBus, logger);
}
