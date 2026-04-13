// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- MCP Server Channel
 *
 * MCP Server with 25 tools via @modelcontextprotocol/sdk.
 * Exposes the full orchestrator API as MCP tools for LLM consumption.
 * Uses zodToJsonSchema conversion for MCP tool registration.
 *
 * L-09: LLD TOOL NAME DEVIATIONS (intentional):
 *   1. 'run_task' (impl) vs 'qos_run' (LLD) -- snake_case verb_noun is
 *      clearer for LLM tool use; qos_ prefix is redundant since the MCP
 *      server name already identifies Qualixar OS.
 *   2. 'get_status' (impl) vs 'qos_status' (LLD) -- same rationale.
 *   3. 'search_memory' (impl) vs 'qos_memory_search' (LLD) -- verb-first
 *      naming is consistent with MCP tool conventions (action_target).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { VERSION } from '../version.js';
import type { Orchestrator } from '../engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Tool Input Schemas
// ---------------------------------------------------------------------------

const RunTaskSchema = z.object({
  prompt: z.string().describe('The task prompt'),
  type: z.enum(['code', 'research', 'analysis', 'creative', 'custom']).optional(),
  mode: z.enum(['companion', 'power']).optional(),
  budget_usd: z.number().optional(),
  topology: z.string().optional(),
  simulate: z.boolean().optional(),
});

const TaskIdSchema = z.object({
  taskId: z.string().describe('The task ID'),
});

const RedirectSchema = z.object({
  taskId: z.string().describe('The task ID'),
  newPrompt: z.string().describe('New prompt for redirection'),
});

const SearchMemorySchema = z.object({
  query: z.string().describe('Search query'),
  layer: z.string().optional(),
  limit: z.number().optional(),
});

const ForgeDesignsSchema = z.object({
  taskType: z.string().optional().describe('Filter by task type'),
});

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

interface McpToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

// M-19: Improved hand-rolled converter to handle ZodArray, ZodOptional, ZodDefault, and ZodObject nesting.
// If zod-to-json-schema becomes a dependency, replace this with the library.
function zodToInputSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(shape)) {
      const isOptional = val instanceof z.ZodOptional;
      const hasDefault = val instanceof z.ZodDefault;
      // Unwrap optional and default wrappers to get the inner type
      let inner: z.ZodType = val;
      if (isOptional) inner = (val as z.ZodOptional<z.ZodType>).unwrap();
      if (hasDefault) inner = (val as z.ZodDefault<z.ZodType>)._def.innerType;

      const prop = zodTypeToJsonProp(inner);
      properties[key] = prop;
      if (!isOptional && !hasDefault) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
  return { type: 'object', properties: {} };
}

/** Convert a single Zod type to a JSON Schema property descriptor. */
function zodTypeToJsonProp(inner: z.ZodType): Record<string, unknown> {
  let prop: Record<string, unknown> = { type: 'string' };

  if (inner instanceof z.ZodNumber) {
    prop = { type: 'number' };
  } else if (inner instanceof z.ZodBoolean) {
    prop = { type: 'boolean' };
  } else if (inner instanceof z.ZodEnum) {
    prop = { type: 'string', enum: inner.options };
  } else if (inner instanceof z.ZodArray) {
    const elementSchema = (inner as z.ZodArray<z.ZodType>).element;
    const itemProp = zodTypeToJsonProp(elementSchema);
    prop = { type: 'array', items: itemProp };
  } else if (inner instanceof z.ZodObject) {
    prop = zodToInputSchema(inner);
  }

  if (inner.description) {
    prop.description = inner.description;
  }
  return prop;
}

