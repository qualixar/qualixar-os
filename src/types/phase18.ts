// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Phase 18: Dashboard Command Center Types
 *
 * All interfaces for provider catalog, credentials, embedding config,
 * channel config, workflow deployments, and provider health.
 * HR-1: Every interface is readonly + immutable.
 */

// ---------------------------------------------------------------------------
// Provider Catalog Types
// ---------------------------------------------------------------------------

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'azure-openai'
  | 'google'
  | 'ollama'
  | 'bedrock'
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'cohere'
  | 'custom';

export interface ProviderCatalogEntry {
  readonly id: ProviderType;
  readonly displayName: string;
  readonly type: ProviderType;
  readonly icon: string;
  readonly description: string;
  readonly supportsEmbeddings: boolean;
  readonly configFields: readonly ProviderConfigField[];
  readonly defaultApiKeyEnv: string;
  readonly defaultEndpoint: string | null;
  readonly embeddingModels: readonly EmbeddingModelInfo[];
}

export interface ProviderConfigField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'password' | 'url' | 'number' | 'select';
  readonly required: boolean;
  readonly placeholder: string;
  readonly helpText: string;
  readonly options?: readonly string[];
  readonly supportsEnvRef?: boolean;
}

export interface EmbeddingModelInfo {
  readonly modelId: string;
  readonly displayName: string;
  readonly dimensions: number;
  readonly maxTokens: number;
}

// ---------------------------------------------------------------------------
// Credential Store Types
// ---------------------------------------------------------------------------

export interface StoredCredential {
  readonly id: string;
  readonly providerName: string;
  readonly storageMode: 'direct' | 'env_ref';
  readonly encryptedValue: string;
  readonly iv: string | null;
  readonly authTag: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CredentialInput {
  readonly providerName: string;
  readonly storageMode: 'direct' | 'env_ref';
  readonly value: string;
}

export interface CredentialRef {
  readonly id: string;
  readonly providerName: string;
  readonly storageMode: 'direct' | 'env_ref';
  readonly displayValue: string;
  readonly isSet: boolean;
  readonly createdAt: string;
}

export interface CredentialStore {
  store(input: CredentialInput): StoredCredential;
  resolve(providerName: string): string | undefined;
  list(): readonly CredentialRef[];
  remove(providerName: string): boolean;
  has(providerName: string): boolean;
}

// ---------------------------------------------------------------------------
// Embedding Provider Config Types
// ---------------------------------------------------------------------------

export interface EmbeddingProviderConfig {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  readonly tested: boolean;
  readonly lastTestResult: EmbeddingTestResult | null;
}

export interface EmbeddingTestResult {
  readonly success: boolean;
  readonly dimensions: number | null;
  readonly latencyMs: number;
  readonly error: string | null;
  readonly testedAt: string;
}

// ---------------------------------------------------------------------------
// Channel Configuration Types
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  readonly channelId: string;
  readonly type: 'mcp' | 'http' | 'discord' | 'telegram' | 'webhook' | 'a2a' | 'sse';
  readonly enabled: boolean;
  readonly status: 'connected' | 'disconnected' | 'error' | 'unknown';
  readonly lastMessageAt: string | null;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface ChannelTestResult {
  readonly channelId: string;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly error: string | null;
  readonly testedAt: string;
}

export interface DiscordChannelSettings {
  readonly tokenEnv: string;
  readonly guildIds: readonly string[];
  readonly commandPrefix: string;
}

export interface TelegramChannelSettings {
  readonly tokenEnv: string;
  readonly allowedChatIds: readonly string[];
  readonly webhookUrl: string | null;
}

export interface WebhookChannelSettings {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly authType: 'bearer' | 'basic' | 'none';
  readonly retryPolicy: {
    readonly maxRetries: number;
    readonly backoffMs: number;
  };
}

export interface HttpChannelSettings {
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly rateLimit: number;
}

// ---------------------------------------------------------------------------
// Workflow Deployment Types
// ---------------------------------------------------------------------------

export interface WorkflowDeployment {
  readonly id: string;
  readonly blueprintId: string;
  readonly blueprintName: string;
  readonly status: 'active' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  readonly triggerType: 'once' | 'cron' | 'event';
  readonly cronExpression: string | null;
  readonly triggerEvent: string | null;
  readonly lastTaskId: string | null;
  readonly lastRunAt: string | null;
  readonly lastRunStatus: 'success' | 'failure' | null;
  readonly runCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeploymentInput {
  readonly blueprintId: string;
  readonly triggerType: 'once' | 'cron' | 'event';
  readonly cronExpression?: string;
  readonly triggerEvent?: string;
}

// ---------------------------------------------------------------------------
// Provider Health Types
// ---------------------------------------------------------------------------

export interface ProviderHealth {
  readonly providerName: string;
  readonly status: 'healthy' | 'degraded' | 'down' | 'unknown';
  readonly avgLatencyMs: number;
  readonly successRate: number;
  readonly totalCalls: number;
  readonly costPer1kTokens: number;
  readonly lastCheckedAt: string;
}
