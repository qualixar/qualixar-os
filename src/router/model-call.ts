// TODO: Split into smaller modules (audit finding M-20). This file exceeds the 800-line cap.
// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- ModelCall: Multi-Provider LLM Abstraction
 *
 * Phase 1 LLD Section 2.3.
 * Provides a unified interface for calling LLMs across providers
 * (Anthropic, OpenAI, Google, Ollama) with per-provider circuit
 * breakers, exponential backoff retry, and cost computation.
 *
 * RESOLUTION (C3): ModelCall does NOT write to the model_calls table.
 * The caller (ModelRouter.route()) records calls via CostTracker.
 *
 * SDKs are NOT installed in Phase 1. All provider calls use LAZY
 * dynamic imports wrapped in try/catch. If an SDK is unavailable,
 * the provider is marked as unavailable.
 *
 * Hard Rules:
 * - Import .js extensions
 * - readonly interfaces
 * - _callProvider is protected (overridable for testing)
 * - No DB writes from ModelCall
 */

import type { Logger } from 'pino';
import type { ModelRequest, ModelResponse, ProviderConfig, ModelEntry, ToolCall } from '../types/common.js';
import type { ModelInfo } from './strategies/types.js';
import type { ConfigManager } from '../config/config-manager.js';
import type { CostTracker } from '../cost/cost-tracker.js';
import { retry } from '../utils/retry.js';
import { CircuitBreaker } from '../utils/retry.js';

// DEF-022: MODEL_CATALOG extracted to model-catalog.ts (800-line cap)
import { MODEL_CATALOG } from './model-catalog.js';
export { MODEL_CATALOG } from './model-catalog.js';

// ================================================================
// ModelCall Interface
// ================================================================

/**
 * Multi-provider LLM call abstraction.
 *
 * Pattern: Facade -- hides provider-specific SDKs behind a
 * uniform interface. Consumers call callModel() without knowing
 * whether the underlying call goes to Anthropic, OpenAI, Google,
 * or a local Ollama instance.
 */
export interface ModelCall {
  callModel(request: ModelRequest): Promise<ModelResponse>;
  listProviders(): readonly string[];
  healthCheck(provider: string): Promise<boolean>;
  getAvailableModels(): readonly ModelInfo[];
  /** PA1-HIGH: Reload provider configs from ConfigManager after config hot-reload. */
  reloadProviderConfigs(): void;
}

// ================================================================
// isRetryableError
// ================================================================

/**
 * Classify whether an error is transient and should be retried.
 *
 * Retryable: 429 (rate limit), 500, 502, 503 (server errors),
 * ETIMEDOUT, ECONNRESET, ECONNREFUSED (network), timeout messages.
 *
 * Non-retryable: 400 (bad request), 401 (auth), 404 (not found).
 */
function isRetryableError(error: unknown): boolean {
  /* v8 ignore next 3 -- defensive null guard */
  if (error === null || error === undefined) {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check HTTP status codes
  if (typeof err.status === 'number') {
    const retryableStatuses = [429, 500, 502, 503];
    return retryableStatuses.includes(err.status);
  }

  // Check error codes (network errors)
  if (typeof err.code === 'string') {
    const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
    if (retryableCodes.includes(err.code)) {
      return true;
    }
  }

  // Check error message for timeout patterns
  /* v8 ignore next 3 -- covered by retryable error classification tests */
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return true;
  }

  return false;
}

// ================================================================
// Provider resolution from model name prefix
// ================================================================

/**
 * Infer provider from model name prefix when the model is not
 * found in MODEL_CATALOG.
 *
 * Prefix rules:
 *   claude-  -> anthropic
 *   gpt-     -> openai
 *   gemini-  -> google
 *   ollama/  -> ollama
 */
function inferProviderFromModelName(model: string): string {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('ollama/')) return 'ollama';
  if (model.startsWith('bedrock/')) return 'bedrock';
  // L-13: Common open-weight model naming patterns on popular providers
  if (model.startsWith('llama-') || model.startsWith('llama3')) return 'groq';
  if (model.startsWith('mixtral')) return 'groq';
  if (model.startsWith('qwen')) return 'together';
  if (model.startsWith('gemma')) return 'google';
  // Default to anthropic for unknown models
  return 'anthropic';
}

// ================================================================
// ModelCallImpl
// ================================================================

/**
 * Implementation of the ModelCall interface.
 *
 * Constructor DI: ConfigManager (for default model), CostTracker
 * (unused directly -- kept for symmetry with LLD), Logger.
 *
 * Each provider has its own CircuitBreaker. Calls are wrapped in
 * CircuitBreaker -> retry -> _callProvider.
 */
export class ModelCallImpl implements ModelCall {
  private readonly _configManager: ConfigManager;
  private readonly _costTracker: CostTracker;
  private readonly _log: Logger;
  private readonly _circuitBreakers: Map<string, CircuitBreaker>;

  /**
   * Runtime catalog: DEFAULT_CATALOG + config-defined models.
   * Config entries EXTEND defaults; duplicates (by name) are overridden
   * by config to let users customize pricing/quality for known models.
   */
  private _runtimeCatalog: readonly ModelInfo[];

