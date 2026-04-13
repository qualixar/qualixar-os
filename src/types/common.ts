// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Shared Types and Zod Schemas
 *
 * All shared Zod schemas and TypeScript types used across phases.
 * Source of truth: REWRITE-SPEC Section 6 (Phase 0), Phase 0 LLD Section 2.1.
 */

import { z } from 'zod';
import type { QosEventType } from './events.js';

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export type QosMode = 'companion' | 'power';

// ---------------------------------------------------------------------------
// Config Schema (Zod v4)
//
// Zod v4 gotcha: .default({}) on a parent z.object does NOT trigger inner
// field defaults. The fix is to define inner schemas separately and use
// innerSchema.parse({}) as the parent default value. This ensures all nested
// defaults resolve correctly when the parent key is omitted entirely.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Provider & Model Catalog Schemas (config-driven provider architecture)
//
// WHY: Qualixar OS must be provider-agnostic. Users may connect via direct API
// keys (Anthropic, OpenAI), Azure AI Foundry, AWS Bedrock, Google Vertex,
// or local Ollama. The provider configuration lives in config, not source.
//
// BACKWARD COMPAT: If `providers` is empty, the hardcoded MODEL_CATALOG
// defaults still work with env vars (ANTHROPIC_API_KEY, etc.).
// Config-defined catalog entries EXTEND, never replace, defaults.
// ---------------------------------------------------------------------------

export const ProviderConfigSchema = z.object({
  /** Provider SDK/protocol type */
  type: z.enum([
    'anthropic', 'openai', 'azure-openai', 'google', 'ollama',
    'bedrock', 'openrouter', 'groq', 'mistral', 'deepseek',
    'together', 'fireworks', 'cerebras', 'cohere', 'custom',
    'lmstudio', 'llamacpp', 'vllm', 'huggingface-tgi',
    'claude-managed',
  ]),
  /** Base URL (required for azure-openai, ollama) */
  endpoint: z.string().optional(),
  /** Environment variable name holding the endpoint URL (resolved at load time) */
  endpoint_env: z.string().optional(),
  /** Environment variable name holding the API key (never the key itself) */
  api_key_env: z.string().optional(),
  /** API version string (for azure-openai) */
  api_version: z.string().optional(),
}).transform((cfg) => {
  // SCN-001 Fix: Resolve endpoint_env to endpoint if endpoint is not set directly.
  // Config YAML uses `endpoint_env: AZURE_AI_ENDPOINT` which needs env var resolution.
  if (!cfg.endpoint && cfg.endpoint_env) {
    const resolved = process.env[cfg.endpoint_env];
    if (resolved) {
      return { ...cfg, endpoint: resolved };
    }
  }
  return cfg;
});

export const ModelEntrySchema = z.object({
  /** Model identifier, e.g. "azure/claude-sonnet-4-6" or "local/llama3" */
  name: z.string(),
  /** Must match a key in the config's providers map */
  provider: z.string(),
  /** Deployment/model name at the provider (defaults to model name) */
  deployment: z.string().optional(),
  /** Quality score normalized to [0, 1]. Higher = better. */
  quality_score: z.number().min(0).max(1).default(0.7),
  /** Cost in USD per input token */
  cost_per_input_token: z.number().nonnegative().default(0),
  /** Cost in USD per output token */
  cost_per_output_token: z.number().nonnegative().default(0),
  /** Maximum token output capacity */
  max_tokens: z.number().int().positive().default(4096),
});

const ModelsSchema = z.object({
  primary: z.string().default('claude-sonnet-4-6'),
  fallback: z.string().default('gpt-4.1-mini'),
  judge: z.string().optional(),
  local: z.string().optional(),
  /** User-defined model catalog entries that extend the default catalog */
  catalog: z.array(ModelEntrySchema).default([]),
});

const BudgetSchema = z.object({
  max_usd: z.number().nonnegative().default(100),
  warn_pct: z.number().min(0).max(1).default(0.8),
  per_task_max: z.number().nonnegative().optional(),
});

const SecuritySchema = z.object({
  container_isolation: z.boolean().default(false),
  policy_path: z.string().optional(),
  allowed_paths: z.array(z.string()).default(['./']),
  denied_commands: z.array(z.string()).default(['rm -rf', 'sudo']),
});

const EmbeddingSchema = z.object({
  provider: z.string().default('azure'),
  model: z.string().default('text-embedding-3-large'),
  dimensions: z.number().int().positive().default(3072),
});

