// Copyright (c) 2026 Varun Pratap Bhardwaj | Qualixar OS | FSL-1.1-ALv2
/**
 * Claude Managed Agents adapter (TypeScript) -- lifecycle adapter.
 * All endpoints [ASSUMED -- R-1]. Endpoint-agnostic via config.
 *
 * TYPE CHANGES NEEDED (applied by Angle 3):
 *   - src/types/common.ts: Add 'claude-managed' to ProviderConfigSchema.type enum
 *   - src/types/events.ts: Add 5 managed: event types (see claude_managed_types.ts)
 */

import type { TaskResult, CostSummary, Artifact, CredentialVault } from '../src/types/common.js';
import {
  ClaudeManagedConfigSchema,
  type ClaudeManagedConfig,
  type ClaudeManagedEnvironment,
  type ClaudeManagedEvent,
  type AgentCreationConfig,
  type SessionCost,
  type SessionUsage,
  type ClaudeManagedAdapterInterface,
} from './claude_managed_types.js';
import { SSEParser } from './claude_managed_sse.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;
const MAX_TIMEOUT_HOURS = 24; // H-06 FIX: Upper bound for session timeout
const MAX_EVENTS_PER_SESSION = 10_000; // M-06 FIX: Cap event list growth

// Default token pricing for claude-sonnet-4-6 [ASSUMED -- R-4]
const DEFAULT_COST_PER_INPUT_TOKEN = 0.000003;
const DEFAULT_COST_PER_OUTPUT_TOKEN = 0.000015;

// C-04 FIX: Credential-like patterns for sanitization
const CREDENTIAL_PATTERN = /(?:sk-[a-zA-Z0-9]{10,}|[A-Za-z0-9+/]{40,}={0,2}|Bearer\s+\S{10,}|"value"\s*:\s*"[^"]{8,}")/gi;

/**
 * C-04 FIX: Sanitize error response bodies before propagating.
 * Strips credential-like values and truncates to prevent secret leakage.
 */
function sanitizeError(raw: string): string {
  const truncated = raw.slice(0, 500);
  return truncated.replace(CREDENTIAL_PATTERN, '[REDACTED]');
}

// ---------------------------------------------------------------------------
// Structured Logger (M-01 FIX: Replace console.warn with structured logging)
// ---------------------------------------------------------------------------

const log = {
  warn(msg: string, ctx?: Record<string, unknown>): void {
    // Structured format: JSON-serializable, filterable, redirectable
    const entry = { level: 'warn', component: 'qualixar-os.managed', msg, ...ctx };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
  debug(msg: string, ctx?: Record<string, unknown>): void {
    if (process.env.QOS_DEBUG === '1') {
      const entry = { level: 'debug', component: 'qualixar-os.managed', msg, ...ctx };
      process.stderr.write(JSON.stringify(entry) + '\n');
    }
  },
  info(msg: string, ctx?: Record<string, unknown>): void {
    const entry = { level: 'info', component: 'qualixar-os.managed', msg, ...ctx };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
};

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class ClaudeManagedAPIError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(`HTTP ${statusCode}: ${message}`);
    this.name = 'ClaudeManagedAPIError';
  }
}

export class ClaudeManagedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeManagedAuthError';
  }
}

export class ClaudeManagedLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeManagedLimitError';
  }
}

export class ClaudeManagedStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeManagedStreamError';
  }
}

// ---------------------------------------------------------------------------
// Event Callback Type
// ---------------------------------------------------------------------------

