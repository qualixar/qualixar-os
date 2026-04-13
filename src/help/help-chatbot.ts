// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Help Chatbot (RAG-enhanced)
 *
 * Retrieval-augmented generation handler for the pinned "QOS Help"
 * conversation. Searches memory for relevant doc chunks, builds a
 * system prompt with context, and returns it for the caller to pass
 * to the LLM.
 *
 * Uses a minimal HelpSearchProvider interface so it works with both
 * MemoryStore.recall() and OrchestratorSLMLite.search().
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Tier 1: Full prompt for 7B+ models — complex instructions, citations, code examples
const PROMPT_TIER_LARGE = `You are the Qualixar OS Help Assistant. Answer using ONLY the context below.

RULES:
1. Answer ONLY from context. Never make up information.
2. If not in context: "I don't have docs on this. Check /docs or open a GitHub issue."
3. Cite sources as links: [Provider Setup](/docs/providers/overview.md)
4. Be concise. Use bullet points.
5. Include code examples (YAML, CLI, curl) when relevant.
6. For greetings: "Hi! Ask me about providers, topologies, API endpoints, events, cost, or the dashboard."

CONTEXT:
{context}`;

// Tier 2: Simplified prompt for small models (<7B) — minimal instructions, just summarize
const PROMPT_TIER_SMALL = `Answer the question using ONLY the information below. Be brief and helpful. If the answer is not below, say "Check the docs at /docs".

{context}`;

export type HelpTier = 'large' | 'small' | 'none';

/** Well-known conversation ID for the pinned help chat */
export const HELP_CONVERSATION_ID = 'qos-help-builtin';
export const HELP_CONVERSATION_TITLE = 'QOS Help';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal search interface — works with MemoryStore or SLMLite */
export interface HelpSearchProvider {
  readonly search: (
    query: string,
    options?: { readonly layer?: string; readonly limit?: number },
  ) => Promise<
    readonly {
      readonly layer: string;
      readonly content: string;
    }[]
  >;
}

export interface HelpChatOptions {
  readonly model?: string;
  readonly maxChunks?: number;
  readonly minRelevance?: number;
}

