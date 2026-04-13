/**
 * Tests for Qualixar OS Web Crawler Tool
 *
 * Tests URL crawling, HTML stripping, link extraction,
 * and error handling. All tests mock fetch().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crawlUrl, webCrawlHandler } from '../../src/tools/web-crawler.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(html: string, status = 200, url?: string): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
    url: url ?? 'https://example.com',
  });
}

function mockFetchError(message: string): void {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error(message));
}

beforeEach(() => {
  // Reset fetch before each test
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// crawlUrl Tests
// ---------------------------------------------------------------------------

describe('crawlUrl', () => {
  it('extracts title from HTML', async () => {
    mockFetch('<html><head><title>Test Page</title></head><body>Content</body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.title).toBe('Test Page');
    expect(result.textContent).toContain('Content');
  });

  it('strips HTML tags from content', async () => {
    mockFetch('<html><body><h1>Header</h1><p>Paragraph with <b>bold</b></p></body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.textContent).toContain('Header');
    expect(result.textContent).toContain('Paragraph with bold');
    expect(result.textContent).not.toContain('<h1>');
    expect(result.textContent).not.toContain('<b>');
  });

  it('removes script and style blocks', async () => {
    mockFetch('<html><head><style>body{color:red}</style></head><body><script>alert("xss")</script>Clean text</body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.textContent).toContain('Clean text');
    expect(result.textContent).not.toContain('alert');
    expect(result.textContent).not.toContain('color:red');
  });

  it('extracts links from HTML', async () => {
    mockFetch('<html><body><a href="/page1">Page 1</a><a href="https://other.com/page2">Page 2</a></body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.links).toContain('https://example.com/page1');
    expect(result.links).toContain('https://other.com/page2');
  });

  it('skips anchor and javascript links', async () => {
    mockFetch('<html><body><a href="#section">Anchor</a><a href="javascript:void(0)">JS</a><a href="mailto:a@b.com">Mail</a></body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.links).toHaveLength(0);
  });

  it('returns status code', async () => {
    mockFetch('<html><body>OK</body></html>', 200);
    const result = await crawlUrl('https://example.com');

    expect(result.statusCode).toBe(200);
  });

  it('handles HTML entities', async () => {
    mockFetch('<html><body>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39; &nbsp;G</body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.textContent).toContain('A & B');
    expect(result.textContent).toContain('< C >');
    expect(result.textContent).toContain('"E"');
  });

  it('truncates content to 5000 chars', async () => {
    const longContent = 'x'.repeat(10000);
    mockFetch(`<html><body>${longContent}</body></html>`);
    const result = await crawlUrl('https://example.com');

    expect(result.textContent.length).toBeLessThanOrEqual(5000);
  });

  it('throws on invalid URL', async () => {
    await expect(crawlUrl('not-a-url')).rejects.toThrow('Invalid URL');
  });

  it('throws on non-HTTP protocol', async () => {
    await expect(crawlUrl('ftp://example.com')).rejects.toThrow('Unsupported protocol');
  });

  it('throws on empty URL', async () => {
    await expect(crawlUrl('')).rejects.toThrow('url is required');
  });

  it('throws on fetch error', async () => {
    mockFetchError('Network error');
    await expect(crawlUrl('https://example.com')).rejects.toThrow('Crawl failed');
  });

  it('deduplicates links', async () => {
    mockFetch('<html><body><a href="/same">A</a><a href="/same">B</a></body></html>');
    const result = await crawlUrl('https://example.com');

    const sameLinks = result.links.filter((l) => l === 'https://example.com/same');
    expect(sameLinks).toHaveLength(1);
  });

  it('caps links at 50', async () => {
    const manyLinks = Array.from({ length: 100 }, (_, i) => `<a href="/page${i}">P${i}</a>`).join('');
    mockFetch(`<html><body>${manyLinks}</body></html>`);
    const result = await crawlUrl('https://example.com');

    expect(result.links.length).toBeLessThanOrEqual(50);
  });

  it('handles empty title', async () => {
    mockFetch('<html><body>No title tag</body></html>');
    const result = await crawlUrl('https://example.com');

    expect(result.title).toBe('');
  });
});

// ---------------------------------------------------------------------------
// webCrawlHandler Tests
// ---------------------------------------------------------------------------

describe('webCrawlHandler', () => {
  it('returns JSON result for valid URL', async () => {
    mockFetch('<html><head><title>Test</title></head><body>Content</body></html>');
    const result = await webCrawlHandler({ url: 'https://example.com' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content);
    expect(parsed.title).toBe('Test');
    expect(parsed.statusCode).toBe(200);
    expect(parsed.textContent).toContain('Content');
  });

  it('returns error for missing url', async () => {
    const result = await webCrawlHandler({});

    expect(result.isError).toBe(true);
    expect(result.content).toContain('url is required');
  });

  it('returns error for non-string url', async () => {
    const result = await webCrawlHandler({ url: 42 });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('url is required');
  });

  it('returns error on fetch failure', async () => {
    mockFetchError('Connection refused');
    const result = await webCrawlHandler({ url: 'https://example.com' });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Crawl error');
  });

  it('includes linkCount in response', async () => {
    mockFetch('<html><body><a href="/a">A</a><a href="/b">B</a></body></html>');
    const result = await webCrawlHandler({ url: 'https://example.com' });

    const parsed = JSON.parse(result.content);
    expect(parsed.linkCount).toBe(2);
  });
});
