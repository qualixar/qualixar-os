// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Webhook Handler
 *
 * Outbound POST on configurable events with HMAC-SHA256 signature and retry.
 * Subscribes to EventBus events, fires matching webhooks.
 * Export createWebhookHandler() factory for testability.
 */

import { createHmac } from 'node:crypto';
import type { EventBus } from '../events/event-bus.js';
import type { QosEvent } from '../types/common.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  readonly url: string;
  readonly events: readonly string[];
  readonly secret?: string;
  readonly retries?: number;
  readonly timeoutMs?: number;
}

export interface WebhookDelivery {
  readonly event: QosEvent;
  readonly url: string;
  readonly status: 'success' | 'failed';
  readonly statusCode?: number;
  readonly attempts: number;
  readonly error?: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// HMAC Signing
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Webhook Sender
// ---------------------------------------------------------------------------

async function sendWebhook(
  url: string,
  event: QosEvent,
  secret?: string,
  retries: number = 3,
  timeoutMs: number = 10000,
): Promise<WebhookDelivery> {
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    payload: event.payload,
    source: event.source,
    taskId: event.taskId,
    timestamp: event.timestamp,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-QOS-Event': event.type,
  };

  if (secret) {
    headers['X-QOS-Signature'] = `sha256=${signPayload(body, secret)}`;
  }

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      lastStatusCode = response.status;

      if (response.ok) {
        return {
          event,
          url,
          status: 'success',
          statusCode: response.status,
          attempts: attempt,
          timestamp: new Date().toISOString(),
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Exponential backoff between retries
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }

  return {
    event,
    url,
    status: 'failed',
    statusCode: lastStatusCode,
    attempts: retries,
    error: lastError,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface WebhookHandler {
  readonly deliveries: readonly WebhookDelivery[];
  destroy(): void;
}

export function createWebhookHandler(
  eventBus: EventBus,
  config: WebhookConfig,
): WebhookHandler {
  const deliveries: WebhookDelivery[] = [];
  const eventSet = new Set(config.events);

  const handler = async (event: QosEvent): Promise<void> => {
    if (!eventSet.has(event.type) && !eventSet.has('*')) {
      return;
    }

    const delivery = await sendWebhook(
      config.url,
      event,
      config.secret,
      config.retries ?? 3,
      config.timeoutMs ?? 10000,
    );

    deliveries.push(delivery);
  };

  // Subscribe to all events, filter internally
  eventBus.on('*', handler);

  return {
    get deliveries() {
      return [...deliveries] as readonly WebhookDelivery[];
    },
    destroy() {
      eventBus.off('*', handler);
    },
  };
}

// Export internals for testing
export { signPayload, sendWebhook };