  /**
   * Provider configs from the user's config file.
   * Key = provider alias (e.g. "azure"), value = provider settings.
   * PA1-HIGH: Mutable to support config hot-reload via reloadProviderConfigs().
   */
  private _providerConfigs: Readonly<Record<string, ProviderConfig>>;

  constructor(
    configManager: ConfigManager,
    costTracker: CostTracker,
    logger: Logger,
  ) {
    this._configManager = configManager;
    this._costTracker = costTracker;
    this._log = logger.child({ component: 'ModelCall', phase: 1 });

    // Merge config catalog into runtime catalog
    const config = configManager.get();

    // Auto-detect Azure provider from env vars if not explicitly configured.
    // Docker containers and CI environments often set AZURE_AI_API_KEY +
    // AZURE_AI_ENDPOINT without a config providers entry.
    const configProviders = { ...(config.providers ?? {}) };
    if (
      !configProviders.azure &&
      process.env.AZURE_AI_API_KEY &&
      process.env.AZURE_AI_ENDPOINT
    ) {
      configProviders.azure = {
        type: 'azure-openai',
        endpoint: process.env.AZURE_AI_ENDPOINT,
        api_key_env: 'AZURE_AI_API_KEY',
      };
    }

    this._providerConfigs = configProviders;
    this._runtimeCatalog = this._buildRuntimeCatalog(config.models.catalog ?? []);

    // Initialize per-provider circuit breakers for all known providers
    this._circuitBreakers = new Map<string, CircuitBreaker>();
    const allProviders = [...new Set(this._runtimeCatalog.map((m) => m.provider))];
    for (const provider of allProviders) {
      this._circuitBreakers.set(
        provider,
        new CircuitBreaker({ threshold: 5, resetTimeoutMs: 60_000 }),
      );
    }
  }

  /**
   * PA1-HIGH: Reload provider configs and runtime catalog from ConfigManager.
   * Called after config:changed events to ensure ModelCall uses fresh config.
   */
  reloadProviderConfigs(): void {
    const config = this._configManager.get();
    const configProviders = { ...(config.providers ?? {}) };
    if (
      !configProviders.azure &&
      process.env.AZURE_AI_API_KEY &&
      process.env.AZURE_AI_ENDPOINT
    ) {
      configProviders.azure = {
        type: 'azure-openai',
        endpoint: process.env.AZURE_AI_ENDPOINT,
        api_key_env: 'AZURE_AI_API_KEY',
      };
    }
    this._providerConfigs = configProviders;
    this._runtimeCatalog = this._buildRuntimeCatalog(config.models.catalog ?? []);

    // Re-initialize circuit breakers for any new providers
    const allProviders = [...new Set(this._runtimeCatalog.map((m) => m.provider))];
    for (const provider of allProviders) {
      if (!this._circuitBreakers.has(provider)) {
        this._circuitBreakers.set(
          provider,
          new CircuitBreaker({ threshold: 5, resetTimeoutMs: 60_000 }),
        );
      }
    }
    this._log.info({ providerCount: Object.keys(configProviders).length, catalogSize: this._runtimeCatalog.length }, 'Provider configs reloaded');
  }

  /**
   * Build the runtime catalog by merging default entries with config entries.
   * Config entries override defaults with the same name.
   */
  private _buildRuntimeCatalog(configCatalog: readonly ModelEntry[]): readonly ModelInfo[] {
    const byName = new Map<string, ModelInfo>();

    // If user has configured their own model catalog, use ONLY those models.
    // This prevents the hardcoded MODEL_CATALOG (cloud-heavy) from polluting
    // a local-only or specific-provider setup.
    if (configCatalog.length > 0) {
      for (const entry of configCatalog) {
        byName.set(entry.name, {
          name: entry.name,
          provider: entry.provider,
          costPerInputToken: entry.cost_per_input_token,
          costPerOutputToken: entry.cost_per_output_token,
          qualityScore: entry.quality_score,
          maxTokens: entry.max_tokens,
          available: true,
        });
      }
    } else {
      // No config catalog — fall back to hardcoded defaults
      for (const entry of MODEL_CATALOG) {
        byName.set(entry.name, entry);
      }
    }

    return Object.freeze([...byName.values()]);
  }

  // ------------------------------------------------------------------
  // callModel
  // ------------------------------------------------------------------

