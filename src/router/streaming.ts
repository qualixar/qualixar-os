// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Streaming: Real SDK Token Streaming
 *
 * C-16: Provides AsyncIterable<string> streaming for all providers.
 * Each provider's SDK streaming API is wrapped behind a uniform interface.
 *
 * Providers:
 *   - Anthropic: client.messages.stream() → content_block_delta events
 *   - OpenAI: client.chat.completions.create({ stream: true }) → chunk.choices[0].delta.content
 *   - Google: ai.models.generateContentStream() → chunk.text()
 *   - Ollama: fetch with stream: true → newline-delimited JSON
 *   - Azure-OpenAI: same as OpenAI with AzureOpenAI client
 *   - Bedrock: InvokeModelWithResponseStream
 *
 * Hard Rules:
 *   - Import .js extensions
 *   - readonly interfaces
 *   - All real SDK calls wrapped in v8 ignore
 */

import type { ModelRequest } from '../types/common.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { ModelCall } from './model-call.js';
import type { BudgetChecker } from '../cost/budget-checker.js';
import type { ModelRouter } from './model-router.js';
import { MODEL_CATALOG } from './model-call.js';

// ================================================================
// StreamingModelCall Interface
// ================================================================

/**
 * Extends ModelCall with streaming capability.
 * Returns an AsyncIterable<string> of token chunks.
 */
export interface StreamingModelCall {
  streamModel(request: ModelRequest): AsyncIterable<string>;
}

// ================================================================
// StreamingModelCallImpl
// ================================================================

