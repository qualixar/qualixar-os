// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Dashboard Types
 * Extracted from store.ts to keep store under 800-line cap.
 * All dashboard domain types live here. Store re-exports them.
 */

// ---------------------------------------------------------------------------
// Phase 7 Types (original dashboard)
// ---------------------------------------------------------------------------

/** GET /api/tasks -> { tasks: TaskEntry[] } */
export interface TaskEntry {
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly created_at: string;
  readonly heartbeat?: {
    readonly status: string;
    readonly lastSeen: string | null;
    readonly ageMs: number | null;
  } | null;
}

/** GET /api/agents -> { agents: AgentEntry[] } */
export interface AgentEntry {
  readonly id: string;
  readonly status: string;
  readonly role: string;
  readonly model?: string;
  readonly costUsd?: number;
  readonly task_id?: string;
}

/** GET /api/judges/results -> { results: JudgeResult[] } */
export interface JudgeResult {
  readonly judgeModel: string;
  readonly verdict: string;
  readonly score: number;
  readonly feedback?: string;
  readonly issues?: ReadonlyArray<{
    readonly severity: string;
    readonly category: string;
    readonly description: string;
    readonly suggestedFix?: string;
  }>;
  readonly durationMs?: number;
}

/** GET /api/cost -> { cost: CostData } */
export interface CostData {
  readonly total_usd: number;
  readonly by_model: Record<string, number>;
  readonly by_agent: Record<string, number>;
  readonly by_category: Record<string, number>;
  readonly budget_remaining_usd: number;
}

/** GET /api/forge/designs -> { designs: ForgeDesign[] } */
export interface ForgeDesign {
  readonly id?: string;
  readonly topology: string;
  readonly taskType?: string;
  readonly agents?: ReadonlyArray<{
    readonly role: string;
    readonly model: string;
    readonly systemPrompt?: string;
  }>;
  readonly reasoning?: string;
  readonly estimatedCostUsd?: number;
  readonly version?: number;
}

/** GET /api/memory/stats -> { stats: MemoryStats } */
export interface MemoryStats {
  readonly totalEntries: number;
  readonly byLayer: Record<string, number>;
  readonly avgTrustScore: number;
  readonly beliefNodes: number;
  readonly beliefEdges: number;
  readonly ramUsageMb: number;
}

/** GET /api/swarm/topologies -> { topologies: string[] } */
export type SwarmTopologies = readonly string[];

/** GET /api/rl/stats -> { stats: RLStats } */
export interface RLStats {
  readonly totalOutcomes: number;
  readonly strategyCounts: Record<string, number>;
  readonly avgRewardByStrategy: Record<string, number>;
  readonly topStrategies: Record<string, string>;
}

/** GET /api/system/events -> { events: EventEntry[] } */
export interface EventEntry {
  readonly id: number;
  readonly type: string;
  readonly payload: string;
  readonly source: string;
  readonly task_id: string | null;
  readonly created_at: string;
}

/** GET /api/system/models -> { models: ModelEntry[] } */
export interface ModelEntry {
  readonly name: string;
  readonly provider: string;
  readonly qualityScore: number;
  readonly costPerInputToken: number;
  readonly costPerOutputToken: number;
  readonly maxTokens: number;
  readonly available: boolean;
}

/** GET /api/system/config -> { config: SystemConfig } */
export interface SystemConfig {
  readonly mode?: string;
  readonly budget?: { max_usd?: number; warn_pct?: number; per_task_max?: number };
  readonly [key: string]: unknown;
}

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LogEntry {
  readonly id: number;
  readonly type: string;
  readonly message: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Phase 14 Types — Chat, Lab, Traces, Flows
// ---------------------------------------------------------------------------

/** File attachment in a message */
export interface FileAttachment {
  readonly id: string;
  readonly name: string;
  readonly type: string; // MIME type
  readonly size: number; // bytes
  readonly url?: string; // blob URL for preview
  readonly thumbnailUrl?: string;
}

/** HitL approval request embedded in chat */
export interface HitLRequest {
  readonly id: string;
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly status: 'pending' | 'approved' | 'rejected';
}

/** Parts-based message model (per LLD C-1 audit fix) */
export type MessagePart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'reasoning'; readonly text: string; readonly durationMs?: number }
  | { readonly type: 'tool-call'; readonly call: ToolCallData }
  | { readonly type: 'tool-result'; readonly toolCallId: string; readonly result: unknown }
  | { readonly type: 'error'; readonly message: string; readonly code?: string }
  | { readonly type: 'file'; readonly attachment: FileAttachment }
  | { readonly type: 'image'; readonly attachment: FileAttachment }
  | { readonly type: 'hitl-request'; readonly request: HitLRequest };

