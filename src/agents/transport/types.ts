// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10b -- Transport Layer Types
 *
 * Canonical types for protocol-unified agent communication.
 * All agents speak A2ATaskMessage format regardless of transport.
 *
 * Source: Phase 10b LLD Section 2.1
 */

import type { A2AAgentCard } from '../../compatibility/a2a-server.js';

// ---------------------------------------------------------------------------
// A2A v1.0 Task State Machine
// ---------------------------------------------------------------------------

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled';

// ---------------------------------------------------------------------------
// A2A v1.0 Task Message (internal canonical format)
// ---------------------------------------------------------------------------

export interface A2ATaskMessage {
  readonly id: string;
  readonly type: 'task' | 'status' | 'artifact' | 'cancel';
  readonly from: string;
  readonly to: string;
  readonly payload: A2APayload;
  readonly timestamp: string;
  readonly conversationId?: string;
  readonly taskId?: string;
}

export interface A2APayload {
  readonly content: string;
  readonly contentType?: string;
  readonly metadata?: Record<string, unknown>;
  readonly parts?: readonly A2APart[];
}

export interface A2APart {
  readonly kind: 'text' | 'file' | 'data';
  readonly text?: string;
  readonly file?: { readonly name: string; readonly mimeType: string; readonly data: string };
  readonly data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transport Interface
// ---------------------------------------------------------------------------

export interface TransportSendResult {
  readonly messageId: string;
  readonly delivered: boolean;
  readonly latencyMs: number;
  readonly transport: TransportType;
}

export type TransportType = 'local' | 'a2a' | 'hybrid';
export type AgentLocationType = 'local' | 'remote';
export type TransportPreference = 'local' | 'a2a' | 'auto';

export interface AgentTransport {
  send(message: A2ATaskMessage): Promise<TransportSendResult>;
  subscribe(agentId: string, handler: (msg: A2ATaskMessage) => void): () => void;
  getLatency(): number;
  getType(): TransportType;
}

// ---------------------------------------------------------------------------
// Agent Location
// ---------------------------------------------------------------------------

export interface AgentLocationEntry {
  readonly agentId: string;
  readonly location: AgentLocationType;
  readonly url?: string;
  readonly agentCard?: A2AAgentCard;
  readonly transport: TransportPreference;
  readonly avgLatencyMs: number;
  readonly lastSeen: string;
  readonly availableTransports?: readonly string[];
}

// ---------------------------------------------------------------------------
// Transport Configuration
// ---------------------------------------------------------------------------

export interface TransportConfig {
  readonly defaultTransport: TransportPreference;
  readonly a2aTimeoutMs: number;
  readonly retryCount: number;
  readonly retryBaseDelayMs: number;
  readonly fallbackToLocal: boolean;
  readonly enableMetrics: boolean;
}

export const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
  defaultTransport: 'auto',
  a2aTimeoutMs: 30_000,
  retryCount: 2,
  retryBaseDelayMs: 1_000,
  fallbackToLocal: true,
  enableMetrics: true,
} as const;

// ---------------------------------------------------------------------------
// Protocol Metric (for ProtocolRouter performance tracking)
// ---------------------------------------------------------------------------

export interface ProtocolMetric {
  readonly id: string;
  readonly agentId: string;
  readonly transport: TransportType;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly taskType?: string;
  readonly createdAt: string;
}

export interface TransportRecommendation {
  readonly transport: TransportType;
  readonly confidence: number;
  readonly reason: string;
  readonly avgLatencyMs: number;
  readonly successRate: number;
}

// ---------------------------------------------------------------------------
// Public Interfaces for ProtocolRouter & LocationRegistry
// ---------------------------------------------------------------------------

export interface LocationRegistry {
  register(entry: AgentLocationEntry): void;
  lookup(agentId: string): AgentLocationEntry | undefined;
  listRemote(): readonly AgentLocationEntry[];
  listAll(): readonly AgentLocationEntry[];
  discoverFromCard(card: A2AAgentCard, url: string): AgentLocationEntry;
  remove(agentId: string): void;
  isLocal(agentId: string): boolean;
  swapLocation(agentId: string, newLocation: AgentLocationType, url?: string): void;
  onLocationChange(handler: (agentId: string, from: AgentLocationType, to: AgentLocationType) => void): () => void;
}

export interface ProtocolRouter {
  selectTransport(agentId: string, taskType?: string): AgentTransport;
  selectTransportForTeam(agents: readonly { readonly id: string }[]): AgentTransport;
  recordMetric(metric: ProtocolMetric): void;
  getRecommendation(agentId: string): TransportRecommendation;
  pruneOldMetrics(olderThanDays: number): number;
}
