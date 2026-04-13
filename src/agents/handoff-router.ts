// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Handoff Router
 * Model-native agent handoff between agents via MsgHub.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.9
 */

import type { MsgHub, AgentMessage } from './msghub.js';
import type { AgentRegistry } from './agent-registry.js';
import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffDetection {
  readonly target: string;
  readonly context: string;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface HandoffRouter {
  detectHandoff(agentOutput: string): HandoffDetection | null;
  routeHandoff(fromAgentId: string, targetRole: string, context: string): boolean;
  processAgentOutput(agentId: string, output: string): string;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const STRUCTURED_PATTERN = /^HANDOFF:(\w+):(.+)$/m;
const JSON_PATTERN = /\{"handoff"\s*:\s*"(\w+)"\s*,\s*"context"\s*:\s*"([^"]+)"\}/;
const NL_PATTERN = /hand(?:ing)?\s*off\s+to\s+(\w+)\s*(.*)/i;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class HandoffRouterImpl implements HandoffRouter {
  private readonly _msgHub: MsgHub;
  private readonly _agentRegistry: AgentRegistry;
  private readonly _eventBus: EventBus;

  constructor(msgHub: MsgHub, agentRegistry: AgentRegistry, eventBus: EventBus) {
    this._msgHub = msgHub;
    this._agentRegistry = agentRegistry;
    this._eventBus = eventBus;
  }

  detectHandoff(agentOutput: string): HandoffDetection | null {
    // Pattern 1: HANDOFF:target_role:context
    const structured = STRUCTURED_PATTERN.exec(agentOutput);
    if (structured) {
      return { target: structured[1], context: structured[2] };
    }

    // Pattern 2: JSON {"handoff": "role", "context": "..."}
    const json = JSON_PATTERN.exec(agentOutput);
    if (json) {
      return { target: json[1], context: json[2] };
    }

    // Pattern 3: Natural language "handing off to role ..."
    const nl = NL_PATTERN.exec(agentOutput);
    if (nl) {
      return { target: nl[1], context: nl[2].trim() || 'Handoff context not specified' };
    }

    return null;
  }

  routeHandoff(fromAgentId: string, targetRole: string, context: string): boolean {
    const targetAgent = this._agentRegistry
      .listActive()
      .find((a) => a.role === targetRole);

    if (!targetAgent) {
      return false;
    }

    const message: AgentMessage = {
      id: generateId(),
      from: fromAgentId,
      to: targetAgent.id,
      content: context,
      type: 'handoff',
      timestamp: now(),
    };

    this._msgHub.send(fromAgentId, targetAgent.id, message);

    this._eventBus.emit({
      type: 'handoff:occurred',
      payload: { from: fromAgentId, to: targetAgent.id, targetRole },
      source: 'handoff-router',
    });

    return true;
  }

  processAgentOutput(agentId: string, output: string): string {
    const handoff = this.detectHandoff(output);
    if (!handoff) return output;

    this.routeHandoff(agentId, handoff.target, handoff.context);

    // Strip handoff directive from output
    let cleaned = output
      .replace(STRUCTURED_PATTERN, '')
      .replace(JSON_PATTERN, '')
      .replace(NL_PATTERN, '')
      .trim();

    return cleaned || output;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHandoffRouter(
  msgHub: MsgHub,
  agentRegistry: AgentRegistry,
  eventBus: EventBus,
): HandoffRouter {
  return new HandoffRouterImpl(msgHub, agentRegistry, eventBus);
}