const MemorySchema = z.object({
  enabled: z.boolean().default(true),
  auto_invoke: z.boolean().default(true),
  max_ram_mb: z.number().int().nonnegative().default(50),
  embedding: EmbeddingSchema.default(EmbeddingSchema.parse({})),
});

const DashboardSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().min(1).max(65535).default(3333),
});

const HttpChannelSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().int().min(1).max(65535).default(3000),
});

const TelegramChannelSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().optional(),
});

const DiscordChannelSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().optional(),
});

const WebhookChannelSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
});

const ChannelsSchema = z.object({
  mcp: z.boolean().default(true),
  http: HttpChannelSchema.default(HttpChannelSchema.parse({})),
  telegram: TelegramChannelSchema.default(TelegramChannelSchema.parse({})),
  discord: DiscordChannelSchema.default(DiscordChannelSchema.parse({})),
  webhook: WebhookChannelSchema.default(WebhookChannelSchema.parse({})),
});

const ObservabilitySchema = z.object({
  otel_endpoint: z.string().optional(),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const DbSchema = z.object({
  path: z.string().default('~/.qualixar-os/qos.db'),
});

const ExecutionSchema = z.object({
  /** Maximum output tokens for agent LLM calls (1024-32768, default 16384) */
  max_output_tokens: z.number().int().min(1024).max(32768).default(16384),
  /** Agent quality tier: balanced (cost/quality ratio), high (better models), maximum (best available) */
  agent_quality: z.enum(['balanced', 'high', 'maximum']).default('balanced'),
  /** Allow agents to execute shell commands (security risk — disabled by default) */
  enable_shell: z.boolean().default(false),
});

/** G-10: Schema for config-persisted MCP tool connectors */
const ToolConnectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.enum(['stdio', 'streamable-http']).default('stdio'),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
}).passthrough();

export const QosConfigSchema = z.object({
  mode: z.enum(['companion', 'power']).default('companion'),
  /** Model routing strategy: quality (best model), balanced (quality/cost ratio), cost (cheapest) */
  routing: z.enum(['quality', 'balanced', 'cost']).default('balanced'),
  /** Named provider configurations (e.g. { azure: { type: 'azure-openai', ... } }) */
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  models: ModelsSchema.default(ModelsSchema.parse({})),
  budget: BudgetSchema.default(BudgetSchema.parse({})),
  security: SecuritySchema.default(SecuritySchema.parse({})),
  memory: MemorySchema.default(MemorySchema.parse({})),
  dashboard: DashboardSchema.default(DashboardSchema.parse({})),
  channels: ChannelsSchema.default(ChannelsSchema.parse({})),
  observability: ObservabilitySchema.default(ObservabilitySchema.parse({})),
  db: DbSchema.default(DbSchema.parse({})),
  /** G-10: Config-persisted MCP tool connectors for dashboard management */
  toolConnectors: z.array(ToolConnectorSchema).default([]),
  /** G-14: Agent workspace configuration for file output */
  workspace: z.object({
    /** Custom base directory for agent workspaces (defaults to ~/.qualixar-os/workspaces) */
    default_dir: z.string().optional(),
  }).default({}),
  /** Agent execution settings (token limits, quality, shell access) */
  execution: ExecutionSchema.default(ExecutionSchema.parse({})),
});

export type QosConfig = z.infer<typeof QosConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelEntry = z.infer<typeof ModelEntrySchema>;

// ---------------------------------------------------------------------------
// Task Types
// ---------------------------------------------------------------------------

export interface TaskOptions {
  readonly prompt: string;
  readonly type?: 'code' | 'research' | 'analysis' | 'creative' | 'custom';
  readonly mode?: QosMode;
  readonly budget_usd?: number;
  readonly profile?: string;
  readonly topology?: string;
  readonly simulate?: boolean;
  readonly stream?: boolean;
  /** Internal task ID set by orchestrator for agent-task FK linkage. */
  readonly taskId?: string;
  /** Directory where task output files are saved (optional, from dashboard). */
  readonly workingDir?: string;
  /** Max output tokens for agent LLM calls (from execution config, default 16384). */
  readonly maxOutputTokens?: number;
}

export interface TaskResult {
  readonly taskId: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly output: string;
  readonly artifacts: readonly Artifact[];
  readonly cost: CostSummary;
  readonly judges: readonly JudgeVerdict[];
  readonly teamDesign: TeamDesign | null;
  readonly duration_ms: number;
  readonly metadata: Record<string, unknown>;
}

