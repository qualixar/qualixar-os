// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Hybrid Topology (13th topology)
 * Intelligent routing of agents between local and cloud execution.
 *
 * LLD: LLD-ANGLE-3-HYBRID-TOPOLOGY.md
 *
 * REQUIRED MODIFICATIONS TO OTHER FILES (do not make here -- tracked in migration checklist):
 * 1. src/agents/topologies/types.ts -- Add optional `emit` callback to TopologyContext
 * 2. src/agents/swarm-engine.ts -- Import hybridTopology, register in topology map,
 *    bind eventBus.emit to context.emit, pass design.topologyConfig to context.config
 * 3. src/types/events.ts -- Add 'hybrid:routed', 'hybrid:fallback', 'hybrid:cost_reconciled'
 *    to QosEventType union AND ALL_EVENT_TYPES array
 * 4. src/types/common.ts -- Add optional topologyConfig to TeamDesign interface
 * 5. src/engine/mode-engine.ts -- Add 'hybrid' to POWER_GATES.topologies and COMPANION_GATES.topologies
 */

import type { AgentInstance } from '../agent-registry.js';
import type { MsgHub, AgentMessage } from '../msghub.js';
import type { TopologyExecutor, TopologyContext, SwarmResult } from './types.js';
import { buildSwarmResult } from './types.js';
import { generateId } from '../../utils/id.js';
import { now } from '../../utils/time.js';
import type {
  HybridConfig,
  HybridResult,
  RoutingDecision,
  CloudAgentResult,
  CloudAgentAdapter,
} from './hybrid-types.js';
import { DEFAULT_HYBRID_CONFIG } from './hybrid-types.js';

// ---------------------------------------------------------------------------
// PII / Sensitive Content Detection
// ---------------------------------------------------------------------------

const PII_MARKERS_REGEX = /\b(PII|SENSITIVE|SECRET|CONFIDENTIAL|PHI|HIPAA)\b/i;
const SANDBOX_MARKERS_REGEX = /\b(UNTRUSTED|SANDBOX|EXECUTE_CODE|RUN_CODE)\b/i;
const EXECUTION_ENV_REGEX = /EXECUTION_ENV:\s*(local|cloud)/i;

// Regex-based PII format detection (H-01 security audit fix)
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

const PII_FORMAT_REGEXES: readonly RegExp[] = [
  SSN_REGEX,
  CREDIT_CARD_REGEX,
  EMAIL_REGEX,
  PHONE_REGEX,
];

const SENSITIVE_TOOLS: ReadonlySet<string> = new Set([
  'read_database', 'access_credentials', 'decrypt', 'user_data',
]);

const SANDBOX_TOOLS: ReadonlySet<string> = new Set([
  'code_interpreter', 'bash', 'python_exec', 'shell',
]);

/**
 * Detects PII in an agent's system prompt and tools.
 * Uses both keyword markers AND regex format detection (SSN, credit card, email, phone).
 * Optionally scans an additional text (e.g., task prompt) for PII formats.
 */
function hasPiiMarkers(agent: AgentInstance, additionalText?: string): boolean {
  const promptMatch = PII_MARKERS_REGEX.test(agent.systemPrompt);
  const toolMatch = agent.tools.some((t) => SENSITIVE_TOOLS.has(t));
  if (promptMatch || toolMatch) return true;

  // Regex-based PII format detection: scan system prompt + optional task prompt
  const textToScan = additionalText
    ? agent.systemPrompt + ' ' + additionalText
    : agent.systemPrompt;
  return PII_FORMAT_REGEXES.some((regex) => regex.test(textToScan));
}

function hasSandboxMarkers(agent: AgentInstance): boolean {
  const promptMatch = SANDBOX_MARKERS_REGEX.test(agent.systemPrompt);
  const toolMatch = agent.tools.some((t) => SANDBOX_TOOLS.has(t));
  return promptMatch || toolMatch;
}

// ---------------------------------------------------------------------------
// MsgHub Message Helper (matches basic.ts pattern)
// ---------------------------------------------------------------------------

