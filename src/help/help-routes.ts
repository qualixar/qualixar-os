// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Help Chatbot HTTP Routes
 *
 * Registers /api/help/* endpoints on the Hono app:
 * - POST /api/help/ask -- RAG retrieval + prompt construction
 * - GET  /api/help/status -- ingestion status
 */

import type { Hono } from 'hono';
import {
  prepareHelpQuery,
  HELP_CONVERSATION_ID,
  HELP_CONVERSATION_TITLE,
  type HelpSearchProvider,
  type GraphRetrieverLike,
  type HelpTier,
} from './help-chatbot.js';
import { detectAvailableModels, getModelTier } from '../config/model-fallback.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HelpRouteState {
  docsIngested: boolean;
  fileCount: number;
  chunkCount: number;
  codeIntelIngested: boolean;
  codeIntelChunks: number;
  codeIntelCategories: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerHelpRoutes(
  app: Hono,
  searchProvider: HelpSearchProvider,
  state: HelpRouteState,
  graphRetriever?: GraphRetrieverLike | null,
): void {
  app.post('/api/help/ask', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const question = body.question;
    if (typeof question !== 'string' || question.trim().length === 0) {
      return c.json({ ok: false, error: 'question is required' }, 400);
    }

    // Auto-detect model tier for adaptive response
    const fallback = await detectAvailableModels();
    const hasCloudKey = Boolean(
      process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
      || process.env.AZURE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY,
    );
    const tier: HelpTier = hasCloudKey ? 'large' : fallback.tier === 'large' ? 'large' : fallback.tier === 'small' ? 'small' : 'none';

    const result = await prepareHelpQuery(searchProvider, question.trim(), {
      model: typeof body.model === 'string' ? body.model : undefined,
      graphRetriever: graphRetriever ?? null,
      tier,
    });

    return c.json({
      ok: true,
      conversationId: HELP_CONVERSATION_ID,
      ...result,
    });
  });

  app.get('/api/help/status', (c) => {
    return c.json({
      ok: true,
      docsIngested: state.docsIngested,
      fileCount: state.fileCount,
      chunkCount: state.chunkCount,
      codeIntelIngested: state.codeIntelIngested,
      codeIntelChunks: state.codeIntelChunks,
      codeIntelCategories: state.codeIntelCategories,
      helpConversationId: HELP_CONVERSATION_ID,
      helpConversationTitle: HELP_CONVERSATION_TITLE,
    });
  });
}
