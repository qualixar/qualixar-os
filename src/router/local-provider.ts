// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Local LLM Provider Adapter
 *
 * Unified adapter for OpenAI-compatible local LLM servers:
 * LM Studio, llama.cpp, vLLM, and HuggingFace TGI.
 *
 * All four servers expose POST /v1/chat/completions with the
 * OpenAI wire format. This module normalises the request/response
 * and exposes a single callLocalProvider() function.
 *
 * Hard Rules:
 * - Import .js extensions
 * - readonly interfaces
 * - Immutable patterns only
 * - 800-line cap
 */

import type { ModelRequest, ModelResponse } from '../types/common.js';

// ================================================================
// Constants
// ================================================================

/** The four new local-server provider types. */
export const LOCAL_PROVIDER_TYPES = [
  'lmstudio',
  'llamacpp',
  'vllm',
  'huggingface-tgi',
] as const;

export type LocalProviderType = (typeof LOCAL_PROVIDER_TYPES)[number];

/** Default ports each server listens on out of the box. */
const DEFAULT_PORTS: Readonly<Record<LocalProviderType, number>> = Object.freeze({
  lmstudio: 1234,
  llamacpp: 8080,
  vllm: 8000,
  'huggingface-tgi': 8080,
});

// ================================================================
// getDefaultPort
// ================================================================

/**
 * Return the well-known default port for a local provider type.
 */
export function getDefaultPort(type: LocalProviderType): number {
  return DEFAULT_PORTS[type];
}

// ================================================================
// callLocalProvider
// ================================================================

/**
 * Call a local OpenAI-compatible LLM server.
 *
 * @param request    - The model request (prompt, systemPrompt, tools, etc.)
 * @param providerType - One of the LOCAL_PROVIDER_TYPES
 * @param endpoint   - Optional base URL override (default: http://localhost:<port>)
 * @param model      - Optional model name to send in the request body
 * @returns A normalised ModelResponse
 */
export async function callLocalProvider(
  request: ModelRequest,
  providerType: LocalProviderType,
  endpoint?: string,
  model?: string,
): Promise<ModelResponse> {
  const port = DEFAULT_PORTS[providerType];
  const baseUrl = endpoint ?? `http://localhost:${port}`;
  const url = `${baseUrl}/v1/chat/completions`;

  // Build the messages array -- prefer request.messages, else construct
  // from systemPrompt + prompt.
  const messages: readonly { readonly role: string; readonly content: unknown }[] =
    request.messages
      ? [...(request.messages as { role: string; content: unknown }[])]
      : [
          ...(request.systemPrompt
            ? [{ role: 'system' as const, content: request.systemPrompt }]
            : []),
          { role: 'user' as const, content: request.prompt },
        ];

  const body: Record<string, unknown> = {
    model: model ?? 'default',
    messages,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.7,
    stream: false,
  };

  // Add tools if provided (vLLM and LM Studio support function calling)
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  const start = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(request.timeout ?? 120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(
      `Local provider ${providerType} error (${res.status}): ${errText}`,
    );
  }

  const data = (await res.json()) as {
    readonly choices: readonly {
      readonly message: {
        readonly content: string;
        readonly tool_calls?: readonly {
          readonly id: string;
          readonly function: {
            readonly name: string;
            readonly arguments: string;
          };
        }[];
      };
    }[];
    readonly usage?: {
      readonly prompt_tokens?: number;
      readonly completion_tokens?: number;
    };
    readonly model?: string;
  };

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error(`No response from ${providerType}`);
  }

  const toolCalls = choice.message.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  return {
    content: choice.message.content ?? '',
    model: data.model ?? model ?? 'unknown',
    provider: providerType,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    costUsd: 0, // Local models are free
    latencyMs: Date.now() - start,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}