function makeMessage(
  from: string,
  to: string,
  content: string,
  type: AgentMessage['type'],
): AgentMessage {
  return { id: generateId(), from, to, content, type, timestamp: now() };
}

// ---------------------------------------------------------------------------
// Routing Decision Engine (stateless, pure functions)
// ---------------------------------------------------------------------------

/**
 * Evaluates a single routing rule condition against an agent.
 * Returns true if the condition matches.
 */
function evaluateCondition(
  agent: AgentInstance,
  condition: { readonly type: string; readonly threshold?: number; readonly value?: string },
  promptLength: number,
): boolean {
  switch (condition.type) {
    case 'security':
      return hasPiiMarkers(agent);

    case 'cost':
      // Cost-based routing: threshold comparison is deferred to rule environment.
      // For v1, any cost rule with a threshold triggers a match (estimation is future).
      return condition.threshold !== undefined && condition.threshold > 0;

    case 'capability': {
      if (condition.value === 'opus-level' && agent.model.includes('opus')) return true;
      if (condition.value === 'code-execution' && agent.tools.some((t) => SANDBOX_TOOLS.has(t))) return true;
      if (condition.value === 'large-context' && promptLength > 100_000) return true;
      return false;
    }

    case 'latency':
      // Low latency (<5000ms) prefers local; batch-tolerant (>=30000ms) allows cloud.
      // The match indicates this rule applies; the environment is set by the rule itself.
      return condition.threshold !== undefined;

    case 'sandbox':
      return hasSandboxMarkers(agent);

    default:
      // Unknown condition type -- skip rule (LLD step 8d)
      return false;
  }
}

/**
 * Decides where a single agent should execute.
 * Pure function -- no side effects, no mutation.
 *
 * Algorithm follows LLD Section 5.1 exactly:
 *   Step 0: Strict security pre-check
 *   Step 1: Per-agent EXECUTION_ENV override
 *   Steps 2-10: Rule evaluation by priority
 *   Step 11: Default fallthrough
 */
function decide(
  agent: AgentInstance,
  config: HybridConfig,
  promptLength: number,
  taskPrompt?: string,
): RoutingDecision {
  const agentHasPii = hasPiiMarkers(agent, taskPrompt);

  // Step 0: Strict security pre-check (runs BEFORE any rule or override)
  if (config.securityLevel === 'strict' && agentHasPii) {
    return {
      environment: 'local',
      reason: 'strict-security-pii-detected',
      matchedRuleIndex: -1,
      trigger: 'security',
    };
  }

  // Step 1: Per-agent EXECUTION_ENV override in systemPrompt
  const envMatch = EXECUTION_ENV_REGEX.exec(agent.systemPrompt);
  if (envMatch) {
    const overrideEnv = envMatch[1].toLowerCase() as 'local' | 'cloud';
    return {
      environment: overrideEnv,
      reason: 'agent-override',
      matchedRuleIndex: -2,
      trigger: 'default',
    };
  }

  // Step 2: Sort rules by priority (ascending). Create sorted copy -- no mutation.
  const sortedRules = [...config.routingPolicy.rules].sort(
    (a, b) => a.priority - b.priority,
  );

  // Steps 3-10: Evaluate each rule
  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];

    // Security condition in strict mode: force local regardless of rule environment
    if (rule.condition.type === 'security' && config.securityLevel === 'strict' && agentHasPii) {
      return {
        environment: 'local',
        reason: 'strict-security-pii-detected',
        matchedRuleIndex: i,
        trigger: 'security',
      };
    }

    const matched = evaluateCondition(agent, rule.condition, promptLength);
    if (matched) {
      // In balanced mode, PII detection still routes local by default
      if (rule.condition.type === 'security' && config.securityLevel === 'balanced' && agentHasPii) {
        return {
          environment: 'local',
          reason: 'balanced-security-pii-detected',
          matchedRuleIndex: i,
          trigger: 'security',
        };
      }

      return {
        environment: rule.environment,
        reason: `rule-matched: ${rule.condition.type}`,
        matchedRuleIndex: i,
        trigger: rule.condition.type as RoutingDecision['trigger'],
      };
    }
  }

  // Step 11: No rule matched -- use default
  return {
    environment: config.routingPolicy.defaultEnvironment,
    reason: 'no-rule-matched-using-default',
    matchedRuleIndex: -1,
    trigger: 'default',
  };
}

