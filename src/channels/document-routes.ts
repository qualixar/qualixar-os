// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Document Ingestion API Routes
 *
 * POST /api/documents/ingest — ingest a file or raw text
 * GET  /api/documents — list ingested documents
 */

import type { Hono } from 'hono';
import type { Orchestrator } from '../engine/orchestrator.js';
import { createDocumentIngester } from '../memory/document-ingester.js';
import { createEmbeddingProvider } from '../memory/embeddings.js';

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerDocumentRoutes(app: Hono, orchestrator: Orchestrator): void {
  const embeddingProvider = createEmbeddingProvider();
  const ingester = createDocumentIngester(orchestrator.slmLite as unknown as import('../memory/store.js').MemoryStore, embeddingProvider);

  // POST /api/documents/ingest
  app.post('/api/documents/ingest', async (c) => {
    try {
      const body = await c.req.json();
      const filePath = body.filePath as string | undefined;
      const textContent = body.content as string | undefined;
      const fileName = (body.fileName as string) ?? 'inline-document.txt';

      if (!filePath && !textContent) {
        return c.json({ error: 'Either filePath or content is required' }, 400);
      }

      const options = {
        chunkSize: (body.chunkSize as number) ?? undefined,
        chunkOverlap: (body.chunkOverlap as number) ?? undefined,
        layer: (body.layer as 'episodic' | 'semantic' | 'procedural') ?? undefined,
        metadata: (body.metadata as Record<string, unknown>) ?? undefined,
      };

      let result;
      if (filePath) {
        result = await ingester.ingestDocument(filePath, options);
      } else {
        result = await ingester.ingestContent(textContent!, fileName, 'inline', options);
      }

      return c.json({
        success: true,
        document: {
          fileName: result.fileName,
          chunkCount: result.chunkCount,
          totalChars: result.totalChars,
          estimatedTokens: result.estimatedTokens,
          entryIds: result.entryIds,
        },
      }, 201);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json({ error: msg }, 400);
    }
  });

  // GET /api/documents
  app.get('/api/documents', (c) => {
    try {
      const rows = orchestrator.db.query<Record<string, unknown>>(
        `SELECT DISTINCT
           json_extract(metadata, '$.documentName') as name,
           json_extract(metadata, '$.documentSource') as source,
           COUNT(*) as chunkCount,
           MIN(created_at) as ingestedAt
         FROM memory_entries
         WHERE json_extract(metadata, '$.ingested') = 1
         GROUP BY json_extract(metadata, '$.documentSource')
         ORDER BY MIN(created_at) DESC
         LIMIT 100`,
        [],
      );

      const documents = rows.map((r) => ({
        name: r.name ?? 'Unknown',
        source: r.source ?? 'Unknown',
        chunkCount: r.chunkCount ?? 0,
        ingestedAt: r.ingestedAt,
      }));

      return c.json({ documents });
    } catch {
      // Table may not have ingested documents yet
      return c.json({ documents: [] });
    }
  });
}