/* v8 ignore start -- SDK streaming requires real provider connections */
export class StreamingModelCallImpl implements StreamingModelCall {
  private readonly _configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this._configManager = configManager;
  }

  async *streamModel(request: ModelRequest): AsyncIterable<string> {
    const model = request.model ?? this._configManager.get().models.primary;
    const provider = this._inferProvider(model);
    const config = this._configManager.get();
    const providerConfigs = config.providers ?? {};
    const providerCfg = providerConfigs[provider];
    const deployment = this._resolveDeployment(provider, model);

    switch (provider) {
      case 'anthropic': {
        const anthropicPkg = '@anthropic-ai' + '/sdk';
        const { default: Anthropic } = await import(anthropicPkg);
        const clientOpts: Record<string, unknown> = {};
        if (providerCfg?.api_key_env) {
          clientOpts.apiKey = process.env[providerCfg.api_key_env];
        }
        if (providerCfg?.endpoint) {
          clientOpts.baseURL = providerCfg.endpoint;
        }
        const client = new Anthropic(clientOpts);

        const stream = client.messages.stream({
          model: deployment,
          max_tokens: request.maxTokens ?? 1024,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.prompt }],
          temperature: request.temperature ?? 1.0,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta'
          ) {
            yield event.delta.text;
          }
        }
        break;
      }

      case 'openai': {
        const { default: OpenAI } = await import('openai' as string);
        const clientOpts: Record<string, unknown> = {};
        if (providerCfg?.api_key_env) {
          clientOpts.apiKey = process.env[providerCfg.api_key_env];
        }
        if (providerCfg?.endpoint) {
          clientOpts.baseURL = providerCfg.endpoint;
        }
        const client = new OpenAI(clientOpts);

        const msgs: Array<{ role: string; content: string }> = [];
        if (request.systemPrompt) {
          msgs.push({ role: 'system', content: request.systemPrompt });
        }
        msgs.push({ role: 'user', content: request.prompt });

        const stream = await client.chat.completions.create({
          model: deployment,
          max_tokens: request.maxTokens ?? 1024,
          messages: msgs,
          temperature: request.temperature ?? 1.0,
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        }
        break;
      }

      case 'google': {
        const { GoogleGenAI } = await import('@google/genai' as string);
        const apiKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : process.env.GOOGLE_API_KEY;
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContentStream({
          model: deployment,
          contents: request.prompt,
          config: {
            systemInstruction: request.systemPrompt,
            maxOutputTokens: request.maxTokens ?? 1024,
            temperature: request.temperature ?? 1.0,
          },
        });

        for await (const chunk of response) {
          if (chunk.text) {
            yield chunk.text;
          }
        }
        break;
      }

      case 'ollama': {
        const baseUrl = providerCfg?.endpoint
          ?? process.env.OLLAMA_HOST
          ?? 'http://localhost:11434';

        // Support authenticated Ollama endpoints (e.g., Ollama Cloud)
        const ollamaKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : undefined;
        const ollamaHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ollamaKey) ollamaHeaders['Authorization'] = `Bearer ${ollamaKey}`;

        const messages: Array<{ role: string; content: string }> = [];
        if (request.systemPrompt) {
          messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: ollamaHeaders,
          body: JSON.stringify({
            model: deployment,
            messages,
            stream: true,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 4096,
            },
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Ollama streaming error: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              if (parsed.message?.content) {
                yield parsed.message.content;
              }
            } catch {
              // skip malformed lines
            }
          }
        }
        break;
      }

      case 'azure-openai': {
        const azureEndpoint = providerCfg?.endpoint
          ?? process.env.AZURE_AI_ENDPOINT
          ?? process.env.AZURE_OPENAI_ENDPOINT
          ?? '';
        const azureKeyEnv = providerCfg?.api_key_env ?? 'AZURE_AI_API_KEY';
        const azureKey = process.env[azureKeyEnv]
          ?? process.env.AZURE_OPENAI_API_KEY
          ?? '';

        const isClaude = deployment.toLowerCase().includes('claude');
        if (isClaude) {
          const { default: Anthropic } = await import('@anthropic-ai/sdk' as string);
          const anthropicBaseURL = azureEndpoint
            .replace(/\/$/, '')
            .replace('.cognitiveservices.azure.com', '.openai.azure.com')
            + '/anthropic';
          const client = new Anthropic({
            apiKey: azureKey,
            baseURL: anthropicBaseURL,
          });
          const stream = client.messages.stream({
            model: deployment,
            max_tokens: request.maxTokens ?? 1024,
            system: request.systemPrompt ?? undefined,
            messages: [{ role: 'user', content: request.prompt }],
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield event.delta.text;
            }
          }
        } else {
          const { AzureOpenAI } = await import('openai' as string);
          const azureApiVersion = providerCfg?.api_version ?? '2024-10-21';
          const client = new AzureOpenAI({
            endpoint: azureEndpoint,
            apiKey: azureKey,
            deployment,
            apiVersion: azureApiVersion,
          });
          const msgs: Array<{ role: string; content: string }> = [];
          if (request.systemPrompt) msgs.push({ role: 'system', content: request.systemPrompt });
          msgs.push({ role: 'user', content: request.prompt });
          const stream = await client.chat.completions.create({
            model: deployment,
            max_tokens: request.maxTokens ?? 1024,
            messages: msgs,
            temperature: request.temperature ?? 1.0,
            stream: true,
          });
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          }
        }
        break;
      }

      case 'bedrock': {
        const bedrockPkg = '@aws-sdk/client-bedrock-runtime';
        const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = await import(bedrockPkg as string);
        const client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION ?? 'us-east-1',
        });
        const body = JSON.stringify({
          prompt: request.prompt,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 1.0,
        });
        const command = new InvokeModelWithResponseStreamCommand({
          modelId: deployment,
          body: new TextEncoder().encode(body),
          contentType: 'application/json',
        });
        const response = await client.send(command);
        if (response.body) {
          for await (const event of response.body) {
            if (event.chunk?.bytes) {
              const text = new TextDecoder().decode(event.chunk.bytes);
              try {
                const parsed = JSON.parse(text) as { completion?: string; output?: string };
                yield parsed.completion ?? parsed.output ?? '';
              } catch {
                yield text;
              }
            }
          }
        }
        break;
      }

      default:
        throw new Error(`Streaming not supported for provider: ${provider}`);
    }
  }

  private _inferProvider(model: string): string {
    // Check catalog first
    const entry = MODEL_CATALOG.find((m) => m.name === model);
    if (entry) return entry.provider;

    // Check config providers
    const config = this._configManager.get();
    const providers = config.providers ?? {};
    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const prefix = model.slice(0, slashIdx);
      if (providers[prefix]) return prefix;
    }

    // Infer from name prefix
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('gemini-')) return 'google';
    if (model.startsWith('ollama/')) return 'ollama';
    return 'anthropic';
  }

  private _resolveDeployment(provider: string, model: string): string {
    const config = this._configManager.get();
    const configCatalog = config.models.catalog ?? [];
    const configEntry = configCatalog.find((e) => e.name === model);
    if (configEntry?.deployment) return configEntry.deployment;

    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const prefix = model.slice(0, slashIdx);
      const providers = config.providers ?? {};
      if (providers[prefix] || prefix === 'ollama') {
        return model.slice(slashIdx + 1);
      }
    }
    return model;
  }
}
/* v8 ignore stop */

// ================================================================
// RouteStream: Budget-checked streaming via ModelRouter
// ================================================================

/**
 * Stream tokens with budget checking.
 * Performs budget check before starting the stream,
 * then delegates to StreamingModelCall.
 */
/* v8 ignore start -- requires real SDK streaming */
export async function* routeStream(
  request: ModelRequest,
  modelRouter: ModelRouter,
  streamingCall: StreamingModelCall,
  budgetChecker: BudgetChecker,
): AsyncIterable<string> {
  // Budget check before streaming
  const taskId = request.taskId ?? '__global__';
  const estimatedCost = 0.01; // Conservative estimate for streaming
  const budgetStatus = budgetChecker.check(taskId, estimatedCost);
  if (!budgetStatus.allowed) {
    throw new Error('Budget exceeded');
  }

  yield* streamingCall.streamModel(request);
}
/* v8 ignore stop */

// ================================================================
// Factory
// ================================================================

export function createStreamingModelCall(
  configManager: ConfigManager,
): StreamingModelCall {
  return new StreamingModelCallImpl(configManager);
}
