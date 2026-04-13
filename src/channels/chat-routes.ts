// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Chat Routes — extracted from http-server.ts
 *
 * All /api/chat/* and /api/files/* endpoints.
 * Includes streaming chat with Ollama local-first, model router fallback,
 * token chunking, budget gate, and cancellation support.
 */

import type { Hono } from 'hono';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Orchestrator } from '../engine/orchestrator.js';
import { createLogger } from '../utils/logger.js';
import { InferenceGuardImpl } from '../security/inference-guard.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'ChatRoutes' });

// C-03 FIX: Stateless PII sanitizer for LLM output
const inferenceGuard = new InferenceGuardImpl();

// ---------------------------------------------------------------------------
// Active Chat Streams (for cancellation support)
// C-04 FIX: Key by unique message ID (assistantMsgId), not convId.
// Two concurrent messages to the same conversation no longer overwrite each other.
// Maintain a secondary index from convId → Set<msgId> for the cancel endpoint.
// ---------------------------------------------------------------------------
const activeStreams = new Map<string, Readonly<{ cancelled: boolean }>>();
const convIdToMsgIds = new Map<string, Set<string>>();

function trackStream(convId: string, msgId: string): void {
  activeStreams.set(msgId, Object.freeze({ cancelled: false }));
  let set = convIdToMsgIds.get(convId);
  if (!set) {
    set = new Set();
    convIdToMsgIds.set(convId, set);
  }
  set.add(msgId);
}

function untrackStream(convId: string, msgId: string): void {
  activeStreams.delete(msgId);
  const set = convIdToMsgIds.get(convId);
  if (set) {
    set.delete(msgId);
    if (set.size === 0) convIdToMsgIds.delete(convId);
  }
}