export interface ToolCallData {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly input: Record<string, unknown>;
  readonly output?: string;
  readonly status: 'pending' | 'calling' | 'completed' | 'error';
  readonly durationMs?: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly parts: readonly MessagePart[];
  readonly status: 'sending' | 'sent' | 'streaming' | 'completed' | 'error';
  readonly timestamp: string;
  readonly taskId?: string;
  readonly cost?: number;
  readonly model?: string;
  readonly attachments?: readonly FileAttachment[];
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly latencyMs?: number;
}

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
  readonly status: 'active' | 'archived';
  readonly model?: string;
  readonly topology?: string;
  readonly parentId?: string; // for thread cloning
}

export interface StreamingState {
  readonly conversationId: string;
  readonly messageId: string;
  readonly parts: readonly MessagePart[];
  readonly currentText: string;
  readonly currentThinking: string;
  readonly activeTool: ToolCallData | null;
  readonly status: 'streaming' | 'tool_calling' | 'thinking';
}

export interface ExperimentEntry {
  readonly id: string;
  readonly name: string;
  readonly status: 'draft' | 'running' | 'completed' | 'failed';
  readonly createdAt: string;
}

export interface TraceSummary {
  readonly traceId: string;
  readonly rootSpanName: string;
  readonly durationMs: number;
  readonly spanCount: number;
  readonly status: 'ok' | 'error';
  readonly startTime: string;
}

export interface TraceMetrics {
  readonly totalTraces: number;
  readonly avgDurationMs: number;
  readonly p95LatencyMs: number;
  readonly errorRate: number;
}

export interface FlowDefinitionEntry {
  readonly id: string;
  readonly name: string;
  readonly topology: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 15 Types — Connectors, Logs, Gate, Datasets
// ---------------------------------------------------------------------------

export interface ConnectorEntry {
  readonly id: string;
  readonly name: string;
  readonly type: 'mcp' | 'api' | 'webhook';
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly url?: string;
  readonly toolCount: number;
  readonly lastSeen: string;
}

export interface StructuredLogEntry {
  readonly id: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly source: string;
  readonly message: string;
  readonly timestamp: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReviewItem {
  readonly id: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly content: string;
  readonly status: 'pending' | 'approved' | 'rejected' | 'revised';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly feedback?: string;
}

export interface DatasetEntry {
  readonly id: string;
  readonly name: string;
  readonly format: 'csv' | 'json' | 'jsonl';
  readonly rowCount: number;
  readonly columnCount: number;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Phase 16 Types — Vectors, Blueprints, Brain
// ---------------------------------------------------------------------------

export interface VectorEntry {
  readonly id: string;
  readonly content: string;
  readonly embedding?: readonly number[];
  readonly source: string;
  readonly similarity?: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
}

export interface VectorStoreStats {
  readonly totalVectors: number;
  readonly dimensions: number;
  readonly indexType: string;
  readonly sizeBytes: number;
}

export interface BlueprintEntry {
  readonly id: string;
  readonly name: string;
  readonly type: 'agent' | 'topology' | 'workflow' | 'pipeline';
  readonly description: string;
  readonly topology?: string;
  readonly agentCount?: number;
  readonly tags: readonly string[];
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PromptEntry {
  readonly id: string;
  readonly name: string;
  readonly category: 'system' | 'task' | 'few-shot' | 'judge';
  readonly content: string;
  readonly version: number;
  readonly usageCount: number;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Live Execution Streaming Types (Swarm Tab)
// ---------------------------------------------------------------------------

/** Pipeline steps in the Qualixar OS execution flow. */
export type PipelineStep = 'memory' | 'forge' | 'agents' | 'judge' | 'output';

/** Status of a single pipeline step. */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** A single real-time execution event captured from SSE. */
export interface LiveExecutionEvent {
  readonly id: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

/** State of an individual agent within the running pipeline. */
export interface LiveAgentState {
  readonly agentId: string;
  readonly role: string;
  readonly status: 'spawned' | 'running' | 'completed' | 'failed';
  readonly output?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
}

/** Full live execution state for the Swarm tab. */
export interface LiveExecution {
  readonly taskId: string | null;
  readonly pipelineSteps: ReadonlyArray<{
    readonly step: PipelineStep;
    readonly status: StepStatus;
  }>;
  readonly activeAgents: readonly LiveAgentState[];
  readonly eventLog: readonly LiveExecutionEvent[];
}