export type EventCallback = (eventType: string, payload: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Constructor Dependencies
// ---------------------------------------------------------------------------

export interface ClaudeManagedAdapterDeps {
  readonly config?: Partial<ClaudeManagedConfig>;
  readonly credentialVault?: CredentialVault;
  readonly eventCallback?: EventCallback;
  readonly budgetRemainingUsd?: number;
}

// ---------------------------------------------------------------------------
// Internal Session State (mutable during lifecycle)
// ---------------------------------------------------------------------------

interface MutableSession {
  readonly sessionId: string;
  readonly agentId: string;
  readonly startedAt: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  events: ClaudeManagedEvent[];
  toolResults: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  totalUsage: SessionUsage;
  model: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Session Cost Accumulator
// ---------------------------------------------------------------------------

class SessionCostAccumulator {
  private readonly sessionHourRate: number;
  private readonly billingGranularity: 'ceil' | 'floor' | 'proportional';
  private readonly costPerInput: number;
  private readonly costPerOutput: number;
  private readonly tokenUsage = new Map<string, { input: number; output: number }>();

  constructor(
    sessionHourRate: number,
    billingGranularity: 'ceil' | 'floor' | 'proportional',
    costPerInput = DEFAULT_COST_PER_INPUT_TOKEN,
    costPerOutput = DEFAULT_COST_PER_OUTPUT_TOKEN,
  ) {
    this.sessionHourRate = sessionHourRate;
    this.billingGranularity = billingGranularity;
    this.costPerInput = costPerInput;
    this.costPerOutput = costPerOutput;
  }

  recordTokens(sessionId: string, inputTokens: number, outputTokens: number): void {
    const prev = this.tokenUsage.get(sessionId) ?? { input: 0, output: 0 };
    this.tokenUsage.set(sessionId, {
      input: prev.input + inputTokens,
      output: prev.output + outputTokens,
    });
  }

  getTokenCost(sessionId: string): number {
    const usage = this.tokenUsage.get(sessionId) ?? { input: 0, output: 0 };
    return (usage.input * this.costPerInput) + (usage.output * this.costPerOutput);
  }

  getSessionHourCost(elapsedMs: number): number {
    const elapsedHours = elapsedMs / 3_600_000;

    let billedHours: number;
    if (this.billingGranularity === 'ceil') {
      billedHours = elapsedHours > 0 ? Math.ceil(elapsedHours) : 0;
    } else if (this.billingGranularity === 'floor') {
      billedHours = Math.floor(elapsedHours);
    } else {
      billedHours = elapsedHours;
    }

    return billedHours * this.sessionHourRate;
  }

  clear(sessionId: string): void {
    this.tokenUsage.delete(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Claude Managed Adapter (H-03 FIX: implements ClaudeManagedAdapterInterface)
// ---------------------------------------------------------------------------

export class ClaudeManagedAdapter implements ClaudeManagedAdapterInterface {
  private readonly config: ClaudeManagedConfig;
  private readonly apiKey: string;
  private readonly activeSessions = new Map<string, MutableSession>();
  private readonly costAccumulator: SessionCostAccumulator;
  private readonly eventCallback?: EventCallback;
  private budgetRemainingUsd: number | null;
  private closed = false;

  constructor(deps: ClaudeManagedAdapterDeps = {}) {
    // Parse and validate config with Zod defaults
    this.config = ClaudeManagedConfigSchema.parse(deps.config ?? {});

    // HR-6: HTTPS only
    if (!this.config.base_url.startsWith('https://')) {
      throw new Error(`base_url must use HTTPS, got: ${this.config.base_url}`);
    }

    // HR-1: Resolve API key (NEVER log/store)
    const keyEnv = this.config.api_key_env;
    if (deps.credentialVault) {
      const key = deps.credentialVault.get(keyEnv);
      if (!key) throw new Error(`API key not found in vault for configured env`);
      this.apiKey = key;
    } else {
      const key = process.env[keyEnv];
      if (!key) throw new Error('API key environment variable is not set');
      this.apiKey = key;
    }

    // Cost accumulator (HR-4)
    this.costAccumulator = new SessionCostAccumulator(
      this.config.session_hour_rate_usd,
      this.config.billing_granularity,
    );

    this.eventCallback = deps.eventCallback;
    this.budgetRemainingUsd = deps.budgetRemainingUsd ?? null;
  }

  // -- Agent Creation (Step 2) --------------------------------------------

  async createAgent(agentConfig: AgentCreationConfig): Promise<string> {
    const body = {
      model: agentConfig.model,
      instructions: agentConfig.instructions,
      tools: agentConfig.tools ?? [],
      max_tokens: agentConfig.maxTokens ?? 4096,
      metadata: { source: 'qualixar-os', version: '2.0.0' },
    };

    const resp = await this.postWithRetry(this.config.endpoints.create_agent, body);
    const data = resp.data as Record<string, unknown>;
    const agentId = data.id as string | undefined;

    if (!agentId) {
      throw new ClaudeManagedAPIError(resp.status, 'Agent creation response missing "id"');
    }

    return agentId;
  }

  // -- Session Creation (Step 3) ------------------------------------------

  async createSession(
    agentId: string,
    envOverride?: Partial<ClaudeManagedEnvironment>,
  ): Promise<string> {
    // HR-7: Enforce concurrent session limit
    if (this.activeSessions.size >= this.config.max_concurrent_sessions) {
      this.emitEvent('managed:session_limit', {
        agentId,
        activeCount: this.activeSessions.size,
        max: this.config.max_concurrent_sessions,
      });
      throw new ClaudeManagedLimitError('Max concurrent sessions reached');
    }

    // Merge environment
    const defaults = this.config.default_environment;
    const merged: ClaudeManagedEnvironment = {
      sandbox: envOverride?.sandbox ?? defaults.sandbox,
      timeout_hours: envOverride?.timeout_hours ?? defaults.timeout_hours,
      credentials: envOverride?.credentials ?? defaults.credentials,
    };

    // M-01 FIX: Structured logging instead of console.warn
    if (!merged.sandbox) {
      log.warn('Sandbox disabled for agent', { agentId });
    }

    // C-03 FIX: Resolve credentials without logging env var names or values
    const resolvedCreds: Array<{ name: string; value: string; scope: string }> = [];
    for (const cred of merged.credentials) {
      const value = process.env[cred.value_env];
      if (!value) {
        log.warn('Credential env var not set, skipping credential', { credName: cred.name });
        continue;
      }
      resolvedCreds.push({ name: cred.name, value, scope: cred.scope });
    }

    const body = {
      sandbox: merged.sandbox,
      timeout_hours: merged.timeout_hours,
      credentials: resolvedCreds,
    };

    const path = this.config.endpoints.create_session.replace('{agent_id}', agentId);
    const resp = await this.postWithRetry(path, body);
    const data = resp.data as Record<string, unknown>;
    const sessionId = data.id as string | undefined;

    if (!sessionId) {
      this.emitEvent('managed:session_failed', { agentId, reason: 'Response missing "id"' });
      throw new ClaudeManagedAPIError(resp.status, 'Session creation response missing "id"');
    }

    // Track session
    const session: MutableSession = {
      sessionId,
      agentId,
      startedAt: performance.now(),
      status: 'active',
      events: [],
      toolResults: [],
      totalUsage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      model: '',
    };

    // H-06 FIX: Cap timeout_hours to prevent unbounded background tasks
    const cappedTimeoutHours = Math.min(merged.timeout_hours, MAX_TIMEOUT_HOURS);
    const timeoutMs = cappedTimeoutHours * 3_600_000;
    session.timeoutHandle = setTimeout(() => {
      if (this.activeSessions.has(sessionId)) {
        this.emitEvent('managed:session_timeout', { sessionId, timeoutHours: cappedTimeoutHours });
        void this.cleanupSession(sessionId);
      }
    }, timeoutMs);

    this.activeSessions.set(sessionId, session);
    this.emitEvent('agent:started', { agentId, sessionId });

    return sessionId;
  }

  // -- Task Execution (Step 4) --------------------------------------------

  async executeTask(
    sessionId: string,
    prompt: string,
    taskType = 'custom',
  ): Promise<TaskResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' is not active`);
    }

    const startTime = performance.now();
    const fullPrompt = taskType !== 'custom' ? `[${taskType.toUpperCase()}] ${prompt}` : prompt;
    const body = { role: 'user', content: fullPrompt };
    const path = this.config.endpoints.send_message.replace('{session_id}', sessionId);

    try {
      const output = await this.streamResponse(sessionId, path, body);
      return this.mapToTaskResult(sessionId, output, session.events, startTime);
    } catch (err) {
      // HR-2: Session cleanup MUST happen even on error
      await this.cleanupSession(sessionId);
      throw err;
    }
  }

  // -- SSE Stream Consumption (Step 5) ------------------------------------

  private async streamResponse(
    sessionId: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const session = this.activeSessions.get(sessionId)!;
    const parser = new SSEParser();
    const outputParts: string[] = [];
    let currentTool: { id: string; name: string } | null = null;
    let currentToolInputJson = '';

    const url = `${this.config.base_url}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': this.config.api_version,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // C-04 FIX: Sanitize error response before propagating
      const errorText = await response.text();
      throw new ClaudeManagedAPIError(response.status, sanitizeError(errorText));
    }

    // M-05 FIX: Validate Content-Type header for SSE stream
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      throw new ClaudeManagedStreamError(
        `Expected Content-Type 'text/event-stream', got: ${contentType.slice(0, 100)}`
      );
    }

    if (!response.body) {
      throw new ClaudeManagedStreamError('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          const event = parser.parseLine(line + '\n');
          if (event === null) continue;

          // M-06 FIX: Cap event list growth
          if (session.events.length < MAX_EVENTS_PER_SESSION) {
            session.events.push(event);
          }

          switch (event.type) {
            case 'message_start': {
              const msg = event.data.message as Record<string, unknown> | undefined;
              session.model = (msg?.model as string) ?? '';
              break;
            }

            case 'content_block_start': {
              const block = event.data.content_block as Record<string, unknown> | undefined;
              if (block?.type === 'tool_use') {
                currentTool = {
                  id: (block.id as string) ?? '',
                  name: (block.name as string) ?? '',
                };
                currentToolInputJson = '';
              }
              break;
            }

            case 'content_block_delta': {
              const delta = event.data.delta as Record<string, unknown> | undefined;
              const deltaType = delta?.type as string | undefined;
              if (deltaType === 'text_delta') {
                const text = (delta?.text as string) ?? '';
                outputParts.push(text);
                // INT-02 FIX: Use managed:text_delta instead of task:started
                this.emitEvent('managed:text_delta', { sessionId, partialContent: text });
              } else if (deltaType === 'input_json_delta') {
                currentToolInputJson += (delta?.partial_json as string) ?? '';
              }
              break;
            }

            case 'content_block_stop': {
              if (currentTool !== null) {
                let parsedInput: Record<string, unknown>;
                try {
                  parsedInput = currentToolInputJson
                    ? (JSON.parse(currentToolInputJson) as Record<string, unknown>)
                    : {};
                } catch {
                  parsedInput = { raw: currentToolInputJson };
                }
                // H-02 FIX: Store tool results for artifact extraction
                session.toolResults.push({ ...currentTool, input: parsedInput });
                currentTool = null;
                currentToolInputJson = '';
              }
              break;
            }

            case 'message_delta': {
              const usage = event.data.usage as Record<string, number> | undefined;
              if (usage) {
                const inTokens = usage.input_tokens ?? 0;
                const outTokens = usage.output_tokens ?? 0;
                if (inTokens || outTokens) {
                  this.costAccumulator.recordTokens(sessionId, inTokens, outTokens);
                  session.totalUsage = {
                    inputTokens: session.totalUsage.inputTokens + inTokens,
                    outputTokens: session.totalUsage.outputTokens + outTokens,
                    cacheCreationInputTokens: session.totalUsage.cacheCreationInputTokens + (usage.cache_creation_input_tokens ?? 0),
                    cacheReadInputTokens: session.totalUsage.cacheReadInputTokens + (usage.cache_read_input_tokens ?? 0),
                  };
                }
              }
              break;
            }

            case 'message_stop': {
              session.status = 'completed';
              this.emitEvent('agent:completed', { sessionId, model: session.model });
              break;
            }

            case 'error': {
              const errorObj = event.data.error as Record<string, unknown> | undefined;
              const errorMsg = (errorObj?.message as string) ?? 'Unknown stream error';
              session.status = 'failed';
              // C-04 FIX: Sanitize error before emitting/throwing
              const safeError = sanitizeError(errorMsg);
              this.emitEvent('task:failed', { sessionId, error: safeError });
              throw new ClaudeManagedStreamError(safeError);
            }

            // 'ping' and unknown types silently ignored
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Check for incomplete stream (E-12)
    if (session.status !== 'completed') {
      this.emitEvent('managed:stream_incomplete', {
        sessionId,
        eventsCount: session.events.length,
      });
      session.status = 'failed';
    }

    return outputParts.join('');
  }

  // -- Result Mapping (Step 6) --------------------------------------------

  private mapToTaskResult(
    sessionId: string,
    output: string,
    events: readonly ClaudeManagedEvent[],
    startTime: number,
  ): TaskResult {
    const session = this.activeSessions.get(sessionId);
    let status: 'completed' | 'failed' | 'cancelled';
    if (!session || events.some(e => e.type === 'error')) {
      status = 'failed';
    } else if (session.status === 'completed') {
      status = 'completed';
    } else {
      status = 'failed';
    }

    // H-02 FIX: Extract artifacts from file_write tool calls
    const artifacts: Artifact[] = [];
    if (session) {
      for (const tool of session.toolResults) {
        if (tool.name === 'file_write' || tool.name === 'write_file') {
          const input = tool.input;
          const filePath = (input.path as string) ?? (input.file_path as string) ?? '';
          const content = (input.content as string) ?? '';
          if (filePath) {
            artifacts.push({
              type: 'file',
              path: filePath,
              content,
              metadata: { toolCallId: tool.id, toolName: tool.name },
            });
          }
        }
      }
    }

    const elapsedMs = performance.now() - startTime;
    const sessionHourUsd = this.costAccumulator.getSessionHourCost(elapsedMs);
    const tokenUsd = this.costAccumulator.getTokenCost(sessionId);
    const totalUsd = sessionHourUsd + tokenUsd;

    // Track budget
    if (this.budgetRemainingUsd !== null) {
      this.budgetRemainingUsd = Math.max(0, this.budgetRemainingUsd - totalUsd);
    }

    const cost: CostSummary = {
      total_usd: totalUsd,
      by_model: { [session?.model ?? 'claude-managed']: tokenUsd },
      by_agent: { 'claude-managed': totalUsd },
      by_category: { session_hour: sessionHourUsd, tokens: tokenUsd },
      budget_remaining_usd: this.budgetRemainingUsd ?? Infinity,
    };

    const durationMs = Math.round(elapsedMs);

    return {
      taskId: sessionId,
      status,
      output,
      artifacts,
      cost,
      judges: [],
      teamDesign: null,
      duration_ms: durationMs,
      metadata: {
        provider: 'claude-managed',
        session_id: sessionId,
        events_count: events.length,
        model: session?.model ?? '',
        session_hour_usd: sessionHourUsd,
        token_usd: tokenUsd,
      },
    };
  }

  // -- Session Cleanup (Step 7) -------------------------------------------

  async cleanupSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return; // Idempotent

    // Clear timeout timer
    if (session.timeoutHandle !== undefined) {
      clearTimeout(session.timeoutHandle);
    }

    try {
      const path = this.config.endpoints.cancel_session.replace('{session_id}', sessionId);
      const url = `${this.config.base_url}${path}`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.config.api_version,
        },
      });
    } catch {
      // M-01 FIX: Structured logging for cleanup failure
      log.warn('Failed to cancel session (best-effort)', { sessionId });
    } finally {
      this.costAccumulator.clear(sessionId);
      this.activeSessions.delete(sessionId);
    }
  }

  // -- Resource Cleanup (Step 8) ------------------------------------------

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const sessionIds = [...this.activeSessions.keys()];
    for (const sid of sessionIds) {
      await this.cleanupSession(sid);
    }
  }

  // -- Public Queries -----------------------------------------------------

  getSessionCost(sessionId: string): SessionCost {
    const session = this.activeSessions.get(sessionId);
    if (!session) return { sessionHourUsd: 0, tokenUsd: 0, totalUsd: 0 };

    const elapsedMs = performance.now() - session.startedAt;
    const sessionHourUsd = this.costAccumulator.getSessionHourCost(elapsedMs);
    const tokenUsd = this.costAccumulator.getTokenCost(sessionId);
    return {
      sessionHourUsd,
      tokenUsd,
      totalUsd: sessionHourUsd + tokenUsd,
    };
  }

  getActiveSessions(): readonly string[] {
    return [...this.activeSessions.keys()];
  }

  getBudgetRemaining(): number {
    return this.budgetRemainingUsd ?? Infinity;
  }

  // -- Internal Helpers ---------------------------------------------------

  private async postWithRetry(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: unknown }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = `${this.config.base_url}${path}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': this.config.api_version,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (resp.status === 401) {
          // M-02 security FIX: Remove env var name from error message
          throw new ClaudeManagedAuthError('API key invalid or expired');
        }

        if (resp.status === 429) {
          // H-05 FIX: Cap Retry-After to prevent DoS amplification
          const rawRetry = Number(resp.headers.get('retry-after') ?? RETRY_BASE_MS / 1000) * 1000;
          const retryAfter = Math.min(rawRetry, RETRY_MAX_MS);
          this.emitEvent('model:call_retrying', {
            reason: 'rate_limited',
            retryAfterMs: retryAfter,
            attempt: attempt + 1,
          });
          await this.sleep(retryAfter);
          continue;
        }

        if (resp.status >= 500) {
          const delay = Math.min(RETRY_BASE_MS * (2 ** attempt), RETRY_MAX_MS);
          // C-04 FIX: Sanitize error text before storing
          lastError = new ClaudeManagedAPIError(resp.status, sanitizeError(await resp.text()));
          await this.sleep(delay);
          continue;
        }

        if (resp.status >= 400) {
          // C-04 FIX: Sanitize error response before propagating
          throw new ClaudeManagedAPIError(resp.status, sanitizeError(await resp.text()));
        }

        const data = await resp.json();
        return { status: resp.status, data };

      } catch (err) {
        if (err instanceof ClaudeManagedAuthError || err instanceof ClaudeManagedAPIError) {
          throw err;
        }
        const delay = Math.min(RETRY_BASE_MS * (2 ** attempt), RETRY_MAX_MS);
        lastError = err instanceof Error ? err : new Error(String(err));
        await this.sleep(delay);
      }
    }

    if (lastError instanceof ClaudeManagedAPIError) throw lastError;
    throw new ClaudeManagedAPIError(500, `All ${MAX_RETRIES} retries failed: ${lastError?.message}`);
  }

  private emitEvent(eventType: string, payload: Record<string, unknown>): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(eventType, payload);
      } catch {
        // Non-fatal -- log at debug level
        log.debug('Event callback error (non-fatal)', { eventType });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/** Factory: create a ClaudeManagedAdapter. */
export function createManagedAdapter(
  deps: ClaudeManagedAdapterDeps = {},
): ClaudeManagedAdapter {
  return new ClaudeManagedAdapter(deps);
}
