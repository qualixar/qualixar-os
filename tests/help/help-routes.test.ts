/**
 * Tests for Qualixar OS Help Chatbot HTTP Routes
 *
 * Tests POST /api/help/ask and GET /api/help/status endpoints.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { registerHelpRoutes, type HelpRouteState } from '../../src/help/help-routes.js';
import type { HelpSearchProvider } from '../../src/help/help-chatbot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(
  searchResults: readonly { layer: string; content: string }[] = [],
  state?: Partial<HelpRouteState>,
) {
  const app = new Hono();
  const provider: HelpSearchProvider = {
    search: vi.fn().mockResolvedValue(searchResults),
  };
  const routeState: HelpRouteState = {
    docsIngested: state?.docsIngested ?? false,
    fileCount: state?.fileCount ?? 0,
    chunkCount: state?.chunkCount ?? 0,
  };
  registerHelpRoutes(app, provider, routeState);
  return { app, provider, routeState };
}

// ---------------------------------------------------------------------------
// POST /api/help/ask
// ---------------------------------------------------------------------------

describe('POST /api/help/ask', () => {
  it('returns system prompt and sources for valid question', async () => {
    const { app } = createTestApp([
      { layer: 'semantic', content: 'Install Qualixar with npm' },
    ]);

    const res = await app.request('/api/help/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'how to install' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.conversationId).toBe('qos-help-builtin');
    expect(typeof body.systemPrompt).toBe('string');
    expect(body.chunksFound).toBe(1);
  });

  it('returns 400 for missing question', async () => {
    const { app } = createTestApp();

    const res = await app.request('/api/help/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('question is required');
  });

  it('returns 400 for empty question string', async () => {
    const { app } = createTestApp();

    const res = await app.request('/api/help/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '   ' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('question is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const { app } = createTestApp();

    const res = await app.request('/api/help/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Invalid JSON');
  });

  it('returns 400 for non-string question', async () => {
    const { app } = createTestApp();

    const res = await app.request('/api/help/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 42 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('question is required');
  });
});

// ---------------------------------------------------------------------------
// GET /api/help/status
// ---------------------------------------------------------------------------

describe('GET /api/help/status', () => {
  it('returns ingestion status', async () => {
    const { app } = createTestApp([], {
      docsIngested: true,
      fileCount: 5,
      chunkCount: 42,
    });

    const res = await app.request('/api/help/status');
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.docsIngested).toBe(true);
    expect(body.fileCount).toBe(5);
    expect(body.chunkCount).toBe(42);
    expect(body.helpConversationId).toBe('qos-help-builtin');
    expect(body.helpConversationTitle).toBe('QOS Help');
  });

  it('returns default state when docs not yet ingested', async () => {
    const { app } = createTestApp();

    const res = await app.request('/api/help/status');
    const body = await res.json() as Record<string, unknown>;

    expect(body.docsIngested).toBe(false);
    expect(body.fileCount).toBe(0);
    expect(body.chunkCount).toBe(0);
  });
});
