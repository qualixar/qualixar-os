// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Web Crawler Tool
 *
 * Lightweight URL crawling: fetch a page, strip HTML to extract
 * text content, title, and links. No heavy dependencies.
 */

import type { ToolResult } from './tool-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlResult {
  readonly title: string;
  readonly textContent: string;
  readonly links: readonly string[];
  readonly url: string;
  readonly statusCode: number;
}

// ---------------------------------------------------------------------------
// HTML Stripping (simple regex, no external deps)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractLinks(html: string, baseUrl: string): readonly string[] {
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    // Skip anchors, javascript:, mailto:
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      continue;
    }
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      if (!links.includes(absoluteUrl)) {
        links.push(absoluteUrl);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return links.slice(0, 50); // Cap at 50 links
}

// ---------------------------------------------------------------------------
// Crawl Implementation
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 5000;
const CRAWL_TIMEOUT_MS = 15_000;

export async function crawlUrl(url: string): Promise<CrawlResult> {
  if (!url || typeof url !== 'string') {
    throw new Error('url is required and must be a string');
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!parsedUrl.protocol.startsWith('http')) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Qualixar OS/2.0 WebCrawler',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const html = await response.text();
    const title = extractTitle(html);
    const textContent = stripHtml(html).slice(0, MAX_CONTENT_LENGTH);
    const links = extractLinks(html, url);

    return {
      title,
      textContent,
      links,
      url: response.url, // Final URL after redirects
      statusCode: response.status,
    };
  } catch (error: unknown) {
    clearTimeout(timeout);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort')) {
      throw new Error(`Crawl timed out after ${CRAWL_TIMEOUT_MS}ms`);
    }
    throw new Error(`Crawl failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Tool Handler (for ToolRegistry)
// ---------------------------------------------------------------------------

export async function webCrawlHandler(input: Record<string, unknown>): Promise<ToolResult> {
  const url = input.url as string | undefined;

  if (!url || typeof url !== 'string') {
    return { content: 'Error: url is required and must be a string', isError: true };
  }

  try {
    const result = await crawlUrl(url);
    return {
      content: JSON.stringify({
        title: result.title,
        url: result.url,
        statusCode: result.statusCode,
        textContent: result.textContent,
        linkCount: result.links.length,
        links: result.links.slice(0, 10),
      }, null, 2),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: `Crawl error: ${msg}`, isError: true };
  }
}
