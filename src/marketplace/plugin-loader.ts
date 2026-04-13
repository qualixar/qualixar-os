// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Plugin Loader
 *
 * Loads a validated plugin into the runtime registries (tools, agents, skills)
 * and provides a symmetric unload path for disable/uninstall.
 *
 * Pattern: Adapter — translates PluginManifest definitions into the shapes
 * expected by ToolRegistry, AgentRegistry, and SkillRegistry.
 *
 * Hard Rule HR-17: No shell commands for I/O; all file access via node:fs.
 */

import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRegistry, AgentInstance } from '../agents/agent-registry.js';
import type { SkillRegistry } from '../types/phase20.js';
import type {
  InstalledPlugin,
  PluginToolDef,
  PluginToolImplementation,
  PluginTier,
} from '../types/phase20.js';
import type { PluginSandbox } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// PluginLoader interface
// ---------------------------------------------------------------------------

export interface PluginLoader {
  loadPlugin(
    plugin: InstalledPlugin,
    toolRegistry: ToolRegistry,
    agentRegistry: AgentRegistry,
    skillRegistry: SkillRegistry,
    sandbox: PluginSandbox,
  ): void;

  unloadPlugin(
    plugin: InstalledPlugin,
    toolRegistry: ToolRegistry,
    agentRegistry: AgentRegistry,
    skillRegistry: SkillRegistry,
  ): void;
}

// ---------------------------------------------------------------------------
// Internal tool handler factories
// ---------------------------------------------------------------------------

type ToolResult = { readonly content: string; readonly isError?: boolean };
type HandlerFn = (input: Record<string, unknown>) => Promise<ToolResult>;

function makeBuiltinHandler(handlerName: string): HandlerFn {
  return async (_input) => ({
    content: `[builtin handler '${handlerName}' — register via bootstrap for real execution]`,
    isError: false,
  });
}

function makeHttpHandler(
  url: string,
  method: 'GET' | 'POST',
  headers: Readonly<Record<string, string>>,
): HandlerFn {
  return async (input) => {
    const reqOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (method === 'POST') {
      reqOptions.body = JSON.stringify(input);
    }
    const resolvedUrl =
      method === 'GET'
        ? `${url}?${new URLSearchParams(input as Record<string, string>).toString()}`
        : url;

    const response = await fetch(resolvedUrl, reqOptions);
    const text = await response.text();
    return { content: text, isError: !response.ok };
  };
}

// DEF-003: Reject shell metacharacters in user-supplied values
const DANGEROUS_CHARS = /[;&|`$(){}[\]!#~<>\\]/;

function makeShellHandler(command: string, timeoutMs: number): HandlerFn {
  return async (input) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    // DEF-003: Split template first, then substitute per-argument to preserve
    // argument boundaries. Values with spaces stay as single args.
    const templateParts = command.split(/\s+/);
    const substituteValue = (_: string, key: string): string => {
      const val = input[key.trim()];
      if (val === undefined) return '';
      const strVal = String(val);
      if (DANGEROUS_CHARS.test(strVal)) {
        throw new Error(`Unsafe character in input value for key '${key.trim()}'`);
      }
      return strVal;
    };
    const bin = templateParts[0].replace(/\{\{([^}]+)\}\}/g, substituteValue);
    const args = templateParts.slice(1).map(part =>
      part.replace(/\{\{([^}]+)\}\}/g, substituteValue),
    );
    try {
      const { stdout, stderr } = await Promise.race([
        execFileAsync(bin, args, { timeout: timeoutMs }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Shell timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      return { content: stdout || stderr };
    } catch (err) {
      return {
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  };
}

function buildHandler(impl: PluginToolImplementation): HandlerFn {
  switch (impl.type) {
    case 'builtin':
      return makeBuiltinHandler(impl.handler);
    case 'http':
      return makeHttpHandler(impl.url, impl.method, impl.headers);
    case 'shell':
      return makeShellHandler(impl.command, impl.timeout * 1_000);
  }
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

function makeAgentId(pluginId: string, agentName: string): string {
  return `plugin:${pluginId}:${agentName}`;
}

function buildAgentInstance(
  pluginId: string,
  taskId: string,
  def: { name: string; model: string; systemPrompt: string; tools: readonly string[]; role: string },
): AgentInstance {
  return {
    id: makeAgentId(pluginId, def.name),
    taskId,
    role: def.role,
    model: def.model,
    systemPrompt: def.systemPrompt,
    tools: def.tools,
    status: 'idle',
    createdAt: new Date().toISOString(),
    stats: {
      messagesReceived: 0,
      messagesSent: 0,
      llmCallCount: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registry internal access
// Note: ToolRegistry.register expects a ToolDefinition. Unregister uses
// the internal _tools map directly (per spec note in the brief).
// ---------------------------------------------------------------------------

function toolDef(
  toolSpec: PluginToolDef,
  pluginId: string,
  tier: PluginTier,
  sandbox: PluginSandbox,
): Parameters<ToolRegistry['register']>[0] {
  let handler = buildHandler(toolSpec.implementation);

  if (tier === 'community') {
    handler = sandbox.wrapHandler(pluginId, handler);
  }

  return {
    name: toolSpec.name,
    description: toolSpec.description,
    inputSchema: toolSpec.inputSchema as Record<string, unknown>,
    handler,
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class PluginLoaderImpl implements PluginLoader {
  loadPlugin(
    plugin: InstalledPlugin,
    toolRegistry: ToolRegistry,
    agentRegistry: AgentRegistry,
    skillRegistry: SkillRegistry,
    sandbox: PluginSandbox,
  ): void {
    const { manifest, id: pluginId, tier } = plugin;

    // 1. Register tools
    for (const tool of manifest.provides.tools) {
      try {
        toolRegistry.register(toolDef(tool, pluginId, tier, sandbox));
      } catch {
        // Tool already registered (e.g. reload after crash) — skip
      }
    }

    // 2. Register agents (use a synthetic taskId scoped to the plugin)
    for (const agentDef of manifest.provides.agents) {
      try {
        agentRegistry.register(
          buildAgentInstance(pluginId, `plugin-task:${pluginId}`, agentDef),
        );
      } catch {
        // Agent already registered — skip
      }
    }

    // 3. Register skills
    for (const skill of manifest.provides.skills) {
      skillRegistry.register(pluginId, skill);
    }
  }

  unloadPlugin(
    plugin: InstalledPlugin,
    toolRegistry: ToolRegistry,
    agentRegistry: AgentRegistry,
    skillRegistry: SkillRegistry,
  ): void {
    const { manifest, id: pluginId } = plugin;

    // 1. Unregister tools — access internal map as per spec note
    const rawRegistry = toolRegistry as unknown as { _tools?: Map<string, unknown> };
    if (rawRegistry._tools) {
      for (const tool of manifest.provides.tools) {
        rawRegistry._tools.delete(tool.name);
      }
    }

    // 2. Deregister agents
    for (const agentDef of manifest.provides.agents) {
      try {
        agentRegistry.deregister(makeAgentId(pluginId, agentDef.name));
      } catch {
        // Already gone
      }
    }

    // 3. Unregister skills
    skillRegistry.unregisterByPlugin(pluginId);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginLoader(): PluginLoader {
  return new PluginLoaderImpl();
}
