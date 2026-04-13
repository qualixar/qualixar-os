// TODO: Split into smaller modules (audit finding M-20). This file exceeds the 800-line cap.
// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Dashboard Zustand Store
 * Central state management with REST polling + WebSocket real-time updates.
 * Types imported from ./types.ts (extracted for 800-line cap).
 */

import { create } from 'zustand';

// Re-export all types so existing imports from '../store.js' still work
export type {
  TaskEntry, AgentEntry, JudgeResult, CostData, ForgeDesign,
  MemoryStats, SwarmTopologies, RLStats, EventEntry, ModelEntry,
  SystemConfig, WSStatus, LogEntry,
  FileAttachment, HitLRequest,
  MessagePart, ToolCallData, ChatMessage, Conversation, StreamingState,
  ExperimentEntry, TraceSummary, TraceMetrics, FlowDefinitionEntry,
  ConnectorEntry, StructuredLogEntry, ReviewItem, DatasetEntry,
  VectorEntry, VectorStoreStats, BlueprintEntry, PromptEntry,
  PipelineStep, StepStatus, LiveExecutionEvent, LiveAgentState, LiveExecution,
} from './types.js';

import type {
  TaskEntry, AgentEntry, JudgeResult, CostData, ForgeDesign,
  MemoryStats, SwarmTopologies, RLStats, EventEntry, ModelEntry, SystemConfig,
  WSStatus, LogEntry, FileAttachment, HitLRequest,
  MessagePart, ToolCallData, ChatMessage,
  Conversation, StreamingState, ExperimentEntry, TraceSummary,
  TraceMetrics, FlowDefinitionEntry,
  ConnectorEntry, StructuredLogEntry, ReviewItem, DatasetEntry,
  VectorEntry, VectorStoreStats, BlueprintEntry, PromptEntry,
  LiveExecution, LiveExecutionEvent, LiveAgentState,
} from './types.js';

// ---------------------------------------------------------------------------
// State Shape
// ---------------------------------------------------------------------------

export interface DashboardState {
  // Data slices
  readonly tasks: readonly TaskEntry[];
  readonly agents: readonly AgentEntry[];
  readonly judgeResults: readonly JudgeResult[];
  readonly cost: CostData;
  readonly forgeDesigns: readonly ForgeDesign[];
  readonly memoryStats: MemoryStats;
  readonly swarmTopologies: SwarmTopologies;
  readonly rlStats: RLStats;
  readonly events: readonly EventEntry[];
  readonly logs: readonly LogEntry[];
  readonly wsStatus: WSStatus;
  readonly models: readonly ModelEntry[];
  readonly systemConfig: SystemConfig;

  // Phase 14 data slices
  readonly conversations: readonly Conversation[];
  readonly activeConversationId: string | null;
  readonly chatMessages: readonly ChatMessage[];
  readonly streamingState: StreamingState | null;
  readonly selectedModel: string | null;
  readonly selectedTopology: string;
  readonly experiments: readonly ExperimentEntry[];
  readonly traceSummaries: readonly TraceSummary[];
  readonly traceMetrics: TraceMetrics;
  readonly flowDefinitions: readonly FlowDefinitionEntry[];

  // Phase 15 data slices
  readonly connectors: readonly ConnectorEntry[];
  readonly structuredLogs: readonly StructuredLogEntry[];
  readonly reviewItems: readonly ReviewItem[];
  readonly datasets: readonly DatasetEntry[];

  // Phase 16 data slices
  readonly vectors: readonly VectorEntry[];
  readonly vectorStats: VectorStoreStats;
  readonly blueprints: readonly BlueprintEntry[];
  readonly prompts: readonly PromptEntry[];

  // Live execution streaming (Swarm tab)
  readonly liveExecution: LiveExecution;

  // REST fetch actions
  fetchTasks: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  fetchCost: () => Promise<void>;
  fetchJudgeResults: () => Promise<void>;
  fetchForgeDesigns: () => Promise<void>;
  fetchMemoryStats: () => Promise<void>;
  fetchSwarmTopologies: () => Promise<void>;
  fetchRLStats: () => Promise<void>;
  fetchEvents: () => Promise<void>;
  fetchModels: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchAll: () => Promise<void>;

