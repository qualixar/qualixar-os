/**
 * Tests for Qualixar OS Help Chatbot
 *
 * Tests retrieval, prompt construction, and the main prepareHelpQuery entry point.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  retrieveHelpContext,
  buildHelpPrompt,
  prepareHelpQuery,
  HELP_CONVERSATION_ID,
  HELP_CONVERSATION_TITLE,
  type HelpSearchProvider,
} from '../../src/help/help-chatbot.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSearchProvider(
  results: readonly { layer: string; content: string }[] = [],
): HelpSearchProvider {
  return {
    search: vi.fn().mockResolvedValue(results),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Help Chatbot Constants', () => {
  it('has a well-known conversation ID', () => {
    expect(HELP_CONVERSATION_ID).toBe('qos-help-builtin');
  });

  it('has a well-known conversation title', () => {
    expect(HELP_CONVERSATION_TITLE).toBe('QOS Help');
  });
});

// ---------------------------------------------------------------------------
// retrieveHelpContext
// ---------------------------------------------------------------------------

describe('retrieveHelpContext', () => {
  it('returns chunks from search results', async () => {
    const provider = mockSearchProvider([
      { layer: 'semantic', content: 'How to install Qualixar OS' },
      { layer: 'semantic', content: 'Configuration guide' },
    ]);

    const chunks = await retrieveHelpContext(provider, 'install');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe('How to install Qualixar OS');
    expect(chunks[1].content).toBe('Configuration guide');
  });

  it('limits results to maxChunks', async () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      layer: 'semantic',
      content: `Chunk ${i}`,
    }));
    const provider = mockSearchProvider(results);

    const chunks = await retrieveHelpContext(provider, 'test', 3);
    expect(chunks).toHaveLength(3);
  });

  it('returns empty array when no results', async () => {
    const provider = mockSearchProvider([]);
    const chunks = await retrieveHelpContext(provider, 'unknown topic');
    expect(chunks).toEqual([]);
  });

  it('passes correct search options', async () => {
    const provider = mockSearchProvider([]);
    await retrieveHelpContext(provider, 'query', 7);

    expect(provider.search).toHaveBeenCalledWith('query', {
      layer: 'semantic',
      limit: 7,
    });
  });

  it('sets default source to docs', async () => {
    const provider = mockSearchProvider([
      { layer: 'semantic', content: 'Test content' },
    ]);

    const chunks = await retrieveHelpContext(provider, 'test');
    expect(chunks[0].source).toBe('docs');
  });
});

// ---------------------------------------------------------------------------
// buildHelpPrompt
// ---------------------------------------------------------------------------

describe('buildHelpPrompt', () => {
  it('includes context from chunks in the prompt', () => {
    const chunks = [
      { content: 'Install with npm install qualixar-os', source: 'getting-started.md' },
      { content: 'Run with qos start', source: 'commands.md' },
    ];

    const prompt = buildHelpPrompt(chunks);
    expect(prompt).toContain('[Source: getting-started.md]');
    expect(prompt).toContain('Install with npm install qualixar-os');
    expect(prompt).toContain('[Source: commands.md]');
    expect(prompt).toContain('Run with qos start');
    expect(prompt).toContain('---'); // separator between chunks
  });

  it('returns no-docs message when chunks are empty', () => {
    const prompt = buildHelpPrompt([]);
    expect(prompt).toContain('No relevant documentation found.');
  });

  it('includes the system prompt rules', () => {
    const prompt = buildHelpPrompt([{ content: 'test', source: 'test.md' }]);
    expect(prompt).toContain('Qualixar OS Help Assistant');
    expect(prompt).toContain('Answer ONLY from context');
    expect(prompt).toContain('Cite sources');
  });
});

// ---------------------------------------------------------------------------
// prepareHelpQuery
// ---------------------------------------------------------------------------

describe('prepareHelpQuery', () => {
  it('returns system prompt, sources, and chunk count', async () => {
    const provider = mockSearchProvider([
      { layer: 'semantic', content: 'Qualixar OS installation guide' },
      { layer: 'semantic', content: 'Advanced configuration' },
    ]);

    const result = await prepareHelpQuery(provider, 'how to install');
    expect(result.systemPrompt).toContain('Qualixar OS installation guide');
    expect(result.sources).toEqual(['docs']);
    expect(result.chunksFound).toBe(2);
  });

  it('uses default maxChunks of 5', async () => {
    const provider = mockSearchProvider([]);
    await prepareHelpQuery(provider, 'test');

    expect(provider.search).toHaveBeenCalledWith('test', {
      layer: 'semantic',
      limit: 5,
    });
  });

  it('respects tier-based chunk limits', async () => {
    const provider = mockSearchProvider([]);
    // 'small' tier uses 2 chunks, 'large' uses 5
    await prepareHelpQuery(provider, 'test', { tier: 'small' });

    expect(provider.search).toHaveBeenCalledWith('test', {
      layer: 'semantic',
      limit: 2,
    });
  });

  it('deduplicates sources', async () => {
    const provider = mockSearchProvider([
      { layer: 'semantic', content: 'Part 1' },
      { layer: 'semantic', content: 'Part 2' },
    ]);

    const result = await prepareHelpQuery(provider, 'test');
    // Both map to 'docs' default source, should be deduplicated
    expect(result.sources).toEqual(['docs']);
  });

  it('returns no-docs prompt when search returns nothing', async () => {
    const provider = mockSearchProvider([]);
    const result = await prepareHelpQuery(provider, 'nonexistent topic');

    expect(result.systemPrompt).toContain('No relevant documentation found.');
    expect(result.sources).toEqual([]);
    expect(result.chunksFound).toBe(0);
  });
});
