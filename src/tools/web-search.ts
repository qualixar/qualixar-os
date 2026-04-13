// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Session 15 -- Web Search Tool (C-15)
 *
 * Tavily API integration for web search capability.
 * Uses fetch() directly — no SDK needed.
 *
 * Graceful degradation: returns an error result if
 * TAVILY_API_KEY is not configured.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly score?: number;
}

export interface WebSearchOptions {
  readonly maxResults?: number;
  readonly searchDepth?: 'basic' | 'advanced';
}

// ---------------------------------------------------------------------------
// Tavily API Types
// ---------------------------------------------------------------------------

interface TavilyResponse {
  readonly results: readonly TavilyResult[];
}

interface TavilyResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Perform a web search using the Tavily API.
 * Returns an array of SearchResult objects.
 * Returns an error result if no API key is configured.
 */
export async function webSearch(
  query: string,
  options?: WebSearchOptions,
): Promise<readonly SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return [{
      title: 'Error',
      url: '',
      snippet: 'TAVILY_API_KEY not configured. Web search unavailable.',
    }];
  }

  if (!query.trim()) {
    return [];
  }

  const maxResults = options?.maxResults ?? 5;
  const searchDepth = options?.searchDepth ?? 'basic';

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return [{
        title: 'Error',
        url: '',
        snippet: `Tavily API error (${response.status}): ${errorText}`,
      }];
    }

    const data = (await response.json()) as TavilyResponse;

    return (data.results ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
      score: r.score,
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [{
      title: 'Error',
      url: '',
      snippet: `Web search failed: ${msg}`,
    }];
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo Instant Answer API (free, no key needed)
// ---------------------------------------------------------------------------

interface DuckDuckGoResponse {
  readonly Abstract?: string;
  readonly AbstractSource?: string;
  readonly AbstractURL?: string;
  readonly Heading?: string;
  readonly RelatedTopics?: readonly DuckDuckGoTopic[];
}

interface DuckDuckGoTopic {
  readonly Text?: string;
  readonly FirstURL?: string;
  readonly Result?: string;
}

const DUCKDUCKGO_API_URL = 'https://api.duckduckgo.com/';

/**
 * Search using DuckDuckGo Instant Answer API.
 * Free, no API key required. Returns abstract + related topics.
 */
export async function duckDuckGoSearch(
  query: string,
  options?: WebSearchOptions,
): Promise<readonly SearchResult[]> {
  if (!query.trim()) return [];

  const maxResults = options?.maxResults ?? 5;
  const encodedQuery = encodeURIComponent(query);

  try {
    const response = await fetch(
      `${DUCKDUCKGO_API_URL}?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      },
    );

    if (!response.ok) {
      return [{
        title: 'Error',
        url: '',
        snippet: `DuckDuckGo API error (${response.status})`,
      }];
    }

    const data = (await response.json()) as DuckDuckGoResponse;
    const results: SearchResult[] = [];

    // Add abstract if available
    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.Heading ?? 'Result',
        url: data.AbstractURL,
        snippet: data.Abstract,
      });
    }

    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.slice(0, 80),
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }
    }

    if (results.length === 0) {
      return [{
        title: 'No results',
        url: '',
        snippet: `DuckDuckGo found no instant answers for: ${query}`,
      }];
    }

    return results.slice(0, maxResults);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [{
      title: 'Error',
      url: '',
      snippet: `DuckDuckGo search failed: ${msg}`,
    }];
  }
}

/**
 * Check if Tavily web search is available (API key configured).
 */
export function isWebSearchAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * Check if any web search provider is available (Tavily or DuckDuckGo).
 * DuckDuckGo is always available (free, no key needed).
 */
export function isAnySearchAvailable(): boolean {
  return true;
}

/**
 * Check if Tavily (premium) search is available.
 */
export function isTavilyAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}
