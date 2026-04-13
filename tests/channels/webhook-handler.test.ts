/**
 * Qualixar OS Phase 7 -- Webhook Handler Tests
 *
 * Tests HMAC signing, webhook sending, event filtering, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signPayload,
  createWebhookHandler,
} from '../../src/channels/webhook-handler.js';
import type { WebhookConfig } from '../../src/channels/webhook-handler.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { QosEvent } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Mock EventBus
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus & { handlers: Map<string, Set<(event: QosEvent) => Promise<void>>> } {
  const handlers = new Map<string, Set<(event: QosEvent) => Promise<void>>>();

  return {
    handlers,
    emit: vi.fn((event: Omit<QosEvent, 'id' | 'timestamp'>) => {
      const fullEvent: QosEvent = {
        id: 1,
        timestamp: new Date().toISOString(),
        ...event,
      } as QosEvent;
      const typeHandlers = handlers.get(event.type as string) ?? new Set();
      const wildcardHandlers = handlers.get('*') ?? new Set();
      for (const handler of typeHandlers) {
        handler(fullEvent);
      }
      for (const handler of wildcardHandlers) {
        handler(fullEvent);
      }
    }),
    on: vi.fn((type: string, handler: (event: QosEvent) => Promise<void>) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);
    }),
    off: vi.fn((type: string, handler: (event: QosEvent) => Promise<void>) => {
      handlers.get(type)?.delete(handler);
    }),
    replay: vi.fn().mockResolvedValue(0),
    getLastEventId: vi.fn().mockReturnValue(0),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhook Handler', () => {
  describe('signPayload', () => {
    it('creates an HMAC-SHA256 hex signature', () => {
      const signature = signPayload('{"test": true}', 'my-secret');
      expect(signature).toBeTruthy();
      expect(signature.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('produces consistent signatures for same input', () => {
      const sig1 = signPayload('hello', 'key');
      const sig2 = signPayload('hello', 'key');
      expect(sig1).toBe(sig2);
    });

    it('produces different signatures for different secrets', () => {
      const sig1 = signPayload('hello', 'key1');
      const sig2 = signPayload('hello', 'key2');
      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different payloads', () => {
      const sig1 = signPayload('hello', 'key');
      const sig2 = signPayload('world', 'key');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('createWebhookHandler', () => {
    let eventBus: ReturnType<typeof createMockEventBus>;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      eventBus = createMockEventBus();
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('subscribes to EventBus on creation', () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
      };
      createWebhookHandler(eventBus, config);
      expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('sends webhook for matching events', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        retries: 1,
      };
      const handler = createWebhookHandler(eventBus, config);

      // Trigger a matching event
      eventBus.emit({
        type: 'task:completed',
        payload: { taskId: 't1' },
        source: 'test',
        taskId: 't1',
      });

      // Wait for async delivery
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-QOS-Event': 'task:completed',
          }),
        }),
      );

      expect(handler.deliveries.length).toBe(1);
      expect(handler.deliveries[0].status).toBe('success');
    });

    it('does NOT send webhook for non-matching events', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        retries: 1,
      };
      createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:created',
        payload: { taskId: 't1' },
        source: 'test',
        taskId: 't1',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends webhook for wildcard (*) event config', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['*'],
        retries: 1,
      };
      createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:created',
        payload: { taskId: 't1' },
        source: 'test',
        taskId: 't1',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fetchMock).toHaveBeenCalled();
    });

    it('includes HMAC signature when secret is provided', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        secret: 'super-secret',
        retries: 1,
      };
      createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:completed',
        payload: { taskId: 't1' },
        source: 'test',
        taskId: 't1',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-QOS-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('records failed deliveries', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        retries: 1,
      };
      const handler = createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:completed',
        payload: {},
        source: 'test',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handler.deliveries.length).toBe(1);
      expect(handler.deliveries[0].status).toBe('failed');
      expect(handler.deliveries[0].error).toContain('500');
    });

    it('retries on failure', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        retries: 2,
      };
      const handler = createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:completed',
        payload: {},
        source: 'test',
      });

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(handler.deliveries.length).toBe(1);
      expect(handler.deliveries[0].status).toBe('success');
      expect(handler.deliveries[0].attempts).toBe(2);
    });

    it('destroy() unsubscribes from EventBus', () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
      };
      const handler = createWebhookHandler(eventBus, config);
      handler.destroy();
      expect(eventBus.off).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('handles fetch throwing (network error / abort)', async () => {
      fetchMock.mockRejectedValue(new Error('Network failure'));

      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['task:completed'],
        retries: 1,
        timeoutMs: 100,
      };
      const handler = createWebhookHandler(eventBus, config);

      eventBus.emit({
        type: 'task:completed',
        payload: {},
        source: 'test',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handler.deliveries.length).toBe(1);
      expect(handler.deliveries[0].status).toBe('failed');
      expect(handler.deliveries[0].error).toContain('Network failure');
    });

    it('uses sendWebhook directly for timeout coverage', async () => {
      // Import sendWebhook directly
      const { sendWebhook } = await import('../../src/channels/webhook-handler.js');

      // Mock fetch to succeed to exercise clearTimeout path
      fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

      const event: QosEvent = {
        id: 99,
        type: 'task:completed',
        payload: { taskId: 't1' },
        source: 'test',
        taskId: 't1',
        timestamp: new Date().toISOString(),
      };

      const delivery = await sendWebhook(
        'https://example.com/webhook',
        event,
        'secret-key',
        1,
        5000,
      );

      expect(delivery.status).toBe('success');
      expect(delivery.attempts).toBe(1);
    });
  });
});