  // WebSocket + actions
  updateWsStatus: (status: WSStatus) => void;
  handleWsEvent: (event: Record<string, unknown>) => void;
  addLog: (type: string, message: string) => void;
  submitTask: (prompt: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateConfig: (updates: Record<string, unknown>) => Promise<void>;

  // Phase 14 actions
  fetchConversations: () => Promise<void>;
  fetchChatMessages: (conversationId: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  sendChatMessage: (conversationId: string, content: string, model?: string) => Promise<void>;
  createConversation: () => Promise<string>;
  appendStreamingToken: (text: string) => void;
  fetchExperiments: () => Promise<void>;
  fetchTraceSummaries: () => Promise<void>;
  fetchTraceMetrics: () => Promise<void>;
  fetchFlowDefinitions: () => Promise<void>;

  // Chat enhancements — model/topology, files, conversation management, HitL
  retryChatMessage: (conversationId: string, messageId: string) => Promise<void>;
  cancelGeneration: (conversationId: string) => Promise<void>;
  setSelectedModel: (model: string | null) => void;
  setSelectedTopology: (topology: string) => void;
  uploadFiles: (conversationId: string, files: File[]) => Promise<readonly FileAttachment[]>;
  sendChatMessageWithAttachments: (conversationId: string, content: string, attachments: readonly FileAttachment[], model?: string, topology?: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  cloneConversation: (id: string) => Promise<string>;
  approveHitL: (conversationId: string, requestId: string) => Promise<void>;
  rejectHitL: (conversationId: string, requestId: string) => Promise<void>;

  // Phase 15 actions
  fetchConnectors: () => Promise<void>;
  fetchStructuredLogs: (filters?: { level?: string; source?: string; limit?: number }) => Promise<void>;
  fetchReviewItems: () => Promise<void>;
  updateReviewItem: (id: string, status: string, feedback?: string) => Promise<void>;
  fetchDatasets: () => Promise<void>;

  // Phase 16 actions
  fetchVectors: (query?: string) => Promise<void>;
  fetchVectorStats: () => Promise<void>;
  fetchBlueprints: () => Promise<void>;
  fetchPrompts: () => Promise<void>;

  // Live execution streaming actions (Swarm tab)
  pushLiveEvent: (type: string, payload: Record<string, unknown>) => void;
  resetLiveExecution: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COST: CostData = {
  total_usd: 0,
  by_model: {},
  by_agent: {},
  by_category: {},
  budget_remaining_usd: -1,
};

const DEFAULT_MEMORY: MemoryStats = {
  totalEntries: 0,
  byLayer: {},
  avgTrustScore: 0,
  beliefNodes: 0,
  beliefEdges: 0,
  ramUsageMb: 0,
};

const DEFAULT_RL: RLStats = {
  totalOutcomes: 0,
  strategyCounts: {},
  avgRewardByStrategy: {},
  topStrategies: {},
};

const DEFAULT_LIVE_EXECUTION: LiveExecution = {
  taskId: null,
  pipelineSteps: [
    { step: 'memory', status: 'pending' },
    { step: 'forge', status: 'pending' },
    { step: 'agents', status: 'pending' },
    { step: 'judge', status: 'pending' },
    { step: 'output', status: 'pending' },
  ],
  activeAgents: [],
  eventLog: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let logCounter = 0;

// DEF-036: AbortControllers for cancellable fetch (prevents stale responses on rapid tab switching)
let tasksAbort: AbortController | undefined;
let agentsAbort: AbortController | undefined;
let costAbort: AbortController | undefined;

// ---------------------------------------------------------------------------
// Session Persistence — save/restore UI preferences to localStorage
// ---------------------------------------------------------------------------

const SESSION_KEY = 'qos-dashboard-session';

function loadSession(): Partial<DashboardState> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<DashboardState>;
  } catch (err) { console.debug('Store: session load error:', err); return {}; }
}

function saveSession(state: DashboardState): void {
  try {
    const toSave = {
      selectedModel: state.selectedModel,
      selectedTopology: state.selectedTopology,
      activeConversationId: state.activeConversationId,
      systemConfig: state.systemConfig,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(toSave));
  } catch (err) { console.debug('Store: session save error:', err); }
}

const savedSession = loadSession();

export const useDashboardStore = create<DashboardState>((set, get) => ({
  tasks: [],
  agents: [],
  judgeResults: [],
  cost: DEFAULT_COST,
  forgeDesigns: [],
  memoryStats: DEFAULT_MEMORY,
  swarmTopologies: [],
  rlStats: DEFAULT_RL,
  events: [],
  logs: [],
  wsStatus: 'disconnected' as WSStatus,
  models: [],
  systemConfig: {},

  // Phase 14 defaults
  conversations: [],
  activeConversationId: (savedSession.activeConversationId as string | null) ?? null,
  chatMessages: [],
  streamingState: null,
  selectedModel: (savedSession.selectedModel as string | null) ?? null,
  selectedTopology: (savedSession.selectedTopology as string) ?? 'single',
  experiments: [],
  traceSummaries: [],
  traceMetrics: { totalTraces: 0, avgDurationMs: 0, p95LatencyMs: 0, errorRate: 0 },
  flowDefinitions: [],

  // Phase 15 defaults
  connectors: [],
  structuredLogs: [],
  reviewItems: [],
  datasets: [],

  // Phase 16 defaults
  vectors: [],
  vectorStats: { totalVectors: 0, dimensions: 0, indexType: 'none', sizeBytes: 0 },
  blueprints: [],
  prompts: [],

  // Live execution streaming
  liveExecution: DEFAULT_LIVE_EXECUTION,

  // -------------------------------------------------------------------------
  // REST Fetch Actions
  // -------------------------------------------------------------------------

  fetchTasks: async () => {
    tasksAbort?.abort();
    tasksAbort = new AbortController();
    try {
      const res = await fetch('/api/tasks', { signal: tasksAbort.signal });
      if (!res.ok) return;
      const data = await res.json();
      set({ tasks: data.tasks ?? [] });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.debug('Store fetch error:', err);
    }
  },

  fetchAgents: async () => {
    agentsAbort?.abort();
    agentsAbort = new AbortController();
    try {
      const res = await fetch('/api/agents', { signal: agentsAbort.signal });
      if (!res.ok) return;
      const data = await res.json();
      set({ agents: data.agents ?? [] });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.debug('Store fetch error:', err);
    }
  },

  fetchCost: async () => {
    costAbort?.abort();
    costAbort = new AbortController();
    try {
      const res = await fetch('/api/cost', { signal: costAbort.signal });
      if (!res.ok) return;
      const data = await res.json();
      set({ cost: data.cost ?? data ?? DEFAULT_COST });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.debug('Store fetch error:', err);
    }
  },

  fetchJudgeResults: async () => {
    try {
      const res = await fetch('/api/judges/results');
      if (!res.ok) return;
      const data = await res.json();
      set({ judgeResults: data.results ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchForgeDesigns: async () => {
    try {
      const res = await fetch('/api/forge/designs');
      if (!res.ok) return;
      const data = await res.json();
      set({ forgeDesigns: data.designs ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchMemoryStats: async () => {
    try {
      const res = await fetch('/api/memory/stats');
      if (!res.ok) return;
      const data = await res.json();
      set({ memoryStats: data.stats ?? data ?? DEFAULT_MEMORY });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchSwarmTopologies: async () => {
    try {
      const res = await fetch('/api/swarm/topologies');
      if (!res.ok) return;
      const data = await res.json();
      set({ swarmTopologies: data.topologies ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchRLStats: async () => {
    try {
      const res = await fetch('/api/rl/stats');
      if (!res.ok) return;
      const data = await res.json();
      set({ rlStats: data.stats ?? data ?? DEFAULT_RL });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchEvents: async () => {
    try {
      const res = await fetch('/api/system/events?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      set({ events: data.events ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchModels: async () => {
    try {
      const res = await fetch('/api/system/models');
      if (!res.ok) return;
      const data = await res.json();
      set({ models: data.models ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchConfig: async () => {
    try {
      const res = await fetch('/api/system/config');
      if (!res.ok) return;
      const data = await res.json();
      set({ systemConfig: data.config ?? {} });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchAll: async () => {
    const s = get();
    await Promise.allSettled([
      s.fetchTasks(),
      s.fetchAgents(),
      s.fetchCost(),
      s.fetchJudgeResults(),
      s.fetchForgeDesigns(),
      s.fetchMemoryStats(),
      s.fetchSwarmTopologies(),
      s.fetchRLStats(),
      s.fetchEvents(),
      s.fetchModels(),
      s.fetchConfig(),
      s.fetchConversations(),
      s.fetchExperiments(),
      s.fetchTraceSummaries(),
      s.fetchTraceMetrics(),
      s.fetchFlowDefinitions(),
      s.fetchConnectors(),
      s.fetchStructuredLogs(),
      s.fetchReviewItems(),
      s.fetchDatasets(),
      s.fetchVectors(),
      s.fetchVectorStats(),
      s.fetchBlueprints(),
      s.fetchPrompts(),
    ]);
  },

  // -------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------

  updateWsStatus: (status: WSStatus) => {
    set({ wsStatus: status });
  },

  handleWsEvent: (event: Record<string, unknown>) => {
    const state = get();
    const type = (event.type as string) ?? '';

    // Append to local log
    logCounter++;
    const logEntry: LogEntry = {
      id: logCounter,
      type,
      message: JSON.stringify(event).slice(0, 300),
      timestamp: (event.created_at as string) ?? new Date().toISOString(),
    };
    const trimmedLogs = [...state.logs, logEntry].slice(-200);
    set({ logs: trimmedLogs });

    // Push execution-relevant events to live execution state (Swarm tab streaming)
    const executionPrefixes = ['task:', 'orchestrator:', 'agent:', 'swarm:', 'forge:', 'judge:', 'consensus:', 'memory:', 'output:'];
    if (executionPrefixes.some((p) => type.startsWith(p))) {
      const evPayload = (event.payload as Record<string, unknown>) ?? {};
      state.pushLiveEvent(type, evPayload);
    }

    // Trigger targeted re-fetch based on event type
    if (type.startsWith('task:') || type.startsWith('orchestrator:')) {
      state.fetchTasks();
    }
    if (type.startsWith('agent:') || type.startsWith('swarm:')) {
      state.fetchAgents();
      state.fetchSwarmTopologies();
    }
    if (type.startsWith('judge:') || type.startsWith('consensus:')) {
      state.fetchJudgeResults();
    }
    if (type.startsWith('cost:') || type.startsWith('model:call_completed')) {
      state.fetchCost();
    }
    if (type.startsWith('forge:')) {
      state.fetchForgeDesigns();
    }
    if (type.startsWith('memory:')) {
      state.fetchMemoryStats();
    }
    if (type.startsWith('checkpoint:')) {
      state.fetchEvents();
    }

    // Phase 14: Chat streaming events
    // WS sends { type, payload: {...} } — extract payload for all chat events
    const payload = (event.payload as Record<string, unknown>) ?? event;

    if (type === 'chat:stream_started') {
      const msgId = (payload.messageId as string) ?? '';
      const convId = (payload.conversationId as string) ?? state.activeConversationId ?? '';
      set({
        streamingState: {
          conversationId: convId,
          messageId: msgId,
          parts: [],
          currentText: '',
          currentThinking: '',
          activeTool: null,
          status: 'streaming',
        },
      });
    }
    if (type === 'chat:message_completed') {
      const ss = state.streamingState;
      if (ss) {
        const finalParts: MessagePart[] = [...ss.parts];
        if (ss.currentText) {
          finalParts.push({ type: 'text', text: ss.currentText });
        }
        const newMsg: ChatMessage = {
          id: ss.messageId,
          conversationId: ss.conversationId,
          role: 'assistant',
          parts: finalParts,
          status: 'completed',
          timestamp: new Date().toISOString(),
          taskId: (payload.taskId as string) ?? undefined,
          cost: (payload.cost as number) ?? undefined,
          model: (payload.model as string) ?? undefined,
          inputTokens: (payload.inputTokens as number) ?? (payload.input_tokens as number) ?? undefined,
          outputTokens: (payload.outputTokens as number) ?? (payload.output_tokens as number) ?? undefined,
          latencyMs: (payload.latencyMs as number) ?? (payload.latency_ms as number) ?? undefined,
        };
        set({
          chatMessages: [...state.chatMessages, newMsg],
          streamingState: null,
        });
        state.fetchConversations();
      }
    }
    if (type === 'chat:tool_call_started') {
      const ss = state.streamingState;
      if (ss) {
        const parts: MessagePart[] = [...ss.parts];
        if (ss.currentText) {
          parts.push({ type: 'text', text: ss.currentText });
        }
        const tool: ToolCallData = {
          id: (payload.toolCallId as string) ?? '',
          name: (payload.toolName as string) ?? '',
          displayName: (payload.displayName as string) ?? (payload.toolName as string) ?? '',
          input: (payload.input as Record<string, unknown>) ?? {},
          status: 'calling',
        };
        set({
          streamingState: { ...ss, parts, currentText: '', activeTool: tool, status: 'tool_calling' },
        });
      }
    }
    if (type === 'chat:tool_call_completed') {
      const ss = state.streamingState;
      if (ss?.activeTool) {
        const completedTool: ToolCallData = {
          ...ss.activeTool,
          status: 'completed',
          output: (payload.output as string) ?? '',
          durationMs: (payload.durationMs as number) ?? undefined,
        };
        const parts: MessagePart[] = [
          ...ss.parts,
          { type: 'tool-call', call: completedTool },
        ];
        set({
          streamingState: { ...ss, parts, activeTool: null, status: 'streaming' },
        });
      }
    }
    if (type === 'chat:thinking_started') {
      const ss = state.streamingState;
      if (ss) {
        const parts: MessagePart[] = [...ss.parts];
        if (ss.currentText) {
          parts.push({ type: 'text', text: ss.currentText });
        }
        set({
          streamingState: { ...ss, parts, currentText: '', currentThinking: '', status: 'thinking' },
        });
      }
    }
    if (type === 'chat:thinking_ended') {
      const ss = state.streamingState;
      if (ss) {
        const parts: MessagePart[] = [
          ...ss.parts,
          { type: 'reasoning', text: ss.currentThinking, durationMs: (payload.durationMs as number) ?? undefined },
        ];
        set({
          streamingState: { ...ss, parts, currentThinking: '', status: 'streaming' },
        });
      }
    }

    // Phase 14: Chat token streaming (incremental text)
    if (type === 'chat:token') {
      const text = (payload.text as string) ?? '';
      if (text) state.appendStreamingToken(text);
    }

    // Phase 14: Lab events
    if (type.startsWith('lab:')) {
      state.fetchExperiments();
    }

    // Phase 14: Trace events
    if (type.startsWith('trace:')) {
      state.fetchTraceSummaries();
      state.fetchTraceMetrics();
    }

    // Phase 14: Flow events (forwarded — FlowsTab subscribes to logs)
    if (type.startsWith('flow:')) {
      state.fetchFlowDefinitions();
    }

    // Phase 15: Connector, log, review, dataset events
    if (type.startsWith('connector:')) {
      state.fetchConnectors();
    }
    if (type.startsWith('review:')) {
      state.fetchReviewItems();
    }
    if (type.startsWith('dataset:')) {
      state.fetchDatasets();
    }

    // Phase 16 events
    if (type.startsWith('vector:')) {
      state.fetchVectorStats();
    }
    if (type.startsWith('blueprint:')) {
      state.fetchBlueprints();
    }
    if (type.startsWith('prompt:')) {
      state.fetchPrompts();
    }
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  addLog: (type: string, message: string) => {
    logCounter++;
    const state = get();
    const entry: LogEntry = {
      id: logCounter,
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    set({ logs: [...state.logs, entry].slice(-200) });
  },

  submitTask: async (prompt: string, options: Record<string, unknown> = {}) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...options }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((data.error as string) ?? 'Failed to submit task');
      }
      get().addLog('task:submitted', `Task ${data.taskId as string} submitted`);
      // Immediately refresh tasks
      get().fetchTasks();
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('task:error', msg);
      throw err;
    }
  },

  updateConfig: async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((data.error as string) ?? 'Failed to update config');
      }
      if (data.config) {
        set({ systemConfig: data.config as SystemConfig });
      }
      get().addLog('config:updated', JSON.stringify(updates));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('config:error', msg);
    }
  },

  // -------------------------------------------------------------------------
  // Phase 14 Actions
  // -------------------------------------------------------------------------

  fetchConversations: async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json();
      set({ conversations: data.conversations ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchChatMessages: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      set({ chatMessages: data.messages ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  setActiveConversation: (id: string | null) => {
    set({ activeConversationId: id, chatMessages: [], streamingState: null });
    if (id) {
      get().fetchChatMessages(id);
    }
  },

  sendChatMessage: async (conversationId: string, content: string, model?: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      role: 'user',
      parts: [{ type: 'text', text: content }],
      status: 'sent',
      timestamp: new Date().toISOString(),
    };
    const state = get();
    // Optimistic: show user message immediately
    // DON'T set streamingState here — the backend emits chat:stream_started via WS
    // which triggers the streaming UI. This is the Open WebUI / LibreChat pattern.
    set({ chatMessages: [...state.chatMessages, userMsg] });

    try {
      // POST returns IMMEDIATELY (backend runs AI in background, streams via WS)
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, model }),
      });
      if (!res.ok) {
        throw new Error('Failed to send message');
      }
      // The AI response will arrive via WebSocket events:
      // chat:stream_started → chat:thinking_started → chat:token (×N) → chat:message_completed
      // No need to re-fetch — WS handles everything
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('chat:error', msg);
      // On network error, clear any streaming state and show error
      set({ streamingState: null });
    }
  },

  createConversation: async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      if (!res.ok) return '';
      const data = await res.json() as Record<string, unknown>;
      const conv = data.conversation as Conversation;
      if (conv?.id) {
        get().fetchConversations();
        set({ activeConversationId: conv.id, chatMessages: [] });
        return conv.id;
      }
      return '';
    } catch (err) {
      console.debug('Store: create conversation error:', err);
      return '';
    }
  },

  appendStreamingToken: (text: string) => {
    const ss = get().streamingState;
    if (!ss) return;
    if (ss.status === 'thinking') {
      set({ streamingState: { ...ss, currentThinking: ss.currentThinking + text } });
    } else {
      set({ streamingState: { ...ss, currentText: ss.currentText + text } });
    }
  },

  fetchExperiments: async () => {
    try {
      const res = await fetch('/api/lab/experiments');
      if (!res.ok) return;
      const data = await res.json();
      set({ experiments: data.experiments ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchTraceSummaries: async () => {
    try {
      const res = await fetch('/api/traces');
      if (!res.ok) return;
      const data = await res.json();
      // Transform events (from events table) into TraceSummary format
      const rawTraces = data.traces ?? [];
      const summaries = rawTraces.map((ev: Record<string, unknown>) => {
        const payload = (ev.payload ?? {}) as Record<string, unknown>;
        const status = String(ev.type ?? '').includes('failed') || String(payload.status) === 'failed' ? 'error' : 'ok';
        return {
          traceId: String(ev.taskId ?? ev.id ?? ''),
          rootSpanName: String(ev.type ?? 'unknown'),
          durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
          spanCount: 1,
          status,
          startTime: String(ev.createdAt ?? new Date().toISOString()),
        };
      });
      set({ traceSummaries: summaries });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchTraceMetrics: async () => {
    try {
      const res = await fetch('/api/traces/metrics');
      if (!res.ok) return;
      const data = await res.json();
      if (data.totalTraces !== undefined) {
        set({ traceMetrics: data as TraceMetrics });
      }
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchFlowDefinitions: async () => {
    try {
      const res = await fetch('/api/flows');
      if (!res.ok) return;
      const data = await res.json();
      set({ flowDefinitions: data.flows ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  // -------------------------------------------------------------------------
  // Chat Enhancements — Model/Topology, Files, Conversation Mgmt, HitL
  // -------------------------------------------------------------------------

  retryChatMessage: async (conversationId: string, messageId: string) => {
    const state = get();
    // Find the error message — the user message right before it should be resent
    const msgs = state.chatMessages;
    const errorIdx = msgs.findIndex((m) => m.id === messageId);
    if (errorIdx < 0) return;
    // Find the preceding user message
    let userMsg: ChatMessage | undefined;
    for (let i = errorIdx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { userMsg = msgs[i]; break; }
    }
    if (!userMsg) return;
    // Extract text from the user message
    const textPart = userMsg.parts.find((p) => p.type === 'text');
    if (!textPart || textPart.type !== 'text') return;
    // Remove the error message from local state
    set({ chatMessages: msgs.filter((m) => m.id !== messageId) });
    // Resend
    await get().sendChatMessage(conversationId, textPart.text, state.selectedModel ?? undefined);
  },

  cancelGeneration: async (conversationId: string) => {
    try {
      await fetch(`/api/chat/conversations/${conversationId}/cancel`, { method: 'POST' });
      set({ streamingState: null });
      get().addLog('chat:cancelled', `Generation cancelled for ${conversationId}`);
    } catch {
      // Best-effort — clear streaming state anyway
      set({ streamingState: null });
    }
  },

  setSelectedModel: (model: string | null) => {
    set({ selectedModel: model });
  },

  setSelectedTopology: (topology: string) => {
    set({ selectedTopology: topology });
  },

  uploadFiles: async (conversationId: string, files: File[]): Promise<readonly FileAttachment[]> => {
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      const res = await fetch(`/api/chat/conversations/${conversationId}/files`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return [];
      const data = await res.json() as Record<string, unknown>;
      return (data.attachments as readonly FileAttachment[]) ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('chat:upload_error', msg);
      return [];
    }
  },

  sendChatMessageWithAttachments: async (
    conversationId: string,
    content: string,
    attachments: readonly FileAttachment[],
    model?: string,
    topology?: string,
  ) => {
    // Build parts from content + attachments
    const parts: MessagePart[] = [];
    if (content) {
      parts.push({ type: 'text', text: content });
    }
    for (const att of attachments) {
      const partType = att.type.startsWith('image/') ? 'image' as const : 'file' as const;
      parts.push({ type: partType, attachment: att });
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      role: 'user',
      parts,
      status: 'sent',
      timestamp: new Date().toISOString(),
      attachments,
    };
    const state = get();
    set({ chatMessages: [...state.chatMessages, userMsg] });

    try {
      await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          attachments,
          model: model ?? state.selectedModel,
          topology: topology ?? state.selectedTopology,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('chat:error', msg);
    }
  },

  renameConversation: async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      get().fetchConversations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('chat:rename_error', msg);
    }
  },

  deleteConversation: async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
      const state = get();
      if (state.activeConversationId === id) {
        set({ activeConversationId: null, chatMessages: [], streamingState: null });
      }
      get().fetchConversations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('chat:delete_error', msg);
    }
  },

  cloneConversation: async (id: string): Promise<string> => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}/clone`, {
        method: 'POST',
      });
      if (!res.ok) return '';
      const data = await res.json() as Record<string, unknown>;
      const conv = data.conversation as Conversation;
      if (conv?.id) {
        get().fetchConversations();
        set({ activeConversationId: conv.id, chatMessages: [] });
        return conv.id;
      }
      return '';
    } catch (err) {
      console.debug('Store: clone conversation error:', err);
      return '';
    }
  },

  approveHitL: async (_conversationId: string, requestId: string) => {
    try {
      const res = await fetch(`/api/chat/hitl/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (!res.ok) return;
      get().addLog('hitl:approved', `HitL request ${requestId} approved`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('hitl:error', msg);
    }
  },

  rejectHitL: async (_conversationId: string, requestId: string) => {
    try {
      const res = await fetch(`/api/chat/hitl/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (!res.ok) return;
      get().addLog('hitl:rejected', `HitL request ${requestId} rejected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('hitl:error', msg);
    }
  },

  // -------------------------------------------------------------------------
  // Phase 15 Actions
  // -------------------------------------------------------------------------

  fetchConnectors: async () => {
    try {
      const res = await fetch('/api/connectors');
      if (!res.ok) return;
      const data = await res.json();
      set({ connectors: data.connectors ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchStructuredLogs: async (filters?: { level?: string; source?: string; limit?: number }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.level) params.set('level', filters.level);
      if (filters?.source) params.set('source', filters.source);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      const res = await fetch(`/api/logs${qs ? `?${qs}` : ''}`);
      if (!res.ok) return;
      const data = await res.json();
      set({ structuredLogs: data.logs ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchReviewItems: async () => {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) return;
      const data = await res.json();
      set({ reviewItems: data.reviews ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  updateReviewItem: async (id: string, status: string, feedback?: string) => {
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, feedback }),
      });
      if (res.ok) {
        get().fetchReviewItems();
        get().addLog('review:updated', `Review ${id} → ${status}`);
      }
    } catch (err) {
      get().addLog('review:error', err instanceof Error ? err.message : String(err));
    }
  },

  fetchDatasets: async () => {
    try {
      const res = await fetch('/api/datasets');
      if (!res.ok) return;
      const data = await res.json();
      set({ datasets: data.datasets ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  // -------------------------------------------------------------------------
  // Phase 16 Actions
  // -------------------------------------------------------------------------

  fetchVectors: async (query?: string) => {
    try {
      if (query) {
        // Use POST /api/vectors/search for similarity search
        const res = await fetch('/api/vectors/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!res.ok) return;
        const data = await res.json();
        set({ vectors: data.results ?? [] });
      } else {
        const res = await fetch('/api/vectors');
        if (!res.ok) return;
        const data = await res.json();
        set({ vectors: data.vectors ?? [] });
      }
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchVectorStats: async () => {
    try {
      const res = await fetch('/api/vectors/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (data.totalVectors !== undefined) {
        set({ vectorStats: data as VectorStoreStats });
      }
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchBlueprints: async () => {
    try {
      const res = await fetch('/api/blueprints');
      if (!res.ok) return;
      const data = await res.json();
      set({ blueprints: data.blueprints ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  fetchPrompts: async () => {
    try {
      const res = await fetch('/api/prompts');
      if (!res.ok) return;
      const data = await res.json();
      set({ prompts: data.prompts ?? [] });
    } catch (err) { console.debug('Store fetch error:', err); }
  },

  // -------------------------------------------------------------------------
  // Live Execution Streaming Actions (Swarm Tab)
  // -------------------------------------------------------------------------

  pushLiveEvent: (type: string, payload: Record<string, unknown>) => {
    const state = get();
    const le = state.liveExecution;
    const now = new Date().toISOString();

    // Build new event entry (immutable)
    const newEvent: LiveExecutionEvent = {
      id: le.eventLog.length + 1,
      type,
      payload,
      timestamp: now,
    };
    const eventLog = [...le.eventLog, newEvent].slice(-100); // cap at 100

    // Determine taskId from payload if not set yet
    const taskId = le.taskId ?? (payload.taskId as string | undefined) ?? null;

    // Map event types to pipeline step status changes (immutable pipeline array)
    let pipelineSteps = le.pipelineSteps;
    const updateStep = (step: string, status: 'running' | 'completed' | 'failed') => {
      pipelineSteps = pipelineSteps.map((s) =>
        s.step === step ? { ...s, status } : s,
      );
    };

    // Pipeline step mapping from event types
    if (type === 'task:started' || type === 'task:created') {
      // Reset pipeline on new task
      pipelineSteps = DEFAULT_LIVE_EXECUTION.pipelineSteps;
      updateStep('memory', 'running');
    }
    if (type === 'memory:recalled' || type === 'memory:stored') {
      updateStep('memory', 'running');
    }
    if (type === 'orchestrator:step_started') {
      const stepName = (payload.step as string) ?? '';
      if (stepName.toLowerCase().includes('memory')) updateStep('memory', 'running');
      if (stepName.toLowerCase().includes('forge') || stepName.toLowerCase().includes('design')) updateStep('forge', 'running');
      if (stepName.toLowerCase().includes('agent') || stepName.toLowerCase().includes('swarm')) updateStep('agents', 'running');
      if (stepName.toLowerCase().includes('judge') || stepName.toLowerCase().includes('quality')) updateStep('judge', 'running');
      if (stepName.toLowerCase().includes('output') || stepName.toLowerCase().includes('deliver')) updateStep('output', 'running');
    }
    if (type === 'orchestrator:step_completed') {
      const stepName = (payload.step as string) ?? '';
      if (stepName.toLowerCase().includes('memory')) { updateStep('memory', 'completed'); updateStep('forge', 'running'); }
      if (stepName.toLowerCase().includes('forge') || stepName.toLowerCase().includes('design')) { updateStep('forge', 'completed'); updateStep('agents', 'running'); }
      if (stepName.toLowerCase().includes('agent') || stepName.toLowerCase().includes('swarm')) { updateStep('agents', 'completed'); updateStep('judge', 'running'); }
      if (stepName.toLowerCase().includes('judge') || stepName.toLowerCase().includes('quality')) { updateStep('judge', 'completed'); updateStep('output', 'running'); }
      if (stepName.toLowerCase().includes('output') || stepName.toLowerCase().includes('deliver')) updateStep('output', 'completed');
    }
    if (type === 'forge:designing') { updateStep('memory', 'completed'); updateStep('forge', 'running'); }
    if (type === 'forge:designed') { updateStep('forge', 'completed'); updateStep('agents', 'running'); }
    if (type === 'swarm:started') updateStep('agents', 'running');
    if (type === 'swarm:completed') { updateStep('agents', 'completed'); updateStep('judge', 'running'); }
    if (type === 'swarm:failed') updateStep('agents', 'failed');
    if (type === 'judge:started') updateStep('judge', 'running');
    if (type === 'judge:verdict' || type === 'judge:approved') { updateStep('judge', 'completed'); updateStep('output', 'running'); }
    if (type === 'judge:rejected') updateStep('judge', 'failed');
    if (type === 'output:delivered') updateStep('output', 'completed');
    if (type === 'task:completed') {
      // Mark all remaining pending as completed
      pipelineSteps = pipelineSteps.map((s) =>
        s.status === 'pending' || s.status === 'running' ? { ...s, status: 'completed' } : s,
      );
    }
    if (type === 'task:failed') {
      // Mark running as failed, pending as skipped
      pipelineSteps = pipelineSteps.map((s) =>
        s.status === 'running' ? { ...s, status: 'failed' }
          : s.status === 'pending' ? { ...s, status: 'skipped' }
            : s,
      );
    }

    // Track agent states (immutable)
    let activeAgents = [...le.activeAgents];
    if (type === 'agent:spawned' || type === 'agent:started') {
      const agentId = (payload.agentId as string) ?? '';
      const role = (payload.role as string) ?? 'Agent';
      if (agentId && !activeAgents.some((a) => a.agentId === agentId)) {
        const newAgent: LiveAgentState = {
          agentId,
          role,
          status: type === 'agent:started' ? 'running' : 'spawned',
          startedAt: now,
        };
        activeAgents = [...activeAgents, newAgent];
      } else if (agentId) {
        activeAgents = activeAgents.map((a) =>
          a.agentId === agentId ? { ...a, status: 'running' as const } : a,
        );
      }
    }
    if (type === 'agent:completed') {
      const agentId = (payload.agentId as string) ?? '';
      const output = (payload.output as string) ?? (payload.result as string) ?? '';
      activeAgents = activeAgents.map((a) =>
        a.agentId === agentId ? { ...a, status: 'completed' as const, output, completedAt: now } : a,
      );
    }
    if (type === 'agent:failed') {
      const agentId = (payload.agentId as string) ?? '';
      const output = (payload.error as string) ?? (payload.reason as string) ?? '';
      activeAgents = activeAgents.map((a) =>
        a.agentId === agentId ? { ...a, status: 'failed' as const, output, completedAt: now } : a,
      );
    }

    set({
      liveExecution: { taskId, pipelineSteps, activeAgents, eventLog },
    });
  },

  resetLiveExecution: () => {
    set({ liveExecution: DEFAULT_LIVE_EXECUTION });
  },
}));

// Subscribe to state changes and persist UI preferences
useDashboardStore.subscribe((state) => {
  saveSession(state);
});