export interface HelpChunk {
  readonly content: string;
  readonly source: string;
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant documentation chunks for a query.
 * Searches the semantic layer and returns top matches.
 *
 * Note: The SLMLite search interface returns { layer, content } without
 * metadata. Help doc chunks are identifiable by their presence in the
 * semantic layer and FTS5 keyword matching on the query.
 */
/**
 * FTS5 stop words that should be removed from queries.
 * FTS5 uses implicit AND by default — stop words cause zero results.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does',
  'for', 'from', 'get', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it',
  'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'set', 'so', 'the',
  'to', 'up', 'was', 'we', 'what', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'you', 'your',
]);

/**
 * Extract meaningful keywords from a natural language query.
 */
function extractKeywords(query: string): readonly string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Convert keywords to FTS5 AND query (most precise).
 */
function toFtsAnd(words: readonly string[]): string {
  return words.join(' ');
}

/**
 * Convert keywords to FTS5 OR query (broader recall).
 */
function toFtsOr(words: readonly string[]): string {
  return words.join(' OR ');
}

export async function retrieveHelpContext(
  provider: HelpSearchProvider,
  query: string,
  maxChunks = 5,
): Promise<readonly HelpChunk[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  // Strategy: AND first (precise), fall back to OR (broad) if no results
  const andQuery = toFtsAnd(keywords);
  let results = await provider.search(andQuery, {
    layer: 'semantic',
    limit: maxChunks,
  });

  if (results.length === 0) {
    const orQuery = toFtsOr(keywords);
    results = await provider.search(orQuery, {
      layer: 'semantic',
      limit: maxChunks,
    });
  }

  return results.slice(0, maxChunks).map((r) => ({
    content: r.content,
    source: 'docs',
    score: 0,
  }));
}

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

/**
 * Build the system prompt adapted to the model's capability tier.
 *
 * Tier 1 (large 7B+): Full prompt with rules, citations, code examples
 * Tier 2 (small <7B): Minimal prompt, just context, simple instruction
 * Tier 3 (none): Returns formatted doc content directly (no LLM needed)
 */
export function buildHelpPrompt(
  chunks: readonly { readonly content: string; readonly source: string }[],
  tier: HelpTier = 'large',
): string {
  if (chunks.length === 0) {
    return tier === 'none'
      ? 'No matching documentation found. Browse the docs at /docs or open a GitHub issue.'
      : (tier === 'large' ? PROMPT_TIER_LARGE : PROMPT_TIER_SMALL).replace('{context}', 'No relevant documentation found.');
  }

  const context = chunks
    .map((c) => `[Source: ${c.source}]\n${c.content}`)
    .join('\n\n---\n\n');

  if (tier === 'none') {
    // Tier 3: No LLM — return docs directly as formatted text
    return `Here's what we found in the documentation:

${context}

For more details, browse /docs or check the dashboard tabs.`;
  }

  const template = tier === 'large' ? PROMPT_TIER_LARGE : PROMPT_TIER_SMALL;
  return template.replace('{context}', context);
}

/**
 * Build a direct response for Tier 3 (no LLM available).
 * Returns formatted doc content that can be shown directly in chat.
 */
export function buildDirectResponse(
  chunks: readonly { readonly content: string; readonly source: string }[],
): string {
  if (chunks.length === 0) {
    return "I couldn't find matching documentation. Browse the docs at [/docs](/docs/getting-started.md) or check the dashboard Settings tab.";
  }

  const formatted = chunks
    .slice(0, 3)
    .map((c) => c.content.slice(0, 500))
    .join('\n\n---\n\n');

  return `Here's what I found:

${formatted}

For more details, check [the full docs](/docs/getting-started.md).`;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Prepare a help query using LightRAG-inspired hybrid retrieval.
 *
 * Three retrieval levels merged with score-based ranking:
 *   Level 1 (Naive): FTS5 keyword search on docs + code-intel chunks
 *   Level 2 (Local): Entity-focused graph neighborhood from code-review-graph
 *   Level 3 (Global): Community-level knowledge from code-review-graph
 *
 * The caller is responsible for actually calling the LLM with the built prompt.
 */
export async function prepareHelpQuery(
  provider: HelpSearchProvider,
  userQuery: string,
  options?: HelpChatOptions & {
    readonly graphRetriever?: GraphRetrieverLike | null;
    readonly tier?: HelpTier;
  },
): Promise<{
  readonly systemPrompt: string;
  readonly directResponse: string | null;
  readonly sources: readonly string[];
  readonly chunksFound: number;
  readonly retrievalLevels: readonly string[];
  readonly tier: HelpTier;
}> {
  const tier = options?.tier ?? 'large';
  const levelsUsed: string[] = [];

  // Adjust retrieval depth based on tier
  const maxChunks = tier === 'large' ? 5 : tier === 'small' ? 2 : 3;

  // Level 1: Naive — FTS5 keyword search (all tiers)
  const ftsChunks = await retrieveHelpContext(provider, userQuery, maxChunks);
  if (ftsChunks.length > 0) levelsUsed.push('naive');

  // Level 2+3: Graph retrieval — only for 'large' tier (small models can't use code context well)
  let graphChunks: readonly HelpChunk[] = [];
  if (tier === 'large' && options?.graphRetriever) {
    const gr = options.graphRetriever;
    const localResults = gr.searchLocal(userQuery, 2);
    const globalResults = gr.searchGlobal(userQuery, 1);
    graphChunks = [...localResults, ...globalResults].map((c) => ({
      content: c.content,
      source: c.source,
      score: c.score,
    }));
    if (localResults.length > 0) levelsUsed.push('local');
    if (globalResults.length > 0) levelsUsed.push('global');
  }

  // Merge: Docs first (0.9), then graph (scaled down)
  const allChunks: HelpChunk[] = [
    ...ftsChunks.map((c) => ({ ...c, score: 0.9 })),
    ...graphChunks.map((c) => ({ ...c, score: c.score * 0.6 })),
  ];

  // Deduplicate
  const unique: HelpChunk[] = [];
  const seen = new Set<string>();
  for (const chunk of allChunks.sort((a, b) => b.score - a.score)) {
    const key = chunk.content.slice(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(chunk);
    }
  }

  const topChunks = unique.slice(0, maxChunks);
  const sources = [...new Set(topChunks.map((c) => c.source))];

  // Tier 3 (no model): build direct response, no LLM call needed
  if (tier === 'none') {
    return {
      systemPrompt: '',
      directResponse: buildDirectResponse(topChunks),
      sources,
      chunksFound: topChunks.length,
      retrievalLevels: levelsUsed,
      tier,
    };
  }

  // Tier 1 or 2: build system prompt adapted to model capability
  const systemPrompt = buildHelpPrompt(topChunks, tier);

  return {
    systemPrompt,
    directResponse: null,
    sources,
    chunksFound: topChunks.length,
    retrievalLevels: levelsUsed,
    tier,
  };
}

/** Minimal interface for graph retriever (avoids circular import) */
export interface GraphRetrieverLike {
  readonly searchLocal: (query: string, limit?: number) => readonly { content: string; source: string; score: number; level: string }[];
  readonly searchGlobal: (query: string, limit?: number) => readonly { content: string; source: string; score: number; level: string }[];
}
