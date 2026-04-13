// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- MCP Transport Adapter
 *
 * 6 domain-grouped MCP tools with discriminated unions on `action`.
 * Token budget: 6 tools = ~2,400 tokens (vs 17 individual = ~7,000).
 * Tier-based: 'core' = 2, 'extended' = 4, 'full' = 6.
 * Source: Phase 10 LLD Section 2.14
 */
import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CommandRouter } from '../router.js';

/** Converts Zod to JSON Schema draft-07, stripping $schema for MCP compat. */
export function zodToMcpSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-07' }) as Record<string, unknown>;
  delete jsonSchema['$schema'];
  return jsonSchema;
}

// Action-to-command maps per tool domain
const TASK_MAP: Record<string, string> = {
  run: 'run', status: 'status', output: 'output', cancel: 'cancel',
  pause: 'pause', resume: 'resume', steer: 'steer', list: 'list',
};
const CONTEXT_MAP: Record<string, string> = {
  add: 'context.add', scan: 'context.scan', list: 'context.list',
  set_workspace: 'workspace.set', workspace_files: 'workspace.files',
};
const AGENTS_MAP: Record<string, string> = {
  list: 'agents.list', inspect: 'agents.inspect',
  forge_design: 'forge.design', forge_topologies: 'forge.topologies',
};
const QUALITY_MAP: Record<string, string> = {
  judge_results: 'judges.results', memory_search: 'memory.search', memory_store: 'memory.store',
};
const SYSTEM_MAP: Record<string, string> = {
  config_get: 'config.get', config_set: 'config.set',
  models_list: 'models.list', cost_summary: 'cost.summary',
};
const WORKSPACE_MAP: Record<string, string> = {
  set: 'workspace.set', files: 'workspace.files', import_agent: 'import',
};

interface ToolConfig { readonly name: string; readonly description: string; readonly actionMap: Record<string, string> }

const ALL_TOOLS: readonly ToolConfig[] = [
  { name: 'qos_task', description: 'Task lifecycle: run, status, cancel, pause, resume, steer, list, output', actionMap: TASK_MAP },
  { name: 'qos_system', description: 'System: config get/set, model list, cost summary', actionMap: SYSTEM_MAP },
  { name: 'qos_agents', description: 'Agents & Forge: list, inspect, design, topologies', actionMap: AGENTS_MAP },
  { name: 'qos_context', description: 'Context & workspace: add, scan, list, set workspace, files', actionMap: CONTEXT_MAP },
  { name: 'qos_quality', description: 'Quality & memory: judge results, memory search/store', actionMap: QUALITY_MAP },
  { name: 'qos_workspace', description: 'Workspace: set, files, import agent', actionMap: WORKSPACE_MAP },
];

const TIERS = {
  core: ['qos_task', 'qos_system'],
  extended: ['qos_task', 'qos_system', 'qos_agents', 'qos_context'],
  full: ALL_TOOLS.map((t) => t.name),
} as const;

/** Create a workflow via POST /api/workflows. */
async function handleWorkflowCreate(args: Record<string, unknown>): Promise<{
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError: boolean;
}> {
  try {
    const res = await fetch('http://localhost:3000/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: !res.ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: msg }) }], isError: true };
  }
}

function createHandler(actionMap: Record<string, string>, router: CommandRouter) {
  return async (args: Record<string, unknown>) => {
    const action = args.action as string;
    const commandName = actionMap[action];
    if (!commandName) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` } }) }], isError: true };
    }
    const { action: _, ...rest } = args;
    const result = await router.dispatch(commandName, rest);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: !result.success };
  };
}

/** Registers domain-grouped MCP tools. Tier: 'core'|'extended'|'full' (default: env QOS_TIER or 'full'). */
export function registerMcpTools(server: Server, router: CommandRouter, tier?: string): void {
  const resolvedTier = (tier ?? process.env.QOS_TIER ?? 'full') as keyof typeof TIERS;
  const toolNames = TIERS[resolvedTier] ?? TIERS.full;
  for (const tool of ALL_TOOLS) {
    if (!(toolNames as readonly string[]).includes(tool.name)) continue;
    const inputSchema: Record<string, unknown> = {
      type: 'object',
      properties: { action: { type: 'string', enum: Object.keys(tool.actionMap), description: 'Action to perform' } },
      required: ['action'],
    };
    // H-29: Use typed handler registration instead of `as never`
    const handler = createHandler(tool.actionMap, router);
    (server as unknown as { setRequestHandler(schema: { method: string }, fn: typeof handler): void })
      .setRequestHandler({ method: `tools/call/${tool.name}` }, handler);
    (server as unknown as Record<string, unknown>)[`__tool_${tool.name}`] = {
      name: tool.name, description: tool.description, inputSchema,
    };
  }

  // Standalone tool: qos_workflow_create
  const wfSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Workflow name' },
      description: { type: 'string', description: 'Workflow description' },
      steps: { type: 'array', description: 'Workflow steps' },
    },
    required: ['name'],
  };
  (server as unknown as { setRequestHandler(schema: { method: string }, fn: typeof handleWorkflowCreate): void })
    .setRequestHandler({ method: 'tools/call/qos_workflow_create' }, handleWorkflowCreate);
  (server as unknown as Record<string, unknown>).__tool_qos_workflow_create = {
    name: 'qos_workflow_create', description: 'Create a new workflow', inputSchema: wfSchema,
  };
}
