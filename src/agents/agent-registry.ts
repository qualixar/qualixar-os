// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Agent Registry
 * Agent lifecycle management: register, deregister, state transitions, stats.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.1
 * Interface: REWRITE-SPEC Section 6 Phase 4 (AgentRegistry)
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'working' | 'paused' | 'error' | 'terminated';

export interface AgentStats {
  readonly messagesReceived: number;
  readonly messagesSent: number;
  readonly llmCallCount: number;
  readonly totalCostUsd: number;
  readonly totalLatencyMs: number;
}

export interface AgentInstance {
  readonly id: string;
  readonly taskId: string;
  readonly role: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly status: AgentStatus;
  readonly createdAt: string;
  readonly stats: AgentStats;
}

// ---------------------------------------------------------------------------
// Valid State Transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<AgentStatus, readonly AgentStatus[]> = {
  idle: ['working'],
  working: ['paused', 'error', 'terminated'],
  paused: ['working', 'terminated'],
  error: ['terminated'],
  terminated: [],
} as const;

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface AgentRegistry {
  register(agent: AgentInstance): void;
  deregister(agentId: string): void;
  get(agentId: string): AgentInstance | undefined;
  listActive(): readonly AgentInstance[];
  listAgents(): readonly { readonly id: string; readonly status: string; readonly role: string }[];
  getAgent(agentId: string): { readonly id: string; readonly status: string; readonly role: string };
  transitionState(agentId: string, targetState: AgentStatus): void;
  updateStats(agentId: string, delta: Partial<AgentStats>): void;
  getByTaskId(taskId: string): readonly AgentInstance[];
  getStats(): { readonly total: number; readonly byStatus: Record<AgentStatus, number> };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class AgentRegistryImpl implements AgentRegistry {
  private readonly _agents: Map<string, AgentInstance>;
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;

  constructor(db: QosDatabase, eventBus: EventBus) {
    this._agents = new Map();
    this._db = db;
    this._eventBus = eventBus;
  }

  register(agent: AgentInstance): void {
    if (!agent.id || agent.id.trim() === '') {
      throw new Error('Agent id must be a non-empty string');
    }
    if (this._agents.has(agent.id)) {
      throw new Error(`Duplicate agent: '${agent.id}' is already registered`);
    }

    this._agents.set(agent.id, agent);

    this._db.db
      .prepare(
        'INSERT INTO agents (id, task_id, role, model, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(agent.id, agent.taskId, agent.role, agent.model, 'idle', agent.createdAt);

    this._eventBus.emit({
      type: 'agent:spawned',
      payload: {
        agentId: agent.id,
        taskId: agent.taskId,
        role: agent.role,
        model: agent.model,
      },
      source: 'agent-registry',
    });
  }

  deregister(agentId: string): void {
    const agent = this._agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found`);
    }

    if (agent.status !== 'terminated') {
      this.transitionState(agentId, 'terminated');
    }

    this._agents.delete(agentId);

    this._db.db
      .prepare('UPDATE agents SET status = ? WHERE id = ?')
      .run('terminated', agentId);

    this._eventBus.emit({
      type: 'agent:terminated',
      payload: { agentId },
      source: 'agent-registry',
    });
  }

  get(agentId: string): AgentInstance | undefined {
    return this._agents.get(agentId);
  }

  listActive(): readonly AgentInstance[] {
    return Array.from(this._agents.values()).filter(
      (a) => a.status !== 'terminated',
    );
  }

  listAgents(): readonly { readonly id: string; readonly status: string; readonly role: string }[] {
    return Array.from(this._agents.values()).map((a) => ({
      id: a.id,
      status: a.status,
      role: a.role,
    }));
  }

  getAgent(agentId: string): { readonly id: string; readonly status: string; readonly role: string } {
    const agent = this._agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found`);
    }
    return { id: agent.id, status: agent.status, role: agent.role };
  }

  transitionState(agentId: string, targetState: AgentStatus): void {
    const agent = this._agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found`);
    }

    const validTargets = VALID_TRANSITIONS[agent.status];
    if (!validTargets.includes(targetState)) {
      throw new Error(
        `Invalid state transition: '${agent.status}' -> '${targetState}'`,
      );
    }

    const updated: AgentInstance = { ...agent, status: targetState };
    this._agents.set(agentId, updated);

    this._db.db
      .prepare('UPDATE agents SET status = ? WHERE id = ?')
      .run(targetState, agentId);

    const eventMap: Partial<Record<AgentStatus, string>> = {
      working: 'agent:started',
      terminated: 'agent:completed',
      error: 'agent:failed',
    };
    const eventType = eventMap[targetState];
    if (eventType) {
      this._eventBus.emit({
        type: eventType as 'agent:started' | 'agent:completed' | 'agent:failed',
        payload: { agentId, previousState: agent.status, newState: targetState },
        source: 'agent-registry',
      });
    }
  }

  updateStats(agentId: string, delta: Partial<AgentStats>): void {
    const agent = this._agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found`);
    }

    const newStats: AgentStats = {
      messagesReceived: agent.stats.messagesReceived + (delta.messagesReceived ?? 0),
      messagesSent: agent.stats.messagesSent + (delta.messagesSent ?? 0),
      llmCallCount: agent.stats.llmCallCount + (delta.llmCallCount ?? 0),
      totalCostUsd: agent.stats.totalCostUsd + (delta.totalCostUsd ?? 0),
      totalLatencyMs: agent.stats.totalLatencyMs + (delta.totalLatencyMs ?? 0),
    };

    const updated: AgentInstance = { ...agent, stats: newStats };
    this._agents.set(agentId, updated);
  }

  getByTaskId(taskId: string): readonly AgentInstance[] {
    return Array.from(this._agents.values()).filter(
      (a) => a.taskId === taskId,
    );
  }

  getStats(): { readonly total: number; readonly byStatus: Record<AgentStatus, number> } {
    const byStatus: Record<AgentStatus, number> = {
      idle: 0,
      working: 0,
      paused: 0,
      error: 0,
      terminated: 0,
    };

    for (const agent of this._agents.values()) {
      byStatus[agent.status]++;
    }

    return { total: this._agents.size, byStatus };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgentRegistry(db: QosDatabase, eventBus: EventBus): AgentRegistry {
  return new AgentRegistryImpl(db, eventBus);
}
