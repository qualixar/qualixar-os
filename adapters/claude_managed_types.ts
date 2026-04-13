// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Claude Managed Agents API types -- Zod schemas + TypeScript interfaces.
 *
 * All API endpoints are [ASSUMED -- R-1] and may change after research verification.
 * See LLD-ANGLE-2-MANAGED-AGENTS-ADAPTER.md Section 11 (Research Protocol).
 *
 * TYPE CHANGES NEEDED (documented here, applied by Angle 3):
 *   - src/types/common.ts: Add 'claude-managed' to ProviderConfigSchema.type enum
 *   - src/types/events.ts: Add 5 new event types:
 *       'managed:session_timeout', 'managed:session_reconnecting',
 *       'managed:session_failed', 'managed:session_limit',
 *       'managed:stream_incomplete'
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Endpoint Configuration (Endpoint-Agnostic)
// All paths are [ASSUMED -- R-1]. Update only these defaults if API differs.
// ---------------------------------------------------------------------------

export const ClaudeManagedEndpointsSchema = z.object({
  create_agent: z.string().default('/v1/agents'),
  create_session: z.string().default('/v1/agents/{agent_id}/sessions'),
  send_message: z.string().default('/v1/agents/sessions/{session_id}/messages'),
  cancel_session: z.string().default('/v1/agents/sessions/{session_id}/cancel'),
});

// ---------------------------------------------------------------------------
// Configuration Schemas
// ---------------------------------------------------------------------------

export const ClaudeManagedCredentialSchema = z.object({
  /** Credential name visible inside the sandbox */
  name: z.string(),
  /** Env var name holding the value (NEVER the key itself) */
  value_env: z.string(),
  /** Visibility scope */
  scope: z.enum(['session', 'tool', 'environment']).default('session'),
});

export const ClaudeManagedEnvironmentSchema = z.object({
  /** Run in sandboxed container (default true) */
  sandbox: z.boolean().default(true),
  /** Max session duration in hours (H-06 FIX: capped at 24) */
  timeout_hours: z.number().positive().max(24).default(1),
  /** Credentials to inject into sandbox */
  credentials: z.array(ClaudeManagedCredentialSchema).default([]),
});

export const ClaudeManagedConfigSchema = z.object({
  /** Env var name holding API key (NEVER the key itself) */
  api_key_env: z.string().default('ANTHROPIC_API_KEY'),
  /** Anthropic API base URL (must be HTTPS) */
  base_url: z.string().url().default('https://api.anthropic.com'),
  /** API version header */
  api_version: z.string().default('2025-01-01'),
  /** Default sandbox environment */
  default_environment: ClaudeManagedEnvironmentSchema.default(
    ClaudeManagedEnvironmentSchema.parse({})
  ),
  /** Max simultaneous managed sessions */
  max_concurrent_sessions: z.number().int().positive().default(5),
  /** Cost per session-hour in USD [ASSUMED -- R-4] */
  session_hour_rate_usd: z.number().nonnegative().default(0.08),
  /** How session-hours are rounded [ASSUMED -- R-4] */
  billing_granularity: z.enum(['ceil', 'floor', 'proportional']).default('proportional'),
  /** Configurable API paths [ASSUMED -- R-1] */
  endpoints: ClaudeManagedEndpointsSchema.default(
    ClaudeManagedEndpointsSchema.parse({})
  ),
});

// ---------------------------------------------------------------------------
// Inferred Types
// ---------------------------------------------------------------------------

export type ClaudeManagedConfig = z.infer<typeof ClaudeManagedConfigSchema>;
export type ClaudeManagedEnvironment = z.infer<typeof ClaudeManagedEnvironmentSchema>;
export type ClaudeManagedCredential = z.infer<typeof ClaudeManagedCredentialSchema>;
export type ClaudeManagedEndpoints = z.infer<typeof ClaudeManagedEndpointsSchema>;

// ---------------------------------------------------------------------------
// Event Types
// Note: tool_use removed per M-01. Tool use delivered via content_block_start/delta.
// ---------------------------------------------------------------------------

export type ClaudeManagedEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error'
  | 'ping';

export interface ClaudeManagedEvent {
  readonly type: ClaudeManagedEventType;
  readonly data: Record<string, unknown>;
  readonly eventId?: string;
  readonly timestampMs: number;
}

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface ClaudeManagedSessionState {
  readonly sessionId: string;
  readonly agentId: string;
  readonly startedAt: number;    // performance.now()
  readonly status: 'active' | 'completed' | 'failed' | 'cancelled';
  readonly events: readonly ClaudeManagedEvent[];
  readonly totalUsage: SessionUsage;
  readonly model: string;
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface SessionCost {
  readonly sessionHourUsd: number;
  readonly tokenUsd: number;
  readonly totalUsd: number;
}

// ---------------------------------------------------------------------------
// Agent Creation Config
// ---------------------------------------------------------------------------

export interface AgentCreationConfig {
  readonly model: string;
  readonly instructions: string;
  readonly tools?: readonly ToolDefinition[];
  readonly maxTokens?: number;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

export interface ClaudeManagedAdapterInterface {
  createAgent(config: AgentCreationConfig): Promise<string>;
  createSession(agentId: string, env?: Partial<ClaudeManagedEnvironment>): Promise<string>;
  executeTask(sessionId: string, prompt: string, taskType?: string): Promise<import('../src/types/common.js').TaskResult>;
  cleanupSession(sessionId: string): Promise<void>;
  getSessionCost(sessionId: string): SessionCost;
  getActiveSessions(): readonly string[];
  getBudgetRemaining(): number;
  close(): Promise<void>;
}
