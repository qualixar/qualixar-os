/**
 * Qualixar OS Session 15 -- Web Search Tool Tests (C-15)
 *
 * Tests for Tavily web search integration.
 * All tests mock fetch() — no real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webSearch, isWebSearchAvailable } from '../../src/tools/web-search.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env };

describe('webSearch', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('returns error result when TAVILY_API_KEY is not set', async () => {
    delete process.env.TAVILY_API_KEY;
    const results = await webSearch('test query');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Error');
    expect(results[0].snippet).toContain('TAVILY_API_KEY not configured');
  });

  it('returns empty array for empty query', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    const results = await webSearch('');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for whitespace-only query', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    const results = await webSearch('   ');
    expect(results).toHaveLength(0);
  });

  it('calls Tavily API with correct parameters', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({
      results: [
        { title: 'Result 1', url: 'https://example.com', content: 'snippet 1', score: 0.95 },
      ],
    });

    const results = await webSearch('TypeScript testing', { maxResults: 3 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // Verify body
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.api_key).toBe('test-key');
    expect(body.query).toBe('TypeScript testing');
    expect(body.max_results).toBe(3);
    expect(body.search_depth).toBe('basic');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Result 1');
    expect(results[0].url).toBe('https://example.com');
    expect(results[0].snippet).toBe('snippet 1');
    expect(results[0].score).toBe(0.95);
  });

  it('handles multiple results', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({
      results: [
        { title: 'A', url: 'https://a.com', content: 'content A' },
        { title: 'B', url: 'https://b.com', content: 'content B' },
        { title: 'C', url: 'https://c.com', content: 'content C' },
      ],
    });

    const results = await webSearch('multi test');
    expect(results).toHaveLength(3);
    expect(results[0].title).toBe('A');
    expect(results[2].title).toBe('C');
  });

  it('handles Tavily API error response', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({ error: 'Invalid API key' }, 401);

    const results = await webSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Error');
    expect(results[0].snippet).toContain('Tavily API error (401)');
  });

  it('handles network errors gracefully', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

    const results = await webSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Error');
    expect(results[0].snippet).toContain('Network unreachable');
  });

  it('uses advanced search depth when specified', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({ results: [] });

    await webSearch('deep search', { searchDepth: 'advanced' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.search_depth).toBe('advanced');
  });

  it('defaults to 5 max results', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({ results: [] });

    await webSearch('default count');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.max_results).toBe(5);
  });

  it('handles missing fields in Tavily response', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({
      results: [{ title: null, url: undefined, content: null }],
    });

    const results = await webSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('');
    expect(results[0].url).toBe('');
    expect(results[0].snippet).toBe('');
  });

  it('handles missing results array in response', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    mockFetch({});

    const results = await webSearch('test');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isWebSearchAvailable
// ---------------------------------------------------------------------------

describe('isWebSearchAvailable', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true when TAVILY_API_KEY is set', () => {
    process.env.TAVILY_API_KEY = 'test-key';
    expect(isWebSearchAvailable()).toBe(true);
  });

  it('returns false when TAVILY_API_KEY is not set', () => {
    delete process.env.TAVILY_API_KEY;
    expect(isWebSearchAvailable()).toBe(false);
  });

  it('returns false when TAVILY_API_KEY is empty', () => {
    process.env.TAVILY_API_KEY = '';
    expect(isWebSearchAvailable()).toBe(false);
  });
});
