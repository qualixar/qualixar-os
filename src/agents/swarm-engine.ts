// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Swarm Engine
 * Topology executor: spawns agents, delegates to topology files, collects results.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.12
 * Interface: REWRITE-SPEC Section 6 Phase 4 (SwarmEngine)
 */

import type { TeamDesign, TaskOptions } from '../types/common.js';
import type { ModeEngine } from '../engine/mode-engine.js';
import type { ModelRouter } from '../router/model-router.js';
import type { SecurityEngine } from '../types/common.js';
import type { EventBus } from '../events/event-bus.js';
import type { MsgHub } from './msghub.js';
import type { AgentRegistry, AgentInstance, AgentStats } from './agent-registry.js';
import type { HandoffRouter } from './handoff-router.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type {
  TopologyExecutor,
  TopologyContext,
  SwarmResult,
} from './topologies/types.js';

import { basicTopologies } from './topologies/basic.js';
import { advancedTopologies } from './topologies/advanced.js';
import { experimentalTopologies } from './topologies/experimental.js';
import { hybridTopology } from './topologies/hybrid.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { createA2AMsgHub } from './transport/a2a-msghub.js';
import { MessageConverter } from './transport/message-converter.js';
import { createAgentLogger, type AgentLogger } from '../observability/agent-logger.js';

import path from 'node:path';
import { jsonrepair } from 'jsonrepair';

/** Maximum tool-call iterations to prevent infinite loops */
const MAX_TOOL_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Universal Type-C: Extract file_write operations from LLM text responses
// ---------------------------------------------------------------------------
// Many LLMs (Ollama, OpenRouter, Azure Claude, smaller models) don't support
// tool_calls. They write code as markdown code blocks with filenames. This
// function extracts those blocks and converts them to file_write operations,
// making file execution work with ANY model, ANY provider.

interface ExtractedFile {
  readonly path: string;
  readonly content: string;
}

