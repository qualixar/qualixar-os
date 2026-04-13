/**
 * Tests for DuckDuckGo Search Fallback
 *
 * Tests the free DuckDuckGo Instant Answer API integration.
 * All tests mock fetch() — no real API calls.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { duckDuckGoSearch, isTavilyAvailable, isAnySearchAvailable } from '../../src/tools/web-search.js';

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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('duckDuckGoSearch', () => {
  it('returns results from abstract', async () => {
    mockFetch({
      Abstract: 'Qualixar OS is an AI agent operating system.',
      AbstractURL: 'https://qualixar.com',
      Heading: 'Qualixar OS',
      RelatedTopics: [],
    });

    const results = await duckDuckGoSearch('Qualixar OS');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Qualixar OS');
    expect(results[0].url).toBe('https://qualixar.com');
    expect(results[0].snippet).toContain('AI agent');
  });

  it('returns results from related topics', async () => {
    mockFetch({
      Abstract: '',
      AbstractURL: '',
      RelatedTopics: [
        { Text: 'Topic 1 about AI', FirstURL: 'https://example.com/1' },
        { Text: 'Topic 2 about agents', FirstURL: 'https://example.com/2' },
      ],
    });

    const results = await duckDuckGoSearch('AI agents');

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].url).toBe('https://example.com/1');
  });

  it('respects maxResults option', async () => {
    mockFetch({
      Abstract: 'Summary',
      AbstractURL: 'https://example.com',
      Heading: 'Test',
      RelatedTopics: [
        { Text: 'T1', FirstURL: 'https://example.com/1' },
        { Text: 'T2', FirstURL: 'https://example.com/2' },
        { Text: 'T3', FirstURL: 'https://example.com/3' },
      ],
    });

    const results = await duckDuckGoSearch('test', { maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty query', async () => {
    const results = await duckDuckGoSearch('');
    expect(results).toEqual([]);
  });

  it('returns "no results" when API returns nothing', async () => {
    mockFetch({
      Abstract: '',
      AbstractURL: '',
      RelatedTopics: [],
    });

    const results = await duckDuckGoSearch('xyznonexistent');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('no instant answers');
  });

  it('handles API errors gracefully', async () => {
    mockFetch({}, 500);

    const results = await duckDuckGoSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('error');
  });

  it('handles fetch failures', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const results = await duckDuckGoSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('failed');
  });

  it('skips topics without FirstURL', async () => {
    mockFetch({
      Abstract: '',
      RelatedTopics: [
        { Text: 'No URL topic' },
        { Text: 'Has URL', FirstURL: 'https://example.com/valid' },
      ],
    });

    const results = await duckDuckGoSearch('test');
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/valid');
  });
});

describe('isTavilyAvailable', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns false without TAVILY_API_KEY', () => {
    delete process.env.TAVILY_API_KEY;
    expect(isTavilyAvailable()).toBe(false);
  });

  it('returns true with TAVILY_API_KEY', () => {
    process.env.TAVILY_API_KEY = 'test-key';
    expect(isTavilyAvailable()).toBe(true);
  });
});

describe('isAnySearchAvailable', () => {
  it('always returns true (DuckDuckGo is free)', () => {
    expect(isAnySearchAvailable()).toBe(true);
  });
});