  async callModel(request: ModelRequest): Promise<ModelResponse> {
    // 1. Resolve model and provider
    const { model, provider } = this._resolveModelAndProvider(request);

    // 2. Get or create circuit breaker for this provider
    const cb = this._getOrCreateCircuitBreaker(provider);

    // 3. Wrap in circuit breaker + retry
    try {
      const response = await cb.call(() =>
        retry(
          () => this._callProvider(provider, model, request),
          {
            maxRetries: 3,
            baseDelayMs: 100,
            maxDelayMs: 5_000,
            jitterPct: 0.25,
            retryableErrors: isRetryableError,
          },
        ),
      );
      return response;
    } catch (err) {
      this._log.error({ model, provider, error: err instanceof Error ? err.message : String(err) }, 'Model call failed');
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // listProviders
  // ------------------------------------------------------------------

  listProviders(): readonly string[] {
    return Object.freeze([...new Set(this._runtimeCatalog.map((m) => m.provider))]);
  }

  // ------------------------------------------------------------------
  // healthCheck
  // ------------------------------------------------------------------

  async healthCheck(provider: string): Promise<boolean> {
    // 1. Check if we even know this provider
    const cb = this._circuitBreakers.get(provider);
    if (!cb) {
      return false;
    }

    // 2. If circuit breaker is open, provider is unhealthy
    if (cb.getState() === 'open') {
      return false;
    }

    // 3. Resolve the underlying provider TYPE (config alias -> type)
    const providerType = this._resolveProviderType(provider);

    // 4. For cloud providers, try a minimal SDK check.
    //    Since SDKs aren't installed in Phase 1, this returns false
    //    for cloud providers and checks connection for Ollama.
    // v8 coverage: healthCheck makes real network/SDK calls that require
    // running services or installed SDKs. Tested via mock in unit tests.
    /* v8 ignore start */
    try {
      if (providerType === 'ollama') {
        const providerCfg = this._providerConfigs[provider];
        const baseUrl = providerCfg?.endpoint
          ?? process.env.OLLAMA_HOST
          ?? 'http://localhost:11434';
        const ollamaKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : undefined;
        const headers: Record<string, string> = {};
        if (ollamaKey) headers['Authorization'] = `Bearer ${ollamaKey}`;
        const res = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(5_000),
          headers,
        });
        return res.ok;
      }

      if (providerType === 'anthropic') {
        await import('@anthropic-ai/sdk' as string);
        return true;
      }
      if (providerType === 'openai' || providerType === 'azure-openai') {
        await import('openai' as string);
        return true;
      }
      if (providerType === 'google') {
        await import('@google/genai' as string);
        return true;
      }
      if (providerType === 'bedrock') {
        await import('@aws-sdk/client-bedrock-runtime' as string);
        return true;
      }

      if (providerType === 'lmstudio' || providerType === 'llamacpp' || providerType === 'vllm' || providerType === 'huggingface-tgi') {
        const { getDefaultPort } = await import('./local-provider.js');
        const localPort = getDefaultPort(providerType as 'lmstudio' | 'llamacpp' | 'vllm' | 'huggingface-tgi');
        const localCfg = this._providerConfigs[provider];
        const localEndpoint = localCfg?.endpoint ?? `http://localhost:${localPort}`;
        const res = await fetch(`${localEndpoint}/v1/models`, {
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok;
      }

      return false;
    } catch {
      return false;
    }
    /* v8 ignore stop */
  }

  // ------------------------------------------------------------------
  // getAvailableModels
  // ------------------------------------------------------------------

  getAvailableModels(): readonly ModelInfo[] {
    const result = this._runtimeCatalog.filter((m) => {
      // Filter 1: model must be marked available in catalog
      if (!m.available) {
        this._log.debug({ model: m.name, reason: 'not-available' }, 'Model filtered: not available');
        return false;
      }

      // Filter 2: provider's circuit breaker must not be open
      const cb = this._circuitBreakers.get(m.provider);
      if (cb && cb.getState() === 'open') {
        this._log.debug({ model: m.name, provider: m.provider, reason: 'circuit-open' }, 'Model filtered: circuit breaker open');
        return false;
      }

      // Filter 3: provider must have credentials configured.
      const providerType = this._resolveProviderType(m.provider);
      if (!this._isProviderConfigured(providerType, m.provider)) {
        this._log.debug({ model: m.name, provider: m.provider, providerType, reason: 'not-configured' }, 'Model filtered: provider not configured');
        return false;
      }

      return true;
    });
    this._log.debug({ count: result.length, total: this._runtimeCatalog.length }, 'Available models filtered');
    return result;
  }

  /**
   * Check if a provider has the necessary configuration (API key,
   * endpoint) to accept calls. Prevents cascade from selecting
   * models for unconfigured providers.
   */
  private _isProviderConfigured(providerType: string, providerAlias: string): boolean {
    const cfg = this._providerConfigs[providerAlias];

    switch (providerType) {
      case 'anthropic': {
        const key = cfg?.api_key_env
          ? process.env[cfg.api_key_env]
          : process.env.ANTHROPIC_API_KEY;
        return !!key;
      }
      case 'openai': {
        const key = cfg?.api_key_env
          ? process.env[cfg.api_key_env]
          : process.env.OPENAI_API_KEY;
        if (key) return true;
        // SCN-001 Fix: Azure AI Foundry can serve OpenAI models (gpt-4.1, gpt-4o, etc.)
        // If no direct OpenAI key, check if Azure is configured as a fallback
        return this._isProviderConfigured('azure-openai', 'azure');
      }
      case 'google': {
        const key = cfg?.api_key_env
          ? process.env[cfg.api_key_env]
          : process.env.GOOGLE_API_KEY;
        return !!key;
      }
      case 'azure-openai': {
        const key = cfg?.api_key_env
          ? process.env[cfg.api_key_env]
          : (process.env.AZURE_AI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY);
        const endpoint = cfg?.endpoint
          ?? process.env.AZURE_AI_ENDPOINT
          ?? process.env.AZURE_OPENAI_ENDPOINT;
        return !!(key && endpoint);
      }
      case 'bedrock': {
        // Bedrock uses AWS credential chain (env vars, instance profile, etc.)
        const awsKey = cfg?.api_key_env
          ? process.env[cfg.api_key_env]
          : process.env.AWS_ACCESS_KEY_ID;
        // Allow if explicit key OR if running on AWS (instance profile)
        return !!awsKey || !!process.env.AWS_PROFILE || !!process.env.AWS_ROLE_ARN;
      }
      case 'ollama':
      case 'lmstudio':
      case 'llamacpp':
      case 'vllm':
      case 'huggingface-tgi':
        return true; // Local providers, no key needed
      case 'openrouter': return !!process.env.OPENROUTER_API_KEY;
      case 'groq': return !!process.env.GROQ_API_KEY;
      case 'deepseek': return !!process.env.DEEPSEEK_API_KEY;
      case 'together': return !!process.env.TOGETHER_API_KEY;
      case 'xai': return !!process.env.XAI_API_KEY;
      default:
        return true; // Unknown providers: allow (fail at call time)
    }
  }

  // ------------------------------------------------------------------
  // _callProvider (protected -- overridable for testing)
  // ------------------------------------------------------------------

  /**
   * Call the actual LLM provider SDK.
   *
   * This method is PROTECTED so TestableModelCall can override it
   * with mock responses for unit testing.
   *
   * In production, this uses lazy dynamic imports for each SDK.
   * If an SDK is not installed, it throws an error that propagates
   * to the retry/circuit-breaker layer.
   */
  // TODO: Add integration tests with mock HTTP servers (audit finding M-05)
  // v8 coverage: _callProvider is overridden by TestableModelCall in all unit tests.
  // The base class implementation uses lazy dynamic imports for SDKs not installed until Phase 9.
  // Coverage of real provider calls is deferred to Phase 9 E2E tests.
  /* v8 ignore start */
  protected async _callProvider(
    provider: string,
    model: string,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const start = performance.now();

    // Look up catalog entry for cost computation (runtime catalog includes config entries)
    const catalogEntry = this._runtimeCatalog.find((m) => m.name === model);
    const costPerInput = catalogEntry?.costPerInputToken ?? 0;
    const costPerOutput = catalogEntry?.costPerOutputToken ?? 0;

    // Resolve the underlying provider TYPE from config (e.g. "azure" -> "azure-openai")
    const providerType = this._resolveProviderType(provider);
    const providerCfg = this._providerConfigs[provider];

    // G-1: Pre-check credentials BEFORE attempting SDK calls.
    // Prevents server crash when API key is missing — returns a clear error
    // instead of letting the SDK throw an unhandled exception.
    if (!this._isProviderConfigured(providerType, provider)) {
      throw new Error(
        `Provider "${provider}" (type: ${providerType}) is not configured. `
        + 'Set the required API key environment variable or configure the provider in settings.',
      );
    }

    // Resolve deployment name: catalog entry deployment, or strip provider prefix
    const deployment = this._resolveDeployment(provider, model);

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCalls: ToolCall[] | undefined;
    switch (providerType) {
      case 'anthropic': {
        // Lazy dynamic import -- SDK may not be installed
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

        // Build messages: support multi-turn tool conversations
        const anthropicMessages = request.messages
          ? request.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>
          : [{ role: 'user' as const, content: request.prompt }];

        // Convert tool schemas to Anthropic format if provided
        const anthropicTools = request.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }));

        const createParams: Record<string, unknown> = {
          model: deployment,
          max_tokens: request.maxTokens ?? 4096,
          system: request.systemPrompt,
          messages: anthropicMessages,
          temperature: request.temperature ?? 1.0,
        };
        if (anthropicTools && anthropicTools.length > 0) {
          createParams.tools = anthropicTools;
        }

        const message = await client.messages.create(createParams);

        // Extract text content
        content = message.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text: string }) => b.text)
          .join('');

        // Extract tool_use blocks if present
        const toolUseBlocks = message.content.filter(
          (b: { type: string }) => b.type === 'tool_use',
        );
        if (toolUseBlocks.length > 0) {
          toolCalls = toolUseBlocks.map(
            (b: { id: string; name: string; input: Record<string, unknown> }) => ({
              id: b.id,
              name: b.name,
              input: b.input,
            }),
          );
        }

        inputTokens = message.usage.input_tokens;
        outputTokens = message.usage.output_tokens;
        break;
      }

      case 'openai': {
        // SCN-001 Fix: If no direct OpenAI key, route through Azure AI Foundry
        const directOpenAIKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : process.env.OPENAI_API_KEY;
        if (!directOpenAIKey) {
          // No OpenAI key — delegate to azure-openai provider path
          const azureCfg = this._providerConfigs.azure;
          const azureEndpoint = azureCfg?.endpoint
            ?? process.env.AZURE_AI_ENDPOINT
            ?? process.env.AZURE_OPENAI_ENDPOINT
            ?? '';
          const azureKeyEnv = azureCfg?.api_key_env ?? 'AZURE_AI_API_KEY';
          const azureKey = process.env[azureKeyEnv]
            ?? process.env.AZURE_OPENAI_API_KEY
            ?? '';
          if (azureEndpoint && azureKey) {
            this._log.info(
              { model, provider: 'openai->azure' },
              'No OPENAI_API_KEY, routing OpenAI model through Azure AI Foundry',
            );
            return this._callProvider('azure', model, request);
          }
        }

        const { default: OpenAI } = await import('openai' as string);
        const clientOpts: Record<string, unknown> = {};
        if (providerCfg?.api_key_env) {
          clientOpts.apiKey = process.env[providerCfg.api_key_env];
        }
        if (providerCfg?.endpoint) {
          clientOpts.baseURL = providerCfg.endpoint;
        }
        const client = new OpenAI(clientOpts);

        // Build messages: support multi-turn tool conversations.
        // Convert Anthropic-format messages (tool_use/tool_result blocks)
        // to OpenAI format (tool_calls array + role:tool messages).
        const rawMessages = request.messages
          ? request.messages as Array<{ role: string; content: unknown }>
          : (() => {
              const msgs: Array<{ role: string; content: string }> = [];
              if (request.systemPrompt) {
                msgs.push({ role: 'system', content: request.systemPrompt });
              }
              msgs.push({ role: 'user', content: request.prompt });
              return msgs;
            })();

        // A2A message format bridge: Anthropic → OpenAI
        const openaiMessages: Array<Record<string, unknown>> = [];
        for (const msg of rawMessages) {
          const contentBlocks = Array.isArray(msg.content) ? msg.content as Array<Record<string, unknown>> : null;

          if (msg.role === 'assistant' && contentBlocks) {
            // Check for Anthropic tool_use blocks in assistant content
            const toolUseBlocks = contentBlocks.filter((b) => b.type === 'tool_use');
            const textBlocks = contentBlocks.filter((b) => b.type === 'text');
            if (toolUseBlocks.length > 0) {
              // Convert to OpenAI format: assistant message with tool_calls
              openaiMessages.push({
                role: 'assistant',
                content: textBlocks.map((b) => b.text).join('') || null,
                tool_calls: toolUseBlocks.map((b) => ({
                  id: b.id,
                  type: 'function',
                  function: {
                    name: b.name,
                    arguments: JSON.stringify(b.input ?? {}),
                  },
                })),
              });
              continue;
            }
          }

          if (msg.role === 'user' && contentBlocks) {
            // Check for Anthropic tool_result blocks in user content
            const toolResults = contentBlocks.filter((b) => b.type === 'tool_result');
            if (toolResults.length > 0) {
              // Convert each tool_result to a separate role:tool message (OpenAI format)
              for (const tr of toolResults) {
                openaiMessages.push({
                  role: 'tool',
                  tool_call_id: tr.tool_use_id,
                  content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                });
              }
              continue;
            }
          }

          // Pass through as-is (regular text messages)
          openaiMessages.push(msg as Record<string, unknown>);
        }

        // Convert tool schemas to OpenAI format if provided
        const openaiTools = request.tools?.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));

        // GPT-5.x, o3, o4 and newer use max_completion_tokens; older use max_tokens
        const needsNewTokenParam = /gpt-5|gpt-4\.1|^o[34]/.test(deployment);
        const tokenParam = needsNewTokenParam
          ? { max_completion_tokens: request.maxTokens ?? 4096 }
          : { max_tokens: request.maxTokens ?? 4096 };

        const createParams: Record<string, unknown> = {
          model: deployment,
          ...tokenParam,
          messages: openaiMessages,
          temperature: request.temperature ?? 1.0,
        };
        if (openaiTools && openaiTools.length > 0) {
          createParams.tools = openaiTools;
        }

        const completion = await client.chat.completions.create(createParams);
        content = completion.choices[0]?.message?.content ?? '';

        // Extract tool_calls if present
        const openaiToolCalls = completion.choices[0]?.message?.tool_calls;
        if (openaiToolCalls && openaiToolCalls.length > 0) {
          toolCalls = openaiToolCalls.map(
            (tc: { id: string; function: { name: string; arguments: string } }) => ({
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
            }),
          );
        }

        inputTokens = completion.usage?.prompt_tokens ?? 0;
        outputTokens = completion.usage?.completion_tokens ?? 0;
        break;
      }

      case 'google': {
        const { GoogleGenAI } = await import('@google/genai' as string);
        const apiKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : process.env.GOOGLE_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: deployment,
          contents: request.prompt,
          config: {
            systemInstruction: request.systemPrompt,
            maxOutputTokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 1.0,
          },
        });
        content = response.text ?? '';
        inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
        break;
      }

      case 'ollama': {
        const baseUrl = providerCfg?.endpoint
          ?? process.env.OLLAMA_HOST
          ?? 'http://localhost:11434';

        // Support authenticated Ollama endpoints (e.g., Ollama Cloud)
        const ollamaApiKey = providerCfg?.api_key_env
          ? process.env[providerCfg.api_key_env]
          : undefined;
        const ollamaHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ollamaApiKey) {
          ollamaHeaders['Authorization'] = `Bearer ${ollamaApiKey}`;
        }

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
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 4096,
            },
          }),
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: res.statusText }));
          const err = new Error(
            `Ollama error (${res.status}): ${(errorBody as { error?: string }).error ?? 'Unknown'}`,
          );
          (err as Error & { status: number }).status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          message: { content: string };
          prompt_eval_count?: number;
          eval_count?: number;
        };
        content = data.message.content;
        inputTokens = data.prompt_eval_count ?? 0;
        outputTokens = data.eval_count ?? 0;
        break;
      }

      case 'azure-openai': {
        // Azure AI Foundry / Azure OpenAI
        const azureEndpoint = providerCfg?.endpoint
          ?? process.env.AZURE_AI_ENDPOINT
          ?? process.env.AZURE_OPENAI_ENDPOINT
          ?? '';
        const azureKeyEnv = providerCfg?.api_key_env ?? 'AZURE_AI_API_KEY';
        const azureKey = process.env[azureKeyEnv]
          ?? process.env.AZURE_OPENAI_API_KEY
          ?? '';
        if (!azureEndpoint || !azureKey) {
          throw new Error(
            `Azure OpenAI provider "${provider}" requires endpoint and API key. `
            + 'Set endpoint in config and ensure the api_key_env var is set.',
          );
        }

        // Detect Claude models on Azure — these need Anthropic SDK via AnthropicFoundry
        // Azure AI Foundry Claude endpoint: https://<resource>.openai.azure.com/anthropic
        const isClaude = deployment.toLowerCase().includes('claude');
        if (isClaude) {
          const { default: Anthropic } = await import('@anthropic-ai/sdk' as string);
          // Derive the Anthropic Foundry endpoint from the Azure endpoint
          // cognitiveservices.azure.com → openai.azure.com/anthropic
          const anthropicBaseURL = azureEndpoint
            .replace(/\/$/, '')
            .replace('.cognitiveservices.azure.com', '.openai.azure.com')
            + '/anthropic';
          const anthropicClient = new Anthropic({
            apiKey: azureKey,
            baseURL: anthropicBaseURL,
          });
          const azureClaudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
            { role: 'user', content: request.prompt },
          ];
          const azureClaudeResponse = await anthropicClient.messages.create({
            model: deployment,
            max_tokens: request.maxTokens ?? 4096,
            system: request.systemPrompt ?? undefined,
            messages: azureClaudeMessages,
          });
          content = azureClaudeResponse.content.map((b: { type: string; text?: string }) =>
            b.type === 'text' ? (b.text ?? '') : '',
          ).join('');
          inputTokens = azureClaudeResponse.usage?.input_tokens ?? 0;
          outputTokens = azureClaudeResponse.usage?.output_tokens ?? 0;
        } else {
          // GPT/non-Claude models — use OpenAI SDK
          const { AzureOpenAI } = await import('openai' as string);
          const azureApiVersion = providerCfg?.api_version ?? '2024-10-21';
          const azureClient = new AzureOpenAI({
            endpoint: azureEndpoint,
            apiKey: azureKey,
            deployment,
            apiVersion: azureApiVersion,
          });
          const azureMessages: Array<{ role: string; content: string }> = [];
          if (request.systemPrompt) {
            azureMessages.push({ role: 'system', content: request.systemPrompt });
          }
          azureMessages.push({ role: 'user', content: request.prompt });
          // GPT-5.x, gpt-4.1, o3, o4 and newer use max_completion_tokens
          const isNewGpt = /gpt-5|gpt-4\.1|^o[34]/.test(deployment);
          const tokenParam = isNewGpt
            ? { max_completion_tokens: request.maxTokens ?? 4096 }
            : { max_tokens: request.maxTokens ?? 4096 };
          const azureCompletion = await azureClient.chat.completions.create({
            model: deployment,
            ...tokenParam,
            messages: azureMessages,
            temperature: request.temperature ?? 1.0,
          });
          content = azureCompletion.choices[0]?.message?.content ?? '';
          inputTokens = azureCompletion.usage?.prompt_tokens ?? 0;
          outputTokens = azureCompletion.usage?.completion_tokens ?? 0;
        }
        break;
      }

      case 'bedrock': {
        // H-21: AWS Bedrock provider stub
        const bedrockPkg = '@aws-sdk/client-bedrock-runtime';
        const { BedrockRuntimeClient, InvokeModelCommand } = await import(bedrockPkg as string);
        const bedrockClient = new BedrockRuntimeClient({
          region: process.env.AWS_REGION ?? 'us-east-1',
          ...(process.env.AWS_ACCESS_KEY_ID ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
              sessionToken: process.env.AWS_SESSION_TOKEN,
            },
          } : {}),
        });

        // Format request body based on model type
        const isBedrockClaude = deployment.includes('claude');
        const bedrockBody = isBedrockClaude
          ? {
              anthropic_version: 'bedrock-2023-05-31',
              max_tokens: request.maxTokens ?? 4096,
              messages: [{ role: 'user', content: request.prompt }],
              ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
              temperature: request.temperature ?? 1.0,
            }
          : {
              prompt: request.prompt,
              max_tokens: request.maxTokens ?? 4096,
              temperature: request.temperature ?? 1.0,
            };

        const bedrockCommand = new InvokeModelCommand({
          modelId: deployment,
          body: new TextEncoder().encode(JSON.stringify(bedrockBody)),
          contentType: 'application/json',
          accept: 'application/json',
        });
        const bedrockResponse = await bedrockClient.send(bedrockCommand);
        const bedrockResult = JSON.parse(
          new TextDecoder().decode(bedrockResponse.body),
        ) as Record<string, unknown>;

        if (isBedrockClaude) {
          // Anthropic format response
          const bedrockContent = bedrockResult.content as Array<{ type: string; text?: string }> ?? [];
          content = bedrockContent
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
          const usage = bedrockResult.usage as { input_tokens?: number; output_tokens?: number } ?? {};
          inputTokens = usage.input_tokens ?? 0;
          outputTokens = usage.output_tokens ?? 0;
        } else {
          // Generic format
          content = (bedrockResult.completion ?? bedrockResult.output ?? '') as string;
          inputTokens = (bedrockResult.prompt_token_count ?? 0) as number;
          outputTokens = (bedrockResult.generation_token_count ?? 0) as number;
        }
        break;
      }

      case 'lmstudio':
      case 'llamacpp':
      case 'vllm':
      case 'huggingface-tgi': {
        const { callLocalProvider } = await import('./local-provider.js');
        const { getDefaultPort } = await import('./local-provider.js');
        const localPort = getDefaultPort(providerType as 'lmstudio' | 'llamacpp' | 'vllm' | 'huggingface-tgi');
        return callLocalProvider(
          request,
          providerType as 'lmstudio' | 'llamacpp' | 'vllm' | 'huggingface-tgi',
          providerCfg?.endpoint ?? `http://localhost:${localPort}`,
          deployment,
        );
      }

      case 'openrouter': {
        const key = process.env.OPENROUTER_API_KEY ?? '';
        const result = await this._callOpenAICompatible('https://openrouter.ai/api/v1', key, model, deployment, request);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        toolCalls = result.toolCalls;
        break;
      }
      case 'groq': {
        const key = process.env.GROQ_API_KEY ?? '';
        const result = await this._callOpenAICompatible('https://api.groq.com/openai/v1', key, model, deployment, request);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        toolCalls = result.toolCalls;
        break;
      }
      case 'deepseek': {
        const key = process.env.DEEPSEEK_API_KEY ?? '';
        const result = await this._callOpenAICompatible('https://api.deepseek.com/v1', key, model, deployment, request);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        toolCalls = result.toolCalls;
        break;
      }
      case 'together': {
        const key = process.env.TOGETHER_API_KEY ?? '';
        const result = await this._callOpenAICompatible('https://api.together.xyz/v1', key, model, deployment, request);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        toolCalls = result.toolCalls;
        break;
      }
      case 'xai': {
        const key = process.env.XAI_API_KEY ?? '';
        const result = await this._callOpenAICompatible('https://api.x.ai/v1', key, model, deployment, request);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        toolCalls = result.toolCalls;
        break;
      }

      default:
        throw new Error(`Unknown provider type: ${providerType} (provider alias: ${provider})`);
    }
    const latencyMs = performance.now() - start;
    const costUsd = inputTokens * costPerInput + outputTokens * costPerOutput;

    return {
      content,
      model,
      provider,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }
  /* v8 ignore stop */

  // ------------------------------------------------------------------
  // OpenAI-compatible provider helper
  // ------------------------------------------------------------------

  /**
   * Shared helper for providers that expose an OpenAI-compatible chat API.
   * Used by: openrouter, groq, deepseek, together, xai.
   */
  private async _callOpenAICompatible(
    baseURL: string,
    apiKey: string,
    model: string,
    deployment: string,
    request: ModelRequest,
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; toolCalls?: ToolCall[] }> {
    const { default: OpenAI } = await import('openai' as string);
    const client = new OpenAI({ apiKey, baseURL });
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });

    const isNewModel = /gpt-5|gpt-4\.1|^o[34]/.test(deployment);
    const tokenParam = isNewModel
      ? { max_completion_tokens: request.maxTokens ?? 4096 }
      : { max_tokens: request.maxTokens ?? 4096 };

    // PA1-HIGH: Pass tools to OpenAI-compatible providers (openrouter, groq, deepseek, together, xai)
    const createParams: Record<string, unknown> = {
      model: deployment,
      ...tokenParam,
      messages,
      temperature: request.temperature ?? 1.0,
    };
    if (request.tools && request.tools.length > 0) {
      createParams.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
    }

    const completion = await client.chat.completions.create(createParams);

    // PA1-HIGH: Extract tool_calls from response
    let toolCalls: ToolCall[] | undefined;
    const toolCallBlocks = completion.choices[0]?.message?.tool_calls;
    if (toolCallBlocks && toolCallBlocks.length > 0) {
      toolCalls = toolCallBlocks.map(
        (tc: { id: string; function: { name: string; arguments: string } }) => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
        }),
      );
    }

    return {
      content: completion.choices[0]?.message?.content ?? '',
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      toolCalls,
    };
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Resolve model name and provider from the request or config defaults.
   *
   * Resolution order:
   * 1. Look up in runtime catalog (default + config entries)
   * 2. Check if model name has a provider prefix matching a config provider
   * 3. Infer provider from model name prefix (claude- -> anthropic, etc.)
   */
  private _resolveModelAndProvider(
    request: ModelRequest,
  ): { readonly model: string; readonly provider: string } {
    // Determine model name
    const model = request.model ?? this._configManager.get().models.primary;

    // 1. Look up provider from runtime catalog
    const catalogEntry = this._runtimeCatalog.find((m) => m.name === model);
    if (catalogEntry) {
      return { model, provider: catalogEntry.provider };
    }

    // 2. Check for config provider prefix (e.g. "my-azure/model" -> "my-azure")
    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const prefix = model.slice(0, slashIdx);
      if (this._providerConfigs[prefix]) {
        return { model, provider: prefix };
      }
    }

    // 3. Infer provider from model name prefix
    const provider = inferProviderFromModelName(model);
    this._log.debug(
      { model, provider },
      'Model not in catalog, inferred provider from name prefix',
    );
    return { model, provider };
  }

  /**
   * Resolve the underlying provider TYPE for a given provider alias.
   *
   * If the alias is in config.providers, return its type.
   * Otherwise, check if the alias IS a known type already (backward compat).
   */
  private _resolveProviderType(provider: string): string {
    // Check config first
    const cfg = this._providerConfigs[provider];
    if (cfg) {
      return cfg.type;
    }

    // Known direct types (backward compat when no config providers)
    const knownTypes = ['anthropic', 'openai', 'google', 'ollama', 'azure-openai', 'bedrock', 'lmstudio', 'llamacpp', 'vllm', 'huggingface-tgi', 'openrouter', 'groq', 'deepseek', 'together', 'xai'];
    if (knownTypes.includes(provider)) {
      return provider;
    }

    // Default: treat as the provider name itself
    return provider;
  }

  /**
   * Resolve the deployment/model name to send to the provider SDK.
   *
   * Priority:
   * 1. Catalog entry's deployment field (from config ModelEntry)
   * 2. Strip provider prefix from model name (e.g. "azure/gpt-5.4" -> "gpt-5.4")
   * 3. Strip "ollama/" prefix for backward compat
   * 4. Use model name as-is
   */
  private _resolveDeployment(provider: string, model: string): string {
    // Check if runtime catalog has an explicit deployment
    const entry = this._runtimeCatalog.find((m) => m.name === model);
    // ModelEntry -> deployment is on config entries; runtime ModelInfo doesn't
    // have it, but we can check the config catalog directly
    const configCatalog = this._configManager.get().models.catalog ?? [];
    const configEntry = configCatalog.find((e) => e.name === model);
    if (configEntry?.deployment) {
      return configEntry.deployment;
    }

    // Strip provider prefix (e.g. "azure/gpt-5.4-mini" -> "gpt-5.4-mini")
    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const prefix = model.slice(0, slashIdx);
      // Only strip if prefix matches a known config provider or built-in prefix
      if (this._providerConfigs[prefix] || prefix === 'ollama') {
        return model.slice(slashIdx + 1);
      }
    }

    return model;
  }

  /**
   * Get existing circuit breaker or create a new one for the provider.
   */
  private _getOrCreateCircuitBreaker(provider: string): CircuitBreaker {
    let cb = this._circuitBreakers.get(provider);
    /* v8 ignore next 4 -- CB creation on first call per provider */
    if (!cb) {
      cb = new CircuitBreaker({ threshold: 5, resetTimeoutMs: 60_000 });
      this._circuitBreakers.set(provider, cb);
    }
    return cb;
  }
}

// ================================================================
// Factory
// ================================================================

/**
 * Create a ModelCall instance with the given dependencies.
 *
 * @param configManager - For reading default model config
 * @param costTracker - Kept for interface symmetry (not used directly)
 * @param logger - Pino logger for structured logging
 */
export function createModelCall(
  configManager: ConfigManager,
  costTracker: CostTracker,
  logger: Logger,
): ModelCall {
  return new ModelCallImpl(configManager, costTracker, logger);
}