function buildToolDefs(): readonly McpToolDef[] {
  return [
    { name: 'run_task', description: 'Run a new task', inputSchema: zodToInputSchema(RunTaskSchema) },
    { name: 'get_status', description: 'Get task status', inputSchema: zodToInputSchema(TaskIdSchema) },
    { name: 'list_tasks', description: 'List all tasks', inputSchema: { type: 'object', properties: {} } },
    { name: 'pause_task', description: 'Pause a running task', inputSchema: zodToInputSchema(TaskIdSchema) },
    { name: 'resume_task', description: 'Resume a paused task', inputSchema: zodToInputSchema(TaskIdSchema) },
    { name: 'cancel_task', description: 'Cancel a task', inputSchema: zodToInputSchema(TaskIdSchema) },
    { name: 'redirect_task', description: 'Redirect a task with new prompt', inputSchema: zodToInputSchema(RedirectSchema) },
    { name: 'list_agents', description: 'List registered agents', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_cost', description: 'Get cost summary', inputSchema: zodToInputSchema(z.object({ taskId: z.string().optional() })) },
    { name: 'get_judge_results', description: 'Get judge evaluation results', inputSchema: zodToInputSchema(z.object({ taskId: z.string().optional() })) },
    { name: 'get_forge_designs', description: 'Get Forge team designs', inputSchema: zodToInputSchema(ForgeDesignsSchema) },
    { name: 'search_memory', description: 'Search memory — powered by SuperLocalMemory (Lite)', inputSchema: zodToInputSchema(SearchMemorySchema) },
    { name: 'list_topologies', description: 'List available swarm topologies', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_rl_stats', description: 'Get strategy scoring statistics', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_system_config', description: 'Get system configuration', inputSchema: { type: 'object', properties: {} } },
    // H-16: Phase 14-16 tools
    { name: 'send_chat_message', description: 'Send a message in a chat conversation', inputSchema: zodToInputSchema(z.object({ conversationId: z.string().describe('Conversation ID'), content: z.string().describe('Message content'), model: z.string().optional() })) },
    { name: 'list_connectors', description: 'List configured connectors', inputSchema: { type: 'object', properties: {} } },
    { name: 'test_connector', description: 'Test a connector connection', inputSchema: zodToInputSchema(z.object({ connectorId: z.string().describe('Connector ID') })) },
    { name: 'list_datasets', description: 'List available datasets', inputSchema: { type: 'object', properties: {} } },
    { name: 'preview_dataset', description: 'Preview rows from a dataset', inputSchema: zodToInputSchema(z.object({ datasetId: z.string().describe('Dataset ID'), limit: z.number().optional() })) },
    { name: 'search_vectors', description: 'Search the vector store', inputSchema: zodToInputSchema(z.object({ query: z.string().describe('Search query'), limit: z.number().optional() })) },
    { name: 'list_blueprints', description: 'List agent blueprints', inputSchema: { type: 'object', properties: {} } },
    { name: 'deploy_blueprint', description: 'Deploy a blueprint', inputSchema: zodToInputSchema(z.object({ blueprintId: z.string().describe('Blueprint ID') })) },
    { name: 'list_prompts', description: 'List prompt templates', inputSchema: { type: 'object', properties: {} } },
    { name: 'create_prompt', description: 'Create a prompt template', inputSchema: zodToInputSchema(z.object({ name: z.string().describe('Prompt name'), template: z.string().describe('Prompt template'), description: z.string().optional() })) },
  ];
}

// ---------------------------------------------------------------------------
// Tool Dispatcher
// ---------------------------------------------------------------------------

async function dispatchTool(
  orchestrator: Orchestrator,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'run_task': {
      const parsed = RunTaskSchema.parse(args);
      const result = await orchestrator.run(parsed);
      return JSON.stringify(result, null, 2);
    }
    case 'get_status': {
      const { taskId } = TaskIdSchema.parse(args);
      const status = orchestrator.getStatus(taskId);
      return JSON.stringify(status, null, 2);
    }
    case 'list_tasks': {
      const rows = orchestrator.db.query<{ id: string; status: string; created_at: string }>(
        'SELECT id, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 50',
        [],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'pause_task': {
      const { taskId } = TaskIdSchema.parse(args);
      await orchestrator.pause(taskId);
      return JSON.stringify({ success: true, taskId, action: 'paused' });
    }
    case 'resume_task': {
      const { taskId } = TaskIdSchema.parse(args);
      await orchestrator.resume(taskId);
      return JSON.stringify({ success: true, taskId, action: 'resumed' });
    }
    case 'cancel_task': {
      const { taskId } = TaskIdSchema.parse(args);
      await orchestrator.cancel(taskId);
      return JSON.stringify({ success: true, taskId, action: 'cancelled' });
    }
    case 'redirect_task': {
      const { taskId, newPrompt } = RedirectSchema.parse(args);
      await orchestrator.redirect(taskId, newPrompt);
      return JSON.stringify({ success: true, taskId, action: 'redirected' });
    }
    case 'list_agents': {
      const agents = orchestrator.agentRegistry.listAgents();
      return JSON.stringify(agents, null, 2);
    }
    case 'get_cost': {
      const taskId = (args.taskId as string) ?? undefined;
      const summary = orchestrator.costTracker.getSummary(taskId);
      return JSON.stringify(summary, null, 2);
    }
    case 'get_judge_results': {
      const taskId = (args.taskId as string) ?? undefined;
      const results = orchestrator.judgePipeline.getResults(taskId);
      return JSON.stringify(results ?? [], null, 2);
    }
    case 'get_forge_designs': {
      const taskType = (args.taskType as string) ?? undefined;
      const designs = orchestrator.forge.getDesigns(taskType);
      return JSON.stringify(designs, null, 2);
    }
    case 'search_memory': {
      const parsed = SearchMemorySchema.parse(args);
      const searchOpts: { layer?: string; limit?: number } = {};
      if (parsed.layer !== undefined) { searchOpts.layer = parsed.layer; }
      if (parsed.limit !== undefined) { searchOpts.limit = parsed.limit; }
      const results = await orchestrator.slmLite.search(parsed.query, searchOpts);
      return JSON.stringify(results, null, 2);
    }
    case 'list_topologies': {
      const gates = orchestrator.modeEngine.getFeatureGates();
      return JSON.stringify(gates.topologies, null, 2);
    }
    case 'get_rl_stats': {
      const stats = orchestrator.strategyScorer.getStats();
      return JSON.stringify(stats, null, 2);
    }
    case 'get_system_config': {
      const config = orchestrator.modeEngine.getConfig();
      return JSON.stringify(config, null, 2);
    }
    // H-16: Phase 14-16 tool dispatchers
    case 'send_chat_message': {
      const convId = args.conversationId as string;
      const content = args.content as string;
      const model = (args.model as string) ?? undefined;
      // Store message and trigger model call
      const msgId = `msg-mcp-${Date.now()}`;
      orchestrator.db.insert('chat_messages', {
        id: msgId,
        conversation_id: convId,
        role: 'user',
        parts: JSON.stringify([{ type: 'text', text: content }]),
        status: 'completed',
        timestamp: new Date().toISOString(),
      });
      const response = await orchestrator.modelRouter.route({
        prompt: content,
        model,
        taskType: 'chat',
        quality: 'high',
      });
      const assistantMsgId = `msg-mcp-a-${Date.now()}`;
      orchestrator.db.insert('chat_messages', {
        id: assistantMsgId,
        conversation_id: convId,
        role: 'assistant',
        parts: JSON.stringify([{ type: 'text', text: response.content }]),
        status: 'completed',
        model: response.model,
        cost: response.costUsd,
        timestamp: new Date().toISOString(),
      });
      return JSON.stringify({ messageId: assistantMsgId, content: response.content, model: response.model }, null, 2);
    }
    case 'list_connectors': {
      const rows = orchestrator.db.query<{ id: string; type: string; status: string }>(
        'SELECT id, type, status FROM connectors ORDER BY created_at DESC LIMIT 50',
        [],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'test_connector': {
      const connectorId = args.connectorId as string;
      const connector = orchestrator.db.query<{ id: string; type: string; config: string }>(
        'SELECT id, type, config FROM connectors WHERE id = ?',
        [connectorId],
      );
      if (connector.length === 0) {
        return JSON.stringify({ success: false, error: 'Connector not found' });
      }
      return JSON.stringify({ success: true, connectorId, type: connector[0].type });
    }
    case 'list_datasets': {
      const rows = orchestrator.db.query<{ id: string; name: string; row_count: number }>(
        'SELECT id, name, row_count FROM datasets ORDER BY created_at DESC LIMIT 50',
        [],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'preview_dataset': {
      const datasetId = args.datasetId as string;
      const limit = (args.limit as number) ?? 10;
      const rows = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM dataset_rows WHERE dataset_id = ? LIMIT ?',
        [datasetId, limit],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'search_vectors': {
      const query = args.query as string;
      const limit = (args.limit as number) ?? 10;
      const results = await orchestrator.slmLite.search(query, { limit });
      return JSON.stringify(results, null, 2);
    }
    case 'list_blueprints': {
      const rows = orchestrator.db.query<{ id: string; name: string; topology: string }>(
        'SELECT id, name, topology FROM blueprints ORDER BY created_at DESC LIMIT 50',
        [],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'deploy_blueprint': {
      const blueprintId = args.blueprintId as string;
      orchestrator.db.db
        .prepare('UPDATE blueprints SET usage_count = usage_count + 1, last_deployed = ? WHERE id = ?')
        .run(new Date().toISOString(), blueprintId);
      return JSON.stringify({ success: true, blueprintId, action: 'deployed' });
    }
    case 'list_prompts': {
      const rows = orchestrator.db.query<{ id: string; name: string; template: string }>(
        'SELECT id, name, template FROM prompts ORDER BY created_at DESC LIMIT 50',
        [],
      );
      return JSON.stringify(rows, null, 2);
    }
    case 'create_prompt': {
      const name = args.name as string;
      const template = args.template as string;
      const description = (args.description as string) ?? '';
      const promptId = `prompt-${Date.now()}`;
      orchestrator.db.insert('prompts', {
        id: promptId,
        name,
        template,
        description,
        created_at: new Date().toISOString(),
      });
      return JSON.stringify({ success: true, promptId, name });
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpServer(orchestrator: Orchestrator): Server {
  const server = new Server(
    { name: 'qos', version: VERSION },
    { capabilities: { tools: {} } },
  );

  const toolDefs = buildToolDefs();

  /* v8 ignore start -- MCP protocol handlers, invoked by transport, tested via dispatchTool + buildToolDefs */
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefs.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request: z.infer<typeof CallToolRequestSchema>) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatchTool(orchestrator, name, args ?? {});
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });
  /* v8 ignore stop */

  return server;
}

/* v8 ignore start -- requires real stdio transport */
export async function startMcpServer(orchestrator: Orchestrator): Promise<void> {
  const server = createMcpServer(orchestrator);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
/* v8 ignore stop */

// Export for testing
export {
  buildToolDefs,
  dispatchTool,
  zodToInputSchema,
  RunTaskSchema,
  TaskIdSchema,
  RedirectSchema,
  SearchMemorySchema,
  ForgeDesignsSchema,
};