export interface Artifact {
  readonly path: string;
  readonly content: string;
  readonly type: 'code' | 'text' | 'json' | 'image' | 'binary';
}

// ---------------------------------------------------------------------------
// Cost Types
// ---------------------------------------------------------------------------

export interface CostSummary {
  readonly total_usd: number;
  readonly by_model: Record<string, number>;
  readonly by_agent: Record<string, number>;
  readonly by_category: Record<string, number>;
  readonly budget_remaining_usd: number;
}

export interface CostEntry {
  readonly id: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly model: string;
  readonly amountUsd: number;
  readonly category: string;
  readonly createdAt: string;
}

export interface ModelCallEntry {
  readonly id: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly status: 'success' | 'error';
  readonly error?: string;
  readonly createdAt: string;
}

export interface BudgetStatus {
  readonly allowed: boolean;
  readonly remaining_usd: number;
  readonly warning: boolean;
  readonly message?: string;
}

// ---------------------------------------------------------------------------
// Model Types (defined here, used by Phase 1)
// ---------------------------------------------------------------------------

export interface ModelRequest {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly taskType?: string;
  readonly budgetRemaining?: number;
  readonly quality?: 'low' | 'medium' | 'high';
  readonly taskId?: string;
  readonly agentId?: string;
  readonly timeout?: number;
  /** Tool schemas to send to the LLM for tool-use/function-calling */
  readonly tools?: readonly { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown> }[];
  /** Messages history for multi-turn tool-use conversations */
  readonly messages?: readonly { readonly role: string; readonly content: unknown }[];
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ModelResponse {
  readonly content: string;
  readonly model: string;
  readonly provider: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly toolCalls?: readonly ToolCall[];
}

// ---------------------------------------------------------------------------
// Feature Gates (defined here, implemented by Phase 1)
// ---------------------------------------------------------------------------

export interface FeatureGates {
  readonly topologies: readonly string[];
  readonly maxJudges: number;
  readonly routingStrategies: readonly string[];
  readonly rlEnabled: boolean;
  readonly containerIsolation: boolean;
  readonly dashboard: boolean;
  readonly channels: readonly string[];
  readonly simulationEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Event Type (references QosEventType from events.ts)
// ---------------------------------------------------------------------------

export interface QosEvent {
  readonly id: number;
  readonly type: QosEventType;
  readonly payload: Record<string, unknown>;
  readonly source: string;
  readonly taskId?: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Judge Types (forward-declared, implemented by Phase 3)
// ---------------------------------------------------------------------------

export interface JudgeVerdict {
  readonly judgeModel: string;
  readonly verdict: 'approve' | 'reject' | 'revise';
  readonly score: number;
  readonly feedback: string;
  readonly issues: readonly JudgeIssue[];
  readonly durationMs: number;
}

export interface JudgeIssue {
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly category: string;
  readonly description: string;
  readonly location?: string;
  readonly suggestedFix?: string;
}

// ---------------------------------------------------------------------------
// Quality + RL Types (Phase 3) -- REWRITE-SPEC Section 6
// ---------------------------------------------------------------------------

export interface EvalCriterion {
  readonly name: string;
  readonly description: string;
  readonly weight: number;
}

export interface JudgeProfile {
  readonly name: string;
  readonly criteria: readonly EvalCriterion[];
  readonly weights: Record<string, number>;
  readonly minJudges: number;
  readonly consensusAlgorithm: 'weighted_majority' | 'bft_inspired' | 'raft_inspired';
  readonly timeoutMs: number;
}

export interface ConsensusResult {
  readonly algorithm: 'weighted_majority' | 'bft_inspired' | 'raft_inspired';
  readonly decision: 'approve' | 'reject' | 'revise';
  readonly confidence: number;
  readonly entropy: number;
  readonly agreementRatio: number;
}

// ---------------------------------------------------------------------------
// Team Design Types (forward-declared, implemented by Phase 4)
// ---------------------------------------------------------------------------

export interface TeamDesign {
  readonly id: string;
  readonly taskType: string;
  readonly topology: string;
  readonly agents: readonly AgentRole[];
  readonly reasoning: string;
  readonly estimatedCostUsd: number;
  readonly version: number;
  /** Optional topology-specific configuration (e.g., hybrid routing policy). */
  readonly topologyConfig?: Record<string, unknown>;
  /** Optional Forge-designed judge evaluation profile (G-08). */
  readonly judgeProfile?: ForgeJudgeProfile;
}

/** Forge-designed judge profile for task-specific evaluation criteria (G-08). */
export interface ForgeJudgeProfile {
  readonly criteria: readonly { readonly name: string; readonly weight: number }[];
  readonly strictness: 'strict' | 'balanced' | 'lenient';
  readonly focusAreas: readonly string[];
}

export interface AgentRole {
  readonly role: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly dependsOn?: readonly string[];
}

// ---------------------------------------------------------------------------
// Security Types (Phase 2) -- REWRITE-SPEC Section 6
// ---------------------------------------------------------------------------

export interface SecurityEngine {
  evaluate(action: SecurityAction): Promise<SecurityDecision>;
  getContainerManager(): ContainerManager;
  getCredentialVault(): CredentialVault;
  getPolicyEngine(): PolicyEngine;
}

export interface SecurityAction {
  readonly type: 'file_access' | 'shell_command' | 'network_request' | 'credential_access' | 'skill_load';
  readonly details: Record<string, unknown>;
  readonly agentId?: string;
  readonly taskId?: string;
}

export interface SecurityDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly layer: 'network' | 'filesystem' | 'process' | 'inference';
  readonly severity?: 'info' | 'warning' | 'high' | 'critical';
}

export interface ContainerManager {
  create(config: ContainerConfig): Promise<ContainerHandle>;
  destroy(id: string): Promise<void>;
  isAvailable(): boolean;
  getFallbackMode(): 'sandbox' | 'none';
}

export interface ContainerConfig {
  readonly image?: string;
  readonly cpuLimit?: number;
  readonly memoryLimitMb?: number;
  readonly timeoutSeconds?: number;
  readonly networkEnabled?: boolean;
  readonly volumes?: readonly VolumeMount[];
}

export interface VolumeMount {
  readonly hostPath: string;
  readonly containerPath: string;
  readonly readOnly?: boolean;
}

export interface ContainerHandle {
  readonly id: string;
  executeCommand(command: string): Promise<CommandResult>;
  destroy(): Promise<void>;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface CredentialVault {
  get(key: string): string | undefined;
  set(key: string, value: string, source: 'env' | 'keychain' | 'config'): void;
  list(): readonly string[];
  hasKey(key: string): boolean;
}

export interface PolicyEngine {
  loadPolicy(yamlPath: string): void;
  evaluate(action: SecurityAction): SecurityDecision;
  getPolicies(): readonly PolicyRule[];
}

export interface PolicyRule {
  readonly name: string;
  readonly action: 'allow' | 'deny' | 'warn';
  readonly conditions: Record<string, unknown>;
  readonly priority: number;
}

export interface SkillScanner {
  scan(skillPath: string): ScanResult;
  scanContent(content: string): ScanResult;
}

export interface ScanResult {
  readonly safe: boolean;
  readonly issues: readonly ScanIssue[];
  readonly riskScore: number;
}

export interface ScanIssue {
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly pattern: string;
  readonly location: string;
  readonly description: string;
}

export interface AuditEvent {
  readonly event_type: string;
  readonly severity: 'info' | 'warning' | 'high' | 'critical';
  readonly details: string;
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Memory Layer Type (used by Phase 5)
// ---------------------------------------------------------------------------

export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'procedural';

// ---------------------------------------------------------------------------
// JudgeResult (aggregate result, used by Phase 3 + Phase 6)
// ---------------------------------------------------------------------------

export interface JudgeResult {
  readonly taskId: string;
  readonly round: number;
  readonly verdicts: readonly JudgeVerdict[];
  readonly consensus: ConsensusResult;
  readonly issues: readonly { readonly severity: string; readonly description: string }[];
}

// ---------------------------------------------------------------------------
// Phase 8: Compatibility Interfaces (REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface AgentSpec {
  readonly version: 1;
  readonly name: string;
  readonly description: string;
  readonly roles: readonly AgentRole[];
  readonly tools: readonly ToolSpec[];
  readonly config: Record<string, unknown>;
  readonly source: {
    readonly format: 'openclaw' | 'deerflow' | 'nemoclaw' | 'gitagent' | 'qos';
    readonly originalPath?: string;
  };
}

export interface ClawReader {
  canRead(path: string): boolean;
  read(path: string): Promise<AgentSpec>;
  getFormat(): string;
}

export interface ImportedAgent {
  readonly id: string;
  readonly sourceFormat: 'openclaw' | 'deerflow' | 'nemoclaw' | 'gitagent';
  readonly originalPath: string;
  readonly agentSpec: AgentSpec;
  readonly version: number;
  readonly createdAt: string;
}