function extractFileWritesFromText(content: string, workspaceDir: string): readonly ExtractedFile[] {
  const files: ExtractedFile[] = [];
  if (!content || content.length < 50) return files;

  // Pattern 1: <tool_call> XML blocks (Claude via Azure, Anthropic text mode)
  // This is the PRIMARY format — Claude wraps tool calls in <tool_call>...</tool_call> XML
  // Use greedy match up to </tool_call> to capture the FULL JSON including nested braces
  const toolCallXmlPattern = /<tool_call>\s*\n?\s*([\s\S]*?)\s*\n?\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = toolCallXmlPattern.exec(content)) !== null) {
    const rawBlock = match[1].trim();
    // Extract file path first (before parsing full JSON — survives truncation)
    const pathMatch = rawBlock.match(/"path"\s*:\s*"([^"]+)"/);
    if (!pathMatch) continue;
    const filePath = pathMatch[1];

    // Try jsonrepair FIRST (handles control chars, truncated JSON, smart quotes)
    // JSON.parse alone fails on literal newlines in strings — common in LLM output
    try {
      const repaired = jsonrepair(rawBlock);
      const parsed = JSON.parse(repaired) as Record<string, unknown>;
      if (parsed.name === 'file_write') {
        const args = (parsed.arguments ?? parsed.parameters) as Record<string, unknown>;
        if (args?.path && args?.content) {
          const resolvedPath = String(args.path).startsWith('/') ? String(args.path) : path.join(workspaceDir, String(args.path));
          files.push({ path: resolvedPath, content: String(args.content) });
        }
      }
    } catch {
      // jsonrepair failed — last resort: extract content between first "content": " and the closing
      // This handles massive blocks (50K+) where even jsonrepair hits limits
      try {
        const contentStart = rawBlock.indexOf('"content"');
        if (contentStart >= 0) {
          // Find the opening quote of the content value
          const valueStart = rawBlock.indexOf('"', contentStart + 10);
          if (valueStart >= 0) {
            // Content runs until the closing "}} or end of block
            // Try to find the proper end: look for "} or "}\n} near the end
            let rawContent = rawBlock.slice(valueStart + 1);
            // Strip trailing JSON closure: "}}, "}} etc
            const closingIdx = rawContent.lastIndexOf('"');
            if (closingIdx > 0) {
              rawContent = rawContent.slice(0, closingIdx);
            }
            // Unescape JSON string escapes
            const fileContent = rawContent
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            if (fileContent.length > 20) {
              const resolvedPath = filePath.startsWith('/') ? filePath : path.join(workspaceDir, filePath);
              files.push({ path: resolvedPath, content: fileContent });
            }
          }
        }
      } catch { /* truly unrecoverable */ }
    }
  }
  // Do NOT return early — continue to Pattern 2/3 for any non-tool_call code blocks

  // Pattern 2: Raw JSON tool_call in text (without XML wrapper)
  // Matches: {"name": "file_write", "arguments": {"path": "...", "content": "..."}}
  const toolCallJsonPattern = /\{\s*"name"\s*:\s*"file_write"\s*,\s*"(?:arguments|parameters)"\s*:\s*\{[^}]*"path"\s*:\s*"([^"]+)"[^}]*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  while ((match = toolCallJsonPattern.exec(content)) !== null) {
    const filePath = match[1];
    const fileContent = match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    const resolved = filePath.startsWith('/') ? filePath : path.join(workspaceDir, filePath);
    files.push({ path: resolved, content: fileContent });
  }

  // Pattern 2b: Markdown code blocks with filename headers
  // Matches: ```js // server.js   OR   ### server.js\n```javascript
  // Also: **server.js**\n```js  OR  `server.js`:\n```
  const codeBlockPattern = /(?:(?:#{1,4}\s+|[*`]+)?([\w./-]+\.(?:js|ts|py|html|css|json|md|sql|yaml|yml|sh|jsx|tsx|env|toml|cfg|txt|xml|csv))[*`]*[:\s]*\n)?```[\w]*\n([\s\S]*?)```/g;
  while ((match = codeBlockPattern.exec(content)) !== null) {
    let fileName = match[1];
    const code = match[2].trim();
    if (!fileName || !code) continue;

    // Skip very short blocks (likely examples, not real files)
    if (code.length < 20) continue;

    // Resolve path relative to workspace
    const resolved = fileName.startsWith('/') ? fileName : path.join(workspaceDir, fileName);
    files.push({ path: resolved, content: code });
  }

  // Pattern 3: Explicit file path comments at start of code blocks
  // Matches: ```\n// File: server.js   OR   # file: app.py   OR   <!-- filename: index.html -->
  const commentFilePattern = /```[\w]*\n(?:\/\/|#|<!--)\s*(?:File|filename|path):\s*([\w./-]+\.[\w]+)\s*(?:-->)?\n([\s\S]*?)```/gi;
  while ((match = commentFilePattern.exec(content)) !== null) {
    const fileName = match[1];
    const code = match[2].trim();
    if (!fileName || code.length < 20) continue;
    const resolved = fileName.startsWith('/') ? fileName : path.join(workspaceDir, fileName);
    files.push({ path: resolved, content: code });
  }

  // Deduplicate by path — keep the latest occurrence (last write wins)
  const deduped = new Map<string, ExtractedFile>();
  for (const f of files) {
    deduped.set(f.path, f);
  }
  return Array.from(deduped.values());
}

/**
 * Check if a model name is a real model in the router's catalog or a known
 * provider-prefixed name (e.g. "azure/gpt-5.4-mini"). Forge-generated
 * placeholder names like "calculator_v1" should fall through to the router's
 * default strategy selection.
 */
function isKnownModel(name: string): boolean {
  const prefixes = [
    'claude-', 'gpt-', 'gemini-', 'ollama/', 'azure/',
    'deepseek-', 'grok-', 'kimi-', 'mistral-',
  ];
  return prefixes.some((p) => name.toLowerCase().startsWith(p));
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface SwarmEngine {
  run(design: TeamDesign, task: TaskOptions): Promise<SwarmResult>;
  getTopology(name: string): TopologyExecutor;
  listTopologies(): readonly string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SwarmEngineImpl implements SwarmEngine {
  private readonly _topologyMap: Map<string, TopologyExecutor>;
  private readonly _msgHub: MsgHub;
  private readonly _handoffRouter: HandoffRouter;
  private readonly _agentRegistry: AgentRegistry;
  private readonly _modeEngine: ModeEngine;
  private readonly _modelRouter: ModelRouter;
  private readonly _eventBus: EventBus;
  private readonly _toolRegistry?: ToolRegistry;
  private readonly _protocolRouter?: import('./transport/types.js').ProtocolRouter;

  constructor(
    msgHub: MsgHub,
    handoffRouter: HandoffRouter,
    agentRegistry: AgentRegistry,
    modeEngine: ModeEngine,
    modelRouter: ModelRouter,
    eventBus: EventBus,
    toolRegistry?: ToolRegistry,
    protocolRouter?: import('./transport/types.js').ProtocolRouter,
  ) {
    this._msgHub = msgHub;
    this._handoffRouter = handoffRouter;
    this._agentRegistry = agentRegistry;
    this._modeEngine = modeEngine;
    this._modelRouter = modelRouter;
    this._eventBus = eventBus;
    this._toolRegistry = toolRegistry;
    this._protocolRouter = protocolRouter;

    this._topologyMap = new Map();
    for (const t of [...basicTopologies, ...advancedTopologies, ...experimentalTopologies, hybridTopology]) {
      this._topologyMap.set(t.name, t);
    }
  }

  async run(design: TeamDesign, task: TaskOptions): Promise<SwarmResult> {
    this._eventBus.emit({
      type: 'swarm:started',
      payload: { topology: design.topology, agentCount: design.agents.length },
      source: 'swarm-engine',
    });

    const startMs = performance.now();

    // Step 0 -- Create per-task agent logger
    const agentLogger: AgentLogger = createAgentLogger(task.workingDir);

    // Step 1 -- Resolve topology
    const topology = this._topologyMap.get(design.topology);
    if (!topology) {
      throw new Error(`Unknown topology: '${design.topology}'`);
    }

    const allowedTopologies = this._modeEngine.getFeatureGates().topologies;
    if (!allowedTopologies.includes(design.topology)) {
      throw new Error(
        `Topology '${design.topology}' not allowed in '${this._modeEngine.currentMode}' mode`,
      );
    }

    // Step 2 -- Spawn agents
    const agentInstances: AgentInstance[] = [];
    const taskId = task.taskId ?? task.prompt.substring(0, 50);

    // G-06: Resolve workspace directory for agent prompt injection
    const workingDir = task.workingDir;

    for (const role of design.agents) {
      // G-06: Inject workspace path into agent system prompt so agents know where to save files
      const basePrompt = role.systemPrompt;
      const agentSystemPrompt = workingDir
        ? `${basePrompt}\n\nYour workspace directory is: ${workingDir}\nSave all output files (code, documents, data) to this directory using the file_write tool.\nOrganize code in src/, documents in docs/, other artifacts in artifacts/.`
        : basePrompt;

      const instance: AgentInstance = {
        id: generateId(),
        taskId,
        role: role.role,
        model: role.model,
        systemPrompt: agentSystemPrompt,
        tools: role.tools ?? [],
        status: 'idle',
        createdAt: now(),
        stats: {
          messagesReceived: 0,
          messagesSent: 0,
          llmCallCount: 0,
          totalCostUsd: 0,
          totalLatencyMs: 0,
        },
      };
      this._agentRegistry.register(instance);
      agentInstances.push(instance);
    }

    this._eventBus.emit({
      type: 'swarm:topology_set',
      payload: { topology: design.topology },
      source: 'swarm-engine',
    });

    // Step 3 -- MsgHub subscriptions
    for (const agent of agentInstances) {
      this._msgHub.subscribe(agent.id, () => {
        try {
          this._agentRegistry.updateStats(agent.id, { messagesReceived: 1 });
          // Deep logging: message received
          agentLogger.logMessage(agent.id, agent.role, 'received', 'msghub', '(subscription callback)');
        } catch {
          // Agent may already be deregistered
        }
      });
    }

    // Step 4 -- Build context with executeAgent callback (with tool execution loop)
    const executeAgent = async (agent: AgentInstance, prompt: string): Promise<string> => {
      try {
        this._agentRegistry.transitionState(agent.id, 'working');
      } catch {
        // May already be in working state
      }

      // Resolve tool schemas for this agent
      const agentToolNames = agent.tools ?? [];
      const toolSchemas = this._toolRegistry
        ? this._toolRegistry.toToolSchemas().filter(
            (t) => agentToolNames.length === 0 || agentToolNames.includes(t.name),
          )
        : [];
      const hasTools = toolSchemas.length > 0 && this._toolRegistry;

      // Build initial request with tool-use instruction
      // When tools are available, agents MUST be told to use them — LLMs default to
      // writing code as text unless explicitly instructed to invoke file_write/shell_exec.
      const toolInstruction = hasTools
        ? `\n\nCRITICAL: You have file_write and shell_exec tools available. You MUST call file_write for EVERY file you create — do NOT write code as text in your response. Each file_write call creates a REAL file on disk. Use absolute paths starting with: ${workingDir ?? '/tmp'}`
        : '';
      // Agents producing real deliverables (code, documents) need maximum token budget.
      // HTML files alone can be 15-20KB. Incomplete output = useless output.
      // Read from task.maxOutputTokens (set via dashboard execution config), default 16384.
      // Models will cap at their own limit if lower.
      const agentMaxTokens = task.maxOutputTokens ?? 16384;

      const baseRequest: import('../types/common.js').ModelRequest = {
        prompt: `${agent.systemPrompt}${toolInstruction}\n\n${prompt}`,
        quality: 'high',
        maxTokens: agentMaxTokens,
        ...(agent.model && isKnownModel(agent.model) ? { model: agent.model } : {}),
        ...(hasTools ? { tools: toolSchemas } : {}),
      };

      let response = await this._modelRouter.route(baseRequest);
      let totalCost = response.costUsd;
      let totalLatency = response.latencyMs;
      let llmCalls = 1;

      // Deep logging: initial LLM call
      agentLogger.logLlmCall(
        agent.id, agent.role, agent.model ?? 'default',
        baseRequest.prompt, response.content,
        { input: response.inputTokens ?? 0, output: response.outputTokens ?? 0 },
      );

      // Tool execution loop: if the LLM requests tool calls, execute them
      // and send results back for another round, up to MAX_TOOL_ITERATIONS
      if (hasTools && response.toolCalls && response.toolCalls.length > 0) {
        // Build conversation messages for multi-turn tool use
        const messages: Array<{ role: string; content: unknown }> = [
          { role: 'user', content: `${agent.systemPrompt}\n\n${prompt}` },
          // Assistant message with tool calls (content blocks for Anthropic format)
          {
            role: 'assistant',
            content: [
              ...(response.content ? [{ type: 'text', text: response.content }] : []),
              ...response.toolCalls.map((tc) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.input,
              })),
            ],
          },
        ];

        let currentToolCalls: readonly import('../types/common.js').ToolCall[] | undefined = response.toolCalls;
        let iteration = 0;

        while (currentToolCalls && currentToolCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
          iteration++;

          // Execute each tool call
          const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
          for (const tc of currentToolCalls) {
            const result = await this._toolRegistry!.execute(tc.name, tc.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: result.content,
            });
            // Deep logging: tool call
            agentLogger.logToolCall(agent.id, agent.role, tc.name, tc.input, result.content);
          }

          // Add tool results as user message (Anthropic format)
          messages.push({ role: 'user', content: toolResults });

          // Call LLM again with full conversation + tools
          const followUp = await this._modelRouter.route({
            ...baseRequest,
            prompt: '', // prompt is in messages
            messages,
            tools: toolSchemas,
          });

          totalCost += followUp.costUsd;
          totalLatency += followUp.latencyMs;
          llmCalls++;

          // Deep logging: follow-up LLM call
          agentLogger.logLlmCall(
            agent.id, agent.role, agent.model ?? 'default',
            '', followUp.content,
            { input: followUp.inputTokens ?? 0, output: followUp.outputTokens ?? 0 },
          );

          // If the LLM made more tool calls, continue the loop
          if (followUp.toolCalls && followUp.toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content: [
                ...(followUp.content ? [{ type: 'text', text: followUp.content }] : []),
                ...followUp.toolCalls.map((tc) => ({
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.name,
                  input: tc.input,
                })),
              ],
            });
            currentToolCalls = followUp.toolCalls;
          } else {
            // No more tool calls — we have our final response
            response = followUp;
            currentToolCalls = undefined;
          }
        }
      }

      // ---------------------------------------------------------------
      // Universal Type-C: Text Extraction Fallback
      // When the LLM writes code as text instead of using tool_calls
      // (common with Ollama, OpenRouter, Azure Claude, smaller models),
      // extract file_write operations from the response and execute them.
      // This makes file execution work with ANY model, ANY provider.
      // ---------------------------------------------------------------
      // Universal Type-C: If the LLM did NOT use tool_calls (text-only response),
      // extract file operations from the text and execute them.
      // This works for ALL providers regardless of tool_call support.
      if (this._toolRegistry && workingDir && response.content) {
        const extractedFiles = extractFileWritesFromText(response.content, workingDir);
        if (extractedFiles.length > 0) {
          console.debug(`Forge Type-C: extracted ${extractedFiles.length} files from ${agent.role}'s text response`);
          for (const ef of extractedFiles) {
            const result = await this._toolRegistry.execute('file_write', { path: ef.path, content: ef.content });
            agentLogger.logToolCall(agent.id, agent.role, 'file_write', { path: ef.path }, result.content);
          }
        }
      }

      const cleaned = this._handoffRouter.processAgentOutput(
        agent.id,
        response.content,
      );

      try {
        this._agentRegistry.updateStats(agent.id, {
          llmCallCount: llmCalls,
          totalCostUsd: totalCost,
          totalLatencyMs: totalLatency,
        });
      } catch {
        // Agent may have been deregistered
      }

      return cleaned;
    };

    const context: TopologyContext = {
      task,
      config: design.topologyConfig ?? {},
      executeAgent,
      emit: (event: string, data?: unknown) => {
        this._eventBus.emit({
          type: event as import('../types/events.js').QosEventType,
          payload: (data ?? {}) as Record<string, unknown>,
          source: 'swarm-engine',
        });
      },
    };

    // Step 5 -- Invoke topology (pass transport if ProtocolRouter available)
    const activeTransport = this._protocolRouter
      ? this._protocolRouter.selectTransportForTeam(agentInstances)
      : undefined;

    // Phase A2: Wrap MsgHub in A2A adapter when ProtocolRouter is available.
    // Topologies call msgHub.send() as before — A2A wrapping is transparent.
    const effectiveMsgHub = this._protocolRouter
      ? createA2AMsgHub({
          msgHub: this._msgHub,
          converter: new MessageConverter(),
          protocolRouter: this._protocolRouter,
          eventBus: this._eventBus,
        })
      : this._msgHub;

    let result: SwarmResult;
    try {
      result = await topology.run(agentInstances, effectiveMsgHub, context, activeTransport);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this._eventBus.emit({
        type: 'swarm:failed',
        payload: { error: errMsg },
        source: 'swarm-engine',
      });

      for (const agent of agentInstances) {
        try {
          this._agentRegistry.transitionState(agent.id, 'error');
          this._agentRegistry.deregister(agent.id);
        } catch {
          // Best-effort cleanup
        }
      }
      throw error;
    }

    // Step 6 -- Cleanup
    for (const agent of agentInstances) {
      this._msgHub.unsubscribe(agent.id);
      try {
        this._agentRegistry.deregister(agent.id);
      } catch {
        // Already deregistered
      }
    }

    const durationMs = performance.now() - startMs;

    this._eventBus.emit({
      type: 'swarm:completed',
      payload: {
        topology: design.topology,
        durationMs,
        totalCost: result.totalCostUsd,
      },
      source: 'swarm-engine',
    });

    return { ...result, durationMs };
  }

  getTopology(name: string): TopologyExecutor {
    const topology = this._topologyMap.get(name);
    if (!topology) {
      throw new Error(`Unknown topology: '${name}'`);
    }
    return topology;
  }

  listTopologies(): readonly string[] {
    return Array.from(this._topologyMap.keys());
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSwarmEngine(
  msgHub: MsgHub,
  handoffRouter: HandoffRouter,
  agentRegistry: AgentRegistry,
  modeEngine: ModeEngine,
  modelRouter: ModelRouter,
  eventBus: EventBus,
  toolRegistry?: ToolRegistry,
  protocolRouter?: import('./transport/types.js').ProtocolRouter,
): SwarmEngine {
  return new SwarmEngineImpl(
    msgHub, handoffRouter, agentRegistry, modeEngine, modelRouter, eventBus, toolRegistry, protocolRouter,
  );
}