// ---------------------------------------------------------------------------
// Chat Message Validation
// ---------------------------------------------------------------------------
const ChatMessageSchema = z.object({
  content: z.string().min(1),
  model: z.string().optional(),
  systemPromptOverride: z.string().optional(),
  preferLocal: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Upload Rate Limiting (DEF-037)
// ---------------------------------------------------------------------------
const uploadRateMap = new Map<string, { count: number; resetAt: number }>();
const UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const UPLOAD_RATE_LIMIT = 10;
const UPLOAD_RATE_WINDOW_MS = 60_000;

// H-02 FIX: Periodic cleanup of expired uploadRateMap entries to prevent memory leak.
// Same pattern as the main rate limiter in http-server.ts:212.
const uploadRateCleanupInterval = setInterval(() => {
  const nowMs = Date.now();
  for (const [ip, entry] of uploadRateMap) {
    if (entry.resetAt < nowMs) {
      uploadRateMap.delete(ip);
    }
  }
}, 60_000);
uploadRateCleanupInterval.unref(); // Don't prevent process exit

// ---------------------------------------------------------------------------
// Register Chat Routes
// ---------------------------------------------------------------------------
export function registerChatRoutes(app: Hono, orchestrator: Orchestrator): void {

  app.get('/api/chat/conversations', (c) => {
    const convs = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50',
      [],
    );
    const conversations = convs.map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? 'Untitled',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      messageCount: (r.message_count as number) ?? 0,
      status: (r.status as string) ?? 'active',
      model: r.model as string | undefined,
      topology: r.topology as string | undefined,
      parentId: r.parent_id as string | undefined,
    }));
    return c.json({ conversations });
  });

  // GET single conversation by ID
  app.get('/api/chat/conversations/:id', (c) => {
    const convId = c.req.param('id');
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM conversations WHERE id = ?',
      [convId],
    );
    if (rows.length === 0) return c.json({ error: 'Conversation not found' }, 404);
    const r = rows[0];
    return c.json({
      id: r.id as string,
      title: (r.title as string) ?? 'Untitled',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      messageCount: (r.message_count as number) ?? 0,
      status: (r.status as string) ?? 'active',
      model: r.model as string | undefined,
      topology: r.topology as string | undefined,
      parentId: r.parent_id as string | undefined,
    });
  });

  app.post('/api/chat/conversations', async (c) => {
    try {
      const body = await c.req.json();
      const id = randomUUID();
      if (body.title !== undefined && body.title !== null) {
        if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 200) {
          return c.json({ error: 'title must be a string between 1 and 200 characters' }, 400);
        }
      }
      const title = (typeof body.title === 'string' && body.title.length > 0 ? body.title : 'New Chat');
      const now = new Date().toISOString();
      orchestrator.db.insert('conversations', {
        id,
        title,
        status: 'active',
        message_count: 0,
        created_at: now,
        updated_at: now,
      });
      return c.json({
        conversation: { id, title, createdAt: now, updatedAt: now, messageCount: 0, status: 'active' },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/chat/conversations/:id/messages', (c) => {
    const convId = c.req.param('id');
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 200',
      [convId],
    );
    const messages = rows.map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      role: r.role as string,
      parts: JSON.parse((r.parts as string) ?? '[]'),
      status: (r.status as string) ?? 'completed',
      timestamp: r.timestamp as string,
      model: r.model as string | undefined,
      cost: r.cost as number | undefined,
      inputTokens: r.input_tokens as number | undefined,
      outputTokens: r.output_tokens as number | undefined,
      latencyMs: r.latency_ms as number | undefined,
    }));
    return c.json({ messages });
  });

  app.post('/api/chat/conversations/:id/messages', async (c) => {
    try {
      const convId = c.req.param('id');
      const body = await c.req.json();
      // DEF-018: Zod validation for chat messages
      const chatParsed = ChatMessageSchema.safeParse(body);
      if (!chatParsed.success) {
        return c.json({ error: 'Invalid input', details: chatParsed.error.issues }, 400);
      }
      const content = chatParsed.data.content;
      const requestedModel = chatParsed.data.model ?? undefined;
      const systemPromptOverride = (body.systemPromptOverride as string) ?? undefined;
      const preferLocal = Boolean(chatParsed.data.preferLocal);
      const userMsgId = randomUUID();
      const assistantMsgId = randomUUID();
      const now = new Date().toISOString();

      // Store user message immediately
      orchestrator.db.insert('chat_messages', {
        id: userMsgId,
        conversation_id: convId,
        role: 'user',
        parts: JSON.stringify([{ type: 'text', text: content }]),
        status: 'completed',
        timestamp: now,
      });

      // Update conversation message count
      orchestrator.db.db
        .prepare('UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?')
        .run(now, convId);

      // Emit stream_started IMMEDIATELY via EventBus → WebSocket
      orchestrator.eventBus.emit({
        type: 'chat:stream_started',
        payload: { conversationId: convId, messageId: assistantMsgId },
        source: 'chat',
      });

      // Track this stream for cancellation support (keyed by assistantMsgId — C-04)
      trackStream(convId, assistantMsgId);

      // Run AI in BACKGROUND (don't await — return HTTP response immediately)
      // This is the Open WebUI / LibreChat pattern: fire-and-forget with WS events
      void (async () => {
        try {
          // Emit thinking state
          orchestrator.eventBus.emit({
            type: 'chat:thinking_started',
            payload: { conversationId: convId, messageId: assistantMsgId },
            source: 'chat',
          });

          const startTime = Date.now();

          // H-17: Budget gate — check before making the LLM call
          const chatBudget = orchestrator.budgetChecker.check('__chat__', 0.05);
          if (!chatBudget.allowed) {
            orchestrator.db.insert('chat_messages', {
              id: assistantMsgId,
              conversation_id: convId,
              role: 'assistant',
              parts: JSON.stringify([{ type: 'text', text: 'Budget exceeded. Please check your budget settings.' }]),
              status: 'completed',
              timestamp: new Date().toISOString(),
            });
            orchestrator.eventBus.emit({
              type: 'chat:message_completed',
              payload: { conversationId: convId, messageId: assistantMsgId, budgetBlocked: true },
              source: 'chat',
            });
            untrackStream(convId, assistantMsgId);
            return;
          }

          // Resolve system prompt: override > env > default
          const chatSystemPrompt = systemPromptOverride
            ?? process.env.QOS_CHAT_SYSTEM_PROMPT
            ?? 'You are Qualixar OS, a helpful AI assistant. Be concise and helpful.';

          // preferLocal: try direct Ollama call before cloud
          let modelResponse: Awaited<ReturnType<typeof orchestrator.modelRouter.route>> | null = null;

          if (preferLocal) {
            try {
              const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
              const ollamaRes = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: requestedModel ?? 'llama3',
                  messages: [
                    { role: 'system', content: chatSystemPrompt },
                    { role: 'user', content },
                  ],
                  stream: false,
                }),
                signal: AbortSignal.timeout(120_000),
              });
              if (ollamaRes.ok) {
                const ollamaData = (await ollamaRes.json()) as {
                  message: { content: string };
                  prompt_eval_count?: number;
                  eval_count?: number;
                };
                modelResponse = {
                  content: ollamaData.message.content,
                  model: requestedModel ?? 'llama3',
                  provider: 'ollama',
                  inputTokens: ollamaData.prompt_eval_count ?? 0,
                  outputTokens: ollamaData.eval_count ?? 0,
                  costUsd: 0,
                  latencyMs: Date.now() - startTime,
                };
              }
            } catch {
              // Local unavailable, fall through to cloud
            }
          }

          // Model fallback chain: cloud router (may also fallback internally)
          if (!modelResponse) {
            try {
              modelResponse = await orchestrator.modelRouter.route({
                prompt: content,
                systemPrompt: chatSystemPrompt,
                model: requestedModel,
                taskType: 'chat',
                quality: 'high',
              });
            } catch (routeErr) {
              // Log the actual error for diagnosis
              logger.error({ err: routeErr instanceof Error ? routeErr.message : String(routeErr) }, 'chat model routing failed');
              // No model available at all — return setup instructions with actual error
              const errDetail = routeErr instanceof Error ? routeErr.message : String(routeErr);
              modelResponse = {
                content: `Model routing error: ${errDetail}. Check your provider configuration in Settings.`,
                model: 'none',
                provider: 'none',
                inputTokens: 0,
                outputTokens: 0,
                costUsd: 0,
                latencyMs: Date.now() - startTime,
              };
            }
          }
          const latencyMs = Date.now() - startTime;

          // Check cancellation after model call (keyed by assistantMsgId — C-04)
          if (activeStreams.get(assistantMsgId)?.cancelled) {
            untrackStream(convId, assistantMsgId);
            orchestrator.eventBus.emit({
              type: 'chat:message_completed',
              payload: { conversationId: convId, messageId: assistantMsgId, cancelled: true },
              source: 'chat',
            });
            return;
          }

          // Emit thinking ended
          orchestrator.eventBus.emit({
            type: 'chat:thinking_ended',
            payload: { conversationId: convId, messageId: assistantMsgId, durationMs: latencyMs },
            source: 'chat',
          });

          // C-16: Emit the full response as token stream.
          // Real SDK streaming is handled when streamingCall is available
          // and the model response came through. For now, emit the content
          // in natural-sized chunks (no artificial delay).
          // C-03 FIX: Sanitize PII from LLM output before storing/streaming
          const output = inferenceGuard.sanitizeOutput(modelResponse.content ?? '');
          const chunkSize = 40; // characters per chunk for smooth streaming
          for (let i = 0; i < output.length; i += chunkSize) {
            if (activeStreams.get(assistantMsgId)?.cancelled) break;
            const chunk = output.slice(i, i + chunkSize);
            orchestrator.eventBus.emit({
              type: 'chat:token',
              payload: { conversationId: convId, messageId: assistantMsgId, text: chunk },
              source: 'chat',
            });
          }

          // Determine final content (may be partial if cancelled)
          const wasCancelled = activeStreams.get(assistantMsgId)?.cancelled;
          const finalOutput = wasCancelled ? output.slice(0, Math.ceil(output.length * 0.5)) : output;

          // Store assistant message in DB
          const assistantNow = new Date().toISOString();
          orchestrator.db.insert('chat_messages', {
            id: assistantMsgId,
            conversation_id: convId,
            role: 'assistant',
            parts: JSON.stringify([{ type: 'text', text: finalOutput }]),
            status: wasCancelled ? 'cancelled' : 'completed',
            model: modelResponse.model ?? null,
            cost: modelResponse.costUsd ?? 0,
            input_tokens: modelResponse.inputTokens ?? null,
            output_tokens: modelResponse.outputTokens ?? null,
            latency_ms: latencyMs,
            timestamp: assistantNow,
          });

          orchestrator.db.db
            .prepare('UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?')
            .run(assistantNow, convId);

          // Emit completion event with metadata (including tokens for live UI)
          orchestrator.eventBus.emit({
            type: 'chat:message_completed',
            payload: {
              conversationId: convId,
              messageId: assistantMsgId,
              model: modelResponse.model ?? undefined,
              cost: modelResponse.costUsd ?? undefined,
              inputTokens: modelResponse.inputTokens ?? undefined,
              outputTokens: modelResponse.outputTokens ?? undefined,
              latencyMs,
              cancelled: wasCancelled,
            },
            source: 'chat',
          });
          untrackStream(convId, assistantMsgId);
        } catch (err) {
          // Task execution failed -- log and store error
          logger.error({ err }, 'chat task execution failed');
          const errMsg = err instanceof Error ? err.message : String(err);
          orchestrator.db.insert('chat_messages', {
            id: assistantMsgId,
            conversation_id: convId,
            role: 'assistant',
            parts: JSON.stringify([{ type: 'error', message: errMsg }]),
            status: 'error',
            timestamp: new Date().toISOString(),
          });

          orchestrator.eventBus.emit({
            type: 'chat:message_completed',
            payload: { conversationId: convId, messageId: assistantMsgId, error: errMsg },
            source: 'chat',
          });
          untrackStream(convId, assistantMsgId);
        }
      })();

      // Return IMMEDIATELY — don't wait for AI response
      return c.json({ ok: true, messageId: userMsgId, assistantMessageId: assistantMsgId });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // Cancel active stream(s) for a conversation (C-04: iterate all msgIds for convId)
  app.post('/api/chat/conversations/:id/cancel', (c) => {
    const convId = c.req.param('id');
    const msgIds = convIdToMsgIds.get(convId);
    if (msgIds && msgIds.size > 0) {
      for (const msgId of msgIds) {
        activeStreams.set(msgId, Object.freeze({ cancelled: true }));
      }
      return c.json({ ok: true, cancelled: true, streamsCancelled: msgIds.size });
    }
    return c.json({ ok: true, cancelled: false, reason: 'no_active_stream' });
  });

  app.put('/api/chat/conversations/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      if (body.title) {
        if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 200) {
          return c.json({ error: 'title must be a string between 1 and 200 characters' }, 400);
        }
        const result = orchestrator.db.db.prepare(
          'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
        ).run(body.title, new Date().toISOString(), id);
        if (result.changes === 0) {
          return c.json({ error: 'Conversation not found' }, 404);
        }
      } else {
        // No update fields — verify conversation exists
        const exists = orchestrator.db.get<{ id: string }>('SELECT id FROM conversations WHERE id = ?', [id]);
        if (!exists) {
          return c.json({ error: 'Conversation not found' }, 404);
        }
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/chat/conversations/:id', (c) => {
    const id = c.req.param('id');
    // Check existence first
    const exists = orchestrator.db.get<{ id: string }>('SELECT id FROM conversations WHERE id = ?', [id]);
    if (!exists) {
      return c.json({ error: 'Conversation not found' }, 404);
    }
    orchestrator.db.db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(id);
    orchestrator.db.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return c.json({ ok: true });
  });

  app.post('/api/chat/conversations/:id/clone', (c) => {
    const sourceId = c.req.param('id');
    const newId = randomUUID();
    const now = new Date().toISOString();

    // Get source conversation
    const source = orchestrator.db.get<Record<string, unknown>>(
      'SELECT * FROM conversations WHERE id = ?',
      [sourceId],
    );
    if (!source) return c.json({ error: 'Conversation not found' }, 404);

    // Create cloned conversation
    orchestrator.db.insert('conversations', {
      id: newId,
      title: `${source.title} (Branch)`,
      status: 'active',
      message_count: source.message_count,
      parent_id: sourceId,
      created_at: now,
      updated_at: now,
    });

    // Copy all messages from source
    const msgs = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM chat_messages WHERE conversation_id = ?',
      [sourceId],
    );
    for (const msg of msgs) {
      orchestrator.db.insert('chat_messages', {
        id: randomUUID(),
        conversation_id: newId,
        role: msg.role,
        parts: msg.parts,
        status: msg.status,
        model: msg.model,
        cost: msg.cost,
        timestamp: msg.timestamp,
      });
    }

    return c.json({
      conversation: { id: newId, title: `${source.title} (Branch)`, parentId: sourceId },
    });
  });

  // ---- File Upload + Serve ----

  // DEF-037: Upload rate limiting (max 10 uploads per IP per minute)

  app.post('/api/chat/conversations/:id/files', async (c) => {
    try {
      // DEF-037: Rate limit check
      const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
      const nowMs = Date.now();
      const rateEntry = uploadRateMap.get(clientIp);
      if (rateEntry && rateEntry.resetAt > nowMs) {
        if (rateEntry.count >= UPLOAD_RATE_LIMIT) {
          return c.json({ error: 'Upload rate limit exceeded (10/min)' }, 429);
        }
        uploadRateMap.set(clientIp, { count: rateEntry.count + 1, resetAt: rateEntry.resetAt });
      } else {
        uploadRateMap.set(clientIp, { count: 1, resetAt: nowMs + UPLOAD_RATE_WINDOW_MS });
      }
      const convId = c.req.param('id');
      const formData = await c.req.formData();
      const uploadsDir = join(homedir(), '.qualixar-os', 'uploads');
      if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

      const files: Array<{ id: string; name: string; type: string; size: number; url: string }> = [];

      for (const [key, value] of formData.entries()) {
        if (key === 'files' && value instanceof File) {
          // DEF-037: File size limit
          if (value.size > UPLOAD_MAX_SIZE) {
            return c.json({ error: `File "${value.name}" exceeds 10MB limit` }, 413);
          }
          const fileId = randomUUID();
          const ext = value.name.includes('.') ? value.name.slice(value.name.lastIndexOf('.')) : '';
          const diskName = `${fileId}${ext}`;
          const diskPath = join(uploadsDir, diskName);

          const buffer = Buffer.from(await value.arrayBuffer());
          writeFileSync(diskPath, buffer);

          files.push({
            id: fileId,
            name: value.name,
            type: value.type,
            size: value.size,
            url: `/api/files/${fileId}${ext}`,
          });
        }
      }

      return c.json({ ok: true, files });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/files/:filename', (c) => {
    const filename = c.req.param('filename');
    const safeName = basename(filename); // DEF-002: strip directory traversal components
    const uploadsDir = join(homedir(), '.qualixar-os', 'uploads');
    const filePath = join(uploadsDir, safeName);
    if (!filePath.startsWith(uploadsDir)) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
    if (!existsSync(filePath)) {
      return c.json({ error: 'File not found' }, 404);
    }
    const content = readFileSync(filePath);
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : '';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', pdf: 'application/pdf', json: 'application/json',
      txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    };
    const mime = mimeMap[ext] ?? 'application/octet-stream';
    return new Response(content, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' } });
  });

}