// ---------------------------------------------------------------------------
// Cloud Result Normalizer
// ---------------------------------------------------------------------------

function normalizeCloudResult(result: CloudAgentResult): string {
  if (result.status === 'failed') {
    return `[ERROR: cloud-agent-failed]`;
  }
  return result.output;
}

// ---------------------------------------------------------------------------
// Aggregation Strategies
// ---------------------------------------------------------------------------

function aggregateMerge(outputs: Record<string, string>): string {
  return Object.values(outputs)
    .filter((o) => !o.startsWith('[ERROR'))
    .join('\n\n---\n\n');
}

function aggregateVote(outputs: Record<string, string>): string {
  const validOutputs = Object.values(outputs).filter((o) => !o.startsWith('[ERROR'));
  if (validOutputs.length === 0) return '';

  const counts = new Map<string, number>();
  for (const output of validOutputs) {
    const trimmed = output.trim();
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  let maxCount = 0;
  let winner = '';
  for (const [output, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      winner = output;
    }
  }
  return winner;
}

function aggregateHierarchical(
  outputs: Record<string, string>,
  agents: readonly AgentInstance[],
): string {
  // First agent's output is primary
  for (const agent of agents) {
    const output = outputs[agent.id];
    if (output !== undefined && !output.startsWith('[ERROR')) {
      return output;
    }
  }
  return '';
}

function aggregateLastWriterWins(
  outputs: Record<string, string>,
  agents: readonly AgentInstance[],
): string {
  // Last agent in the array that has a valid output
  for (let i = agents.length - 1; i >= 0; i--) {
    const output = outputs[agents[i].id];
    if (output !== undefined && !output.startsWith('[ERROR')) {
      return output;
    }
  }
  return '';
}

function aggregate(
  strategy: HybridConfig['aggregationStrategy'],
  outputs: Record<string, string>,
  agents: readonly AgentInstance[],
): string {
  switch (strategy) {
    case 'merge':
      return aggregateMerge(outputs);
    case 'vote':
      return aggregateVote(outputs);
    case 'hierarchical':
      return aggregateHierarchical(outputs, agents);
    case 'last-writer-wins':
      return aggregateLastWriterWins(outputs, agents);
    default:
      return aggregateMerge(outputs);
  }
}

// ---------------------------------------------------------------------------
// Cloud Agent Execution Helper
// ---------------------------------------------------------------------------

async function executeCloudAgent(
  agent: AgentInstance,
  prompt: string,
  adapter: CloudAgentAdapter,
): Promise<CloudAgentResult> {
  return adapter.executeAgent({
    systemPrompt: agent.systemPrompt,
    prompt,
    model: agent.model,
    tools: agent.tools,
  });
}

// ---------------------------------------------------------------------------
// Optional Event Emission Helper
// ---------------------------------------------------------------------------

function emitIfAvailable(
  context: TopologyContext,
  type: string,
  payload: Record<string, unknown>,
): void {
  if (typeof context.emit === 'function') {
    context.emit(type, payload);
  }
}

// ---------------------------------------------------------------------------
// 13. Hybrid Topology
// ---------------------------------------------------------------------------

export class HybridTopology implements TopologyExecutor {
  readonly name = 'hybrid';

  async run(
    agents: readonly AgentInstance[],
    msgHub: MsgHub,
    context: TopologyContext,
    transport?: unknown, // AgentTransport -- present for interface compliance, unused by hybrid topology
  ): Promise<SwarmResult> {
    // -----------------------------------------------------------------------
    // Phase 1 -- Validation & Context Setup
    // -----------------------------------------------------------------------
    if (agents.length < 1) {
      throw new Error('Hybrid requires at least 1 agent');
    }

    const hybridConfig: HybridConfig =
      (context.config['hybrid'] as HybridConfig | undefined) ?? DEFAULT_HYBRID_CONFIG;

    const cloudAdapter =
      (context.config['cloudAdapter'] as CloudAgentAdapter | undefined) ?? undefined;

    const startMs = performance.now();
    const outputs: Record<string, string> = {};
    const routingDecisions: Record<string, RoutingDecision> = {};
    const cloudCosts: Record<string, number> = {};
    const promptLength = context.task.prompt.length;

    // -----------------------------------------------------------------------
    // Phase 2 -- Route Assignment (Per-Agent)
    // -----------------------------------------------------------------------
    let cloudAgentCount = 0;

    for (const agent of agents) {
      let decision = decide(agent, hybridConfig, promptLength, context.task.prompt);

      if (decision.environment === 'cloud' && cloudAgentCount >= hybridConfig.maxCloudAgents) {
        decision = { ...decision, environment: 'local', reason: 'cloud-agent-limit-reached' };
      }

      if (decision.environment === 'cloud') {
        cloudAgentCount++;
      }

      routingDecisions[agent.id] = decision;
    }

    let localAgents = agents.filter((a) => routingDecisions[a.id].environment === 'local');
    let cloudAgents = agents.filter((a) => routingDecisions[a.id].environment === 'cloud');

    emitIfAvailable(context, 'hybrid:routed', {
      localCount: localAgents.length,
      cloudCount: cloudAgents.length,
      decisions: { ...routingDecisions },
    });

    // -----------------------------------------------------------------------
    // Phase 2.5 -- Cloud Adapter Availability Pre-Check
    // -----------------------------------------------------------------------
    if (cloudAgents.length > 0) {
      let cloudAvailable = false;

      if (cloudAdapter !== undefined) {
        try {
          cloudAvailable = await cloudAdapter.isAvailable();
        } catch {
          cloudAvailable = false;
        }
      }

      if (!cloudAvailable) {
        for (const agent of cloudAgents) {
          routingDecisions[agent.id] = {
            ...routingDecisions[agent.id],
            environment: 'local',
            reason: 'cloud-adapter-unavailable',
          };
          emitIfAvailable(context, 'hybrid:fallback', {
            agentId: agent.id,
            reason: 'cloud-adapter-unavailable',
            originalError: 'adapter not configured or unavailable',
          });
        }
        localAgents = [...localAgents, ...cloudAgents];
        cloudAgents = [];
      }
    }

    // -----------------------------------------------------------------------
    // Phase 3 -- Parallel Execution
    // -----------------------------------------------------------------------
    const localPromises = localAgents.map((agent) =>
      context.executeAgent(agent, context.task.prompt),
    );

    const cloudPromises = cloudAgents.map((agent) =>
      executeCloudAgent(agent, context.task.prompt, cloudAdapter!),
    );

    const [localSettled, cloudSettled] = await Promise.all([
      Promise.allSettled(localPromises),
      Promise.allSettled(cloudPromises),
    ]);

    // -----------------------------------------------------------------------
    // Phase 4 -- Result Collection with Fallback
    // -----------------------------------------------------------------------

    // Mutable copies for fallback tracking (agents that fall back from cloud to local)
    const finalLocalAgentIds = new Set(localAgents.map((a) => a.id));
    const finalCloudAgentIds = new Set(cloudAgents.map((a) => a.id));

    // Collect local results
    for (let i = 0; i < localSettled.length; i++) {
      const result = localSettled[i];
      const agent = localAgents[i];

      if (result.status === 'fulfilled') {
        outputs[agent.id] = result.value;
        try {
          const msg = makeMessage(agent.id, 'broadcast', result.value, 'result');
          msgHub.send(agent.id, 'broadcast', msg);
        } catch {
          // MsgHub send failure -- log and continue (E-11)
        }
      } else {
        outputs[agent.id] = `[ERROR: ${result.reason?.message ?? 'unknown'}]`;
      }
    }

    // Collect cloud results with fallback
    for (let i = 0; i < cloudSettled.length; i++) {
      const result = cloudSettled[i];
      const agent = cloudAgents[i];

      if (result.status === 'fulfilled') {
        const cloudResult = result.value;
        outputs[agent.id] = normalizeCloudResult(cloudResult);

        try {
          cloudCosts[agent.id] = cloudResult.costUsd;
        } catch {
          // Cost extraction failure -- default to 0 (E-14)
          cloudCosts[agent.id] = 0;
        }

        try {
          const msg = makeMessage(agent.id, 'broadcast', outputs[agent.id], 'result');
          msgHub.send(agent.id, 'broadcast', msg);
        } catch {
          // MsgHub send failure -- log and continue (E-11)
        }
      } else if (hybridConfig.fallbackToLocal) {
        // Cloud failed, fallback to local
        emitIfAvailable(context, 'hybrid:fallback', {
          agentId: agent.id,
          reason: result.reason?.message ?? 'unknown',
          originalError: String(result.reason),
        });

        try {
          const fallbackResult = await context.executeAgent(agent, context.task.prompt);
          outputs[agent.id] = fallbackResult;
        } catch (fallbackErr: unknown) {
          const errMsg = fallbackErr instanceof Error ? fallbackErr.message : 'unknown';
          outputs[agent.id] = `[ERROR: ${errMsg}]`;
        }

        // Move agent from cloud to local for cost tracking (HR-11)
        finalCloudAgentIds.delete(agent.id);
        finalLocalAgentIds.add(agent.id);

        try {
          const msg = makeMessage(agent.id, 'broadcast', outputs[agent.id], 'result');
          msgHub.send(agent.id, 'broadcast', msg);
        } catch {
          // MsgHub send failure -- continue
        }
      } else {
        // Cloud failed, no fallback
        outputs[agent.id] = `[ERROR: cloud-agent-failed ${result.reason?.message ?? 'unknown'}]`;
      }
    }

    // -----------------------------------------------------------------------
    // Phase 5 -- Aggregation
    // -----------------------------------------------------------------------
    const aggregatedOutput = aggregate(hybridConfig.aggregationStrategy, outputs, agents);

    // -----------------------------------------------------------------------
    // Phase 6 -- Cost Reconciliation
    // -----------------------------------------------------------------------
    let localCostUsd = 0;
    for (const agent of agents) {
      if (finalLocalAgentIds.has(agent.id)) {
        localCostUsd += agent.stats.totalCostUsd;
      }
    }

    let cloudCostUsd = 0;
    for (const agentId of finalCloudAgentIds) {
      cloudCostUsd += cloudCosts[agentId] ?? 0;
    }

    const totalCostUsd = localCostUsd + cloudCostUsd;

    emitIfAvailable(context, 'hybrid:cost_reconciled', {
      localCostUsd,
      cloudCostUsd,
      totalCostUsd,
    });

    // -----------------------------------------------------------------------
    // Phase 7 -- Build Result
    // -----------------------------------------------------------------------
    const base = buildSwarmResult('hybrid', outputs, aggregatedOutput, agents, startMs);

    const hybridResult: HybridResult = {
      ...base,
      totalCostUsd,
      localAgents: Array.from(finalLocalAgentIds),
      cloudAgents: Array.from(finalCloudAgentIds),
      localCostUsd,
      cloudCostUsd,
      routingDecisions: { ...routingDecisions },
    };

    return hybridResult;
  }

  getTerminationCondition(): string {
    return 'All agents complete (local + cloud, with fallback)';
  }

  getAggregationStrategy(): string {
    return 'Configurable: merge | vote | hierarchical | last-writer-wins';
  }
}

export const hybridTopology: TopologyExecutor = new HybridTopology();
