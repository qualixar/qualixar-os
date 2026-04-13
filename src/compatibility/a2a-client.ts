// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8b -- A2A Client
 *
 * Discover external A2A agents, delegate tasks, poll for results.
 * Follows the A2A v0.3 protocol for agent-to-agent communication.
 *
 * Hard Rules:
 *   - Protocol validation: must be 'a2a/v0.3'
 *   - readonly on all interface properties
 *   - ESM .js extensions on local imports
 *   - All SQL parameterized with ? placeholders
 *   - No silent error swallowing
 */

import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/event-bus.js';
import type { QosDatabase } from '../db/database.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface TaskDelegation {
  readonly prompt: string;
  readonly taskType?: string;
  readonly maxBudgetUsd?: number;
  readonly timeoutMs?: number;
}

export interface TaskDelegationResult {
  readonly status: 'completed' | 'failed' | 'timeout';
  readonly output?: string;
  readonly costUsd?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface KnownAgent {
  readonly name: string;
  readonly url: string;
  readonly protocol: string;
  readonly capabilities: readonly string[];
}

interface A2AAgentCard {
  readonly name: string;
  readonly protocol: string;
  readonly capabilities: readonly string[];
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface A2AClient {
  discover(url: string): Promise<A2AAgentCard>;
  delegate(agentUrl: string, task: TaskDelegation): Promise<TaskDelegationResult>;
  listKnownAgents(): readonly KnownAgent[];
  healthCheck(agentUrl: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class A2AClientImpl implements A2AClient {
  private readonly _eventBus: EventBus;
  private readonly _logger: Logger;
  private readonly _db: QosDatabase;
  private readonly _knownAgents: Map<string, A2AAgentCard & { url: string }> = new Map();

  constructor(eventBus: EventBus, logger: Logger, db: QosDatabase) {
    this._eventBus = eventBus;
    this._logger = logger;
    this._db = db;
  }

  async discover(url: string): Promise<A2AAgentCard> {
    const cardUrl = `${url}/.well-known/agent-card`;

    const response = await fetch(cardUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to discover agent at ${url}: HTTP ${response.status}`,
      );
    }

    const card = (await response.json()) as A2AAgentCard;

    // Validate required fields
    this._validateAgentCard(card, url);

    // Store in memory
    const storedCard = { ...card, url };
    this._knownAgents.set(url, storedCard);

    // Persist to database
    this._db.insert('a2a_agents', {
      id: randomUUID(),
      name: card.name,
      url,
      agent_card: JSON.stringify(card),
      status: 'active',
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Emit event
    this._eventBus.emit({
      type: 'a2a:agent_registered',
      payload: {
        name: card.name,
        url,
        capabilities: card.capabilities,
      },
      source: 'a2a-client',
    });

    this._logger.info({ url, name: card.name }, 'Discovered A2A agent');

    return card;
  }

  async delegate(
    agentUrl: string,
    task: TaskDelegation,
  ): Promise<TaskDelegationResult> {
    // Emit send event
    this._eventBus.emit({
      type: 'a2a:request_sent',
      payload: {
        agentUrl,
        prompt: task.prompt,
        taskType: task.taskType,
      },
      source: 'a2a-client',
    });

    // POST /a2a/tasks/send
    const sendResponse = await fetch(`${agentUrl}/a2a/tasks/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: task.prompt,
        taskType: task.taskType,
        maxBudgetUsd: task.maxBudgetUsd,
        timeoutMs: task.timeoutMs,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!sendResponse.ok) {
      throw new Error(
        `Failed to delegate task to ${agentUrl}: HTTP ${sendResponse.status}`,
      );
    }

    const sendResult = (await sendResponse.json()) as {
      id: string;
      status: string;
    };
    const taskId = sendResult.id;

    // Poll for completion
    const timeoutMs = task.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const statusResponse = await fetch(
        `${agentUrl}/a2a/tasks/${taskId}/status`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );

      if (!statusResponse.ok) {
        return { status: 'failed', output: `Status check failed: HTTP ${statusResponse.status}` };
      }

      const statusResult = (await statusResponse.json()) as {
        id: string;
        status: string;
        output?: string;
        costUsd?: number;
        metadata?: Record<string, unknown>;
      };

      if (statusResult.status === 'completed') {
        return {
          status: 'completed',
          output: statusResult.output,
          costUsd: statusResult.costUsd,
          metadata: statusResult.metadata,
        };
      }

      if (statusResult.status === 'failed') {
        return {
          status: 'failed',
          output: statusResult.output,
          costUsd: statusResult.costUsd,
          metadata: statusResult.metadata,
        };
      }

      // Wait before next poll
      await this._sleep(POLL_INTERVAL_MS);
    }

    // Timeout
    return { status: 'timeout' };
  }

  listKnownAgents(): readonly KnownAgent[] {
    return Array.from(this._knownAgents.values()).map((card) => ({
      name: card.name,
      url: card.url,
      protocol: card.protocol,
      capabilities: [...card.capabilities],
    }));
  }

  async healthCheck(agentUrl: string): Promise<boolean> {
    try {
      await this.discover(agentUrl);
      return true;
    } catch {
      this._logger.warn({ url: agentUrl }, 'A2A agent health check failed');
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _validateAgentCard(card: A2AAgentCard, url: string): void {
    if (!card.name || card.name.trim() === '') {
      throw new Error(`Invalid A2A agent card from ${url}: name is required`);
    }

    if (card.protocol !== 'a2a/v0.3') {
      throw new Error(
        `Invalid A2A agent card from ${url}: protocol must be 'a2a/v0.3', got '${card.protocol}'`,
      );
    }

    if (!Array.isArray(card.capabilities) || card.capabilities.length === 0) {
      throw new Error(
        `Invalid A2A agent card from ${url}: capabilities must be a non-empty array`,
      );
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createA2AClient(
  eventBus: EventBus,
  logger: Logger,
  db: QosDatabase,
): A2AClient {
  return new A2AClientImpl(eventBus, logger, db);
}
