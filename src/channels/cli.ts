// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- CLI Channel
 *
 * Commander.js program with 12 commands.
 * Uses lazy initialization for the orchestrator via getOrchestrator().
 * Exports program factory and getOrchestrator for testability.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'yaml';
import { Command } from 'commander';
import { QosConfigSchema, type QosConfig } from '../types/common.js';
import type { Orchestrator } from '../engine/orchestrator.js';
import { formatResult, formatStatus, formatCost, formatError } from './formatters.js';
import { startHttpServer } from './http-server.js';
import { handleInitCommand } from '../cli/cli-init-command.js';
import { handleDoctorCommand } from '../cli/cli-doctor-command.js';
import { handleNewCommand } from '../cli/cli-new-command.js';
import { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Parse Helpers (Commander passes (value, previousValue) -- avoid parseInt radix clash)
// ---------------------------------------------------------------------------

function parseIntOption(value: string): number {
  return parseInt(value, 10);
}

/** Coerce a CLI string value to its natural JS type (number, boolean, null). */
function coerceConfigValue(value: string): string | number | boolean | null {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Match integer or float patterns (including negatives)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (isFinite(num)) return num;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Types for DI
// ---------------------------------------------------------------------------

export interface CliDeps {
  readonly createQos: (config: QosConfig) => Orchestrator;
  readonly loadConfig: () => QosConfig;
  readonly log: (msg: string) => void;
  readonly exit: (code: number) => void;
}

// ---------------------------------------------------------------------------
// Config Loader
// ---------------------------------------------------------------------------

/* v8 ignore start -- filesystem config loader, requires real config file */
function loadEnvFile(): void {
  // Load ~/.qualixar-os/.env into process.env (no dotenv dependency needed)
  try {
    const envPath = path.join(os.homedir(), '.qualixar-os', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Handle "export KEY=VALUE" and "KEY=VALUE" formats
        const cleaned = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
        const eqIdx = cleaned.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = cleaned.slice(0, eqIdx).trim();
        let value = cleaned.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch { /* env file is optional */ }
}

function loadDefaultConfig(): QosConfig {
  // Load env vars BEFORE config (config may reference env vars)
  loadEnvFile();
  try {
    const configPath = path.join(os.homedir(), '.qualixar-os', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const raw = yaml.parse(content) ?? {};
      return QosConfigSchema.parse(raw);
    }
  } catch {
    // Fall through to defaults
  }
  return QosConfigSchema.parse({});
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Lazy Orchestrator
// ---------------------------------------------------------------------------

let _orchestrator: Orchestrator | null = null;
let _deps: CliDeps | null = null;

export function setCliDeps(deps: CliDeps): void {
  _deps = deps;
  _orchestrator = null;
}

export function resetCliDeps(): void {
  _deps = null;
  _orchestrator = null;
}

export async function getOrchestrator(): Promise<Orchestrator> {
  if (_orchestrator) {
    return _orchestrator;
  }

  if (_deps) {
    const config = _deps.loadConfig();
    _orchestrator = _deps.createQos(config);
    return _orchestrator;
  }

  /* v8 ignore start -- production fallback: dynamic import + real config */
  const config = loadDefaultConfig();
  const { createQos } = await import('../index.js');
  _orchestrator = createQos(config);
  return _orchestrator;
  /* v8 ignore stop */
}

function log(msg: string): void {
  if (_deps) {
    _deps.log(msg);
  } else {
    /* v8 ignore next -- production console fallback */
    console.log(msg);
  }
}

function exitProcess(code: number): void {
  if (_deps) {
    _deps.exit(code);
  } else {
    /* v8 ignore next -- production process.exit fallback */
    process.exit(code);
  }
}

// ---------------------------------------------------------------------------
// Program Definition
// ---------------------------------------------------------------------------

export function createProgram(): Command {
  const program = new Command();

  program
    .name('qos')
    .description('Qualixar OS: The complete agent operating system')
    .version(VERSION);

  // 1. run <prompt>
  program
    .command('run <prompt>')
    .description('Run a task with the given prompt')
    .option('-t, --type <type>', 'Task type: code|research|analysis|creative|custom', 'custom')
    .option('-m, --mode <mode>', 'Mode: companion|power', 'companion')
    .option('-b, --budget <usd>', 'Budget in USD', parseFloat)
    .option('--topology <topology>', 'Swarm topology to use')
    .option('--simulate', 'Run simulation before execution')
    .option('--stream', 'Stream output in real-time')
    .option('--template <name>', 'Template to use')
    .action(async (prompt: string, opts: Record<string, unknown>) => {
      try {
        const orchestrator = await getOrchestrator();
        const result = await orchestrator.run({
          prompt,
          type: opts.type as 'code' | 'research' | 'analysis' | 'creative' | 'custom',
          mode: opts.mode as 'companion' | 'power',
          budget_usd: opts.budget as number | undefined,
          topology: opts.topology as string | undefined,
          simulate: opts.simulate as boolean | undefined,
          stream: opts.stream as boolean | undefined,
        });
        log(formatResult(result, 'cli'));
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 2. status [taskId]
  program
    .command('status [taskId]')
    .description('Show task status')
    .action(async (taskId?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        if (!taskId) {
          // L-07: Show 5 most recent tasks when no taskId is provided
          const recentTasks = orchestrator.db.query<Record<string, unknown>>(
            'SELECT id, status, prompt, created_at FROM tasks ORDER BY created_at DESC LIMIT 5',
            [],
          );
          if (recentTasks.length === 0) {
            log('No tasks found. Run a task first: qos run <prompt>');
            return;
          }
          log('\n  Recent tasks:\n');
          log(`  ${'Task ID'.padEnd(38)} ${'Status'.padEnd(12)} ${'Prompt'.padEnd(40)} ${'Created'}`);
          log(`  ${'─'.repeat(38)} ${'─'.repeat(12)} ${'─'.repeat(40)} ${'─'.repeat(20)}`);
          for (const task of recentTasks) {
            const id = (task.id as string).padEnd(38);
            const status = ((task.status as string) ?? 'unknown').padEnd(12);
            const prompt = ((task.prompt as string) ?? '').replace(/\n/g, ' ').slice(0, 38).padEnd(40);
            const created = ((task.created_at as string) ?? '').slice(0, 19);
            log(`  ${id} ${status} ${prompt} ${created}`);
          }
          log('');
          return;
        }
        const status = orchestrator.getStatus(taskId);
        log(formatStatus(status, 'cli'));
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 3. cost [taskId]
  program
    .command('cost [taskId]')
    .description('Show cost summary')
    .action(async (taskId?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        const summary = orchestrator.costTracker.getSummary(taskId);
        log(formatCost(summary, 'cli'));
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 4. agents [taskId]
  program
    .command('agents [taskId]')
    .description('List agents')
    .action(async (taskId?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        if (taskId) {
          const status = orchestrator.getStatus(taskId);
          log(`Agents for task ${taskId}: ${status.currentAgents.join(', ') || 'none'}`);
        } else {
          const agents = orchestrator.agentRegistry.listAgents();
          if (agents.length === 0) {
            log('No registered agents.');
          } else {
            for (const agent of agents) {
              log(`  ${agent.id} [${agent.status}] - ${agent.role}`);
            }
          }
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 5. judges [taskId]
  program
    .command('judges [taskId]')
    .description('Show judge results')
    .action(async (taskId?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        const results = orchestrator.judgePipeline.getResults(taskId);
        if (!results || results.length === 0) {
          log('No judge results found.');
        } else {
          for (const r of results) {
            log(`  ${r.judgeModel}: ${r.verdict} (score: ${r.score.toFixed(2)})`);
          }
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 6. forge [taskType]
  program
    .command('forge [taskType]')
    .description('Show Forge design library')
    .action(async (taskType?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        const designs = orchestrator.forge.getDesigns(taskType);
        if (designs.length === 0) {
          log('No designs found.');
        } else {
          for (const d of designs) {
            const label = (d as Record<string, unknown>).name ?? (d as Record<string, unknown>).label ?? d.id.slice(0, 8);
            log(`  ${label}: ${d.taskType} (${d.topology}) - ${d.agents.length} agents`);
          }
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 7. memory <query>
  program
    .command('memory <query>')
    .description('Search memory')
    .option('-l, --layer <layer>', 'Memory layer to search')
    .option('--limit <n>', 'Max results', parseIntOption, 10)
    .action(async (query: string, opts: Record<string, unknown>) => {
      try {
        const orchestrator = await getOrchestrator();
        const results = await orchestrator.slmLite.search(query, {
          layer: opts.layer as string | undefined,
          limit: opts.limit as number,
        });
        // Filter out code-graph community data — show clean memory entries only
        const memoryEntries = results.filter(
          (e: { layer?: string; source?: string }) =>
            e.layer !== 'code_graph' && e.source !== 'code_graph',
        );

        if (memoryEntries.length === 0) {
          log('No memory entries found.');
        } else {
          log(`\n  Found ${memoryEntries.length} memory entries:\n`);
          log(`  ${'#'.padEnd(4)} ${'Layer'.padEnd(12)} ${'Content'}`);
          log(`  ${'─'.repeat(4)} ${'─'.repeat(12)} ${'─'.repeat(60)}`);
          for (let i = 0; i < memoryEntries.length; i++) {
            const entry = memoryEntries[i];
            const num = String(i + 1).padEnd(4);
            const layer = (entry.layer ?? 'unknown').padEnd(12);
            const content = entry.content
              .replace(/\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);
            log(`  ${num} ${layer} ${content}`);
          }
          log('');
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 8. config [key] [value]
  program
    .command('config [key] [value]')
    .description('Show or update config')
    .action(async (key?: string, value?: string) => {
      try {
        const orchestrator = await getOrchestrator();
        if (!key) {
          const config = orchestrator.modeEngine.getConfig();
          log(JSON.stringify(config, null, 2));
        } else if (!value) {
          const config = orchestrator.modeEngine.getConfig();
          const segments = key.split('.');
          let current: unknown = config;
          for (const seg of segments) {
            if (current && typeof current === 'object') {
              current = (current as Record<string, unknown>)[seg];
            } else {
              current = undefined;
            }
          }
          if (current === undefined) {
            log(`Key not found: ${key}`);
          } else {
            log(JSON.stringify(current, null, 2));
          }
        } else {
          // M-14: CLI config write via YAML
          const configPath = path.join(os.homedir(), '.qualixar-os', 'config.yaml');
          let configObj: Record<string, unknown> = {};
          if (fs.existsSync(configPath)) {
            configObj = yaml.parse(fs.readFileSync(configPath, 'utf-8')) ?? {};
          }
          // Set nested key: e.g., "models.primary" = "claude-sonnet-4-6"
          const segments = key.split('.');
          let target: Record<string, unknown> = configObj;
          for (let i = 0; i < segments.length - 1; i++) {
            if (!(segments[i] in target) || typeof target[segments[i]] !== 'object') {
              target[segments[i]] = {};
            }
            target = target[segments[i]] as Record<string, unknown>;
          }
          target[segments[segments.length - 1]] = coerceConfigValue(value);
          const dir = path.dirname(configPath);
          if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
          fs.writeFileSync(configPath, yaml.stringify(configObj), 'utf-8');
          log(`Config updated: ${key} = ${JSON.stringify(coerceConfigValue(value))}`);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 9. import <path>
  program
    .command('import <path>')
    .description('Import agent from SOUL.md or other format')
    .option('-f, --format <format>', 'Source format: openclaw|deerflow|nemoclaw|gitagent')
    .action(async (agentPath: string, opts: Record<string, unknown>) => {
      try {
        const resolvedPath = path.resolve(agentPath);
        log(`Importing agent from: ${resolvedPath} (format: ${opts.format ?? 'auto-detect'})`);

        const { AgentConverter } = await import('../compatibility/converter.js');
        const converter = new AgentConverter();
        const spec = await converter.detectAndConvert(resolvedPath);

        const orch = await getOrchestrator();
        const { randomUUID } = await import('node:crypto');
        const agentId = randomUUID();
        orch.db.insert('imported_agents', {
          id: agentId,
          source_format: spec.source.format,
          original_path: spec.source.originalPath ?? resolvedPath,
          agent_spec: JSON.stringify(spec),
          version: spec.version,
          created_at: new Date().toISOString(),
        });

        orch.eventBus.emit({
          type: 'compat:agent_imported',
          payload: {
            agentId,
            name: spec.name,
            sourceFormat: spec.source.format,
            roles: spec.roles.length,
          },
          source: 'cli',
        });

        log(`Agent "${spec.name}" imported successfully.`);
        log(`  ID:     ${agentId}`);
        log(`  Format: ${spec.source.format}`);
        log(`  Roles:  ${spec.roles.map((r) => r.role).join(', ')}`);
        log(`  Tools:  ${spec.tools.length}`);
      } catch (err) {
        /* v8 ignore start -- defensive */
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
        /* v8 ignore stop */
      }
    });

  // 10. serve
  program
    .command('serve')
    .description('Start HTTP/WebSocket/A2A server')
    .option('-p, --port <port>', 'Port number', parseIntOption, 3000)
    .option('--dashboard', 'Also start dashboard')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const orch = await getOrchestrator();
        const port = opts.port as number;
        log(`Starting Qualixar OS HTTP server on port ${port}...`);
        log(`  API:       http://localhost:${port}/api/health`);
        if (opts.dashboard) {
          log(`  Dashboard: http://localhost:${port}/dashboard`);
        }
        log('');
        const httpServer = startHttpServer(orch, port);
        log(`Qualixar OS server is running. Press Ctrl+C to stop.`);
        if (!_deps) {
          const keepAlive = setInterval(() => {}, 1 << 30);
          const gracefulShutdown = () => {
            clearInterval(keepAlive);
            try { httpServer.close(); } catch { /* already closed */ }
            try { orch.db.close(); } catch { /* already closed */ }
            process.exit(0);
          };
          // M-09: Remove existing signal listeners before adding new ones to prevent accumulation
          process.removeAllListeners('SIGINT');
          process.removeAllListeners('SIGTERM');
          process.once('SIGINT', gracefulShutdown);
          process.once('SIGTERM', gracefulShutdown);
        }
      } catch (err) {
        /* v8 ignore start */
        if (err instanceof Error) {
          log(`Error: ${err.message}`);
          log(err.stack ?? '');
        }
        exitProcess(1);
        /* v8 ignore stop */
      }
    });

  // 11. dashboard
  program
    .command('dashboard')
    .description('Open dashboard')
    .option('-p, --port <port>', 'Port number', parseIntOption, 3333)
    .action(async (opts: Record<string, unknown>) => {
      try {
        const port = opts.port as number;
        const orch = await getOrchestrator();
        log(`Starting dashboard server on port ${port}...`);
        const httpServer = startHttpServer(orch, port);
        log(`Dashboard available at http://localhost:${port}/dashboard`);
        log('Press Ctrl+C to stop.');
        // Keep the process alive so the HTTP server continues serving.
        // In production, ref a timer to prevent the event loop from exiting.
        // Skip in test mode (_deps injected) to avoid blocking test runner.
        if (!_deps) {
          const keepAlive = setInterval(() => {}, 1 << 30);
          const gracefulShutdown = () => {
            clearInterval(keepAlive);
            try { httpServer.close(); } catch { /* already closed */ }
            try { orch.db.close(); } catch { /* already closed */ }
            process.exit(0);
          };
          // M-09: Remove existing signal listeners before adding new ones to prevent accumulation
          process.removeAllListeners('SIGINT');
          process.removeAllListeners('SIGTERM');
          process.once('SIGINT', gracefulShutdown);
          process.once('SIGTERM', gracefulShutdown);
        }
      } catch (err) {
        /* v8 ignore start -- defensive: try only calls log() with string interpolation */
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
        /* v8 ignore stop */
      }
    });

  // 12. version
  program
    .command('version')
    .description('Show Qualixar OS version')
    .action(() => {
      log(`Qualixar OS v${VERSION}`);
    });

  // 13. pause <taskId> (H-20)
  program
    .command('pause <taskId>')
    .description('Pause a running task')
    .action(async (taskId: string) => {
      try {
        const orch = await getOrchestrator();
        await orch.pause(taskId);
        log(`Task ${taskId} paused.`);
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 14. resume <taskId> (H-20)
  program
    .command('resume <taskId>')
    .description('Resume a paused task')
    .action(async (taskId: string) => {
      try {
        const orch = await getOrchestrator();
        await orch.resume(taskId);
        log(`Task ${taskId} resumed.`);
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 15. cancel <taskId> (H-20)
  program
    .command('cancel <taskId>')
    .description('Cancel a task')
    .action(async (taskId: string) => {
      try {
        const orch = await getOrchestrator();
        await orch.cancel(taskId);
        log(`Task ${taskId} cancelled.`);
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 16. output — fetch and display task result
  program
    .command('output <taskId>')
    .description('Display the output of a completed task')
    .action(async (taskId: string) => {
      try {
        const orch = await getOrchestrator();
        const rows = orch.db.query<Record<string, unknown>>(
          'SELECT id, status, result FROM tasks WHERE id = ?',
          [taskId],
        );
        if (rows.length === 0) {
          log(formatError(new Error(`Task ${taskId} not found`), 'cli'));
          return;
        }
        const task = rows[0];
        if (task.status !== 'completed' && task.status !== 'failed') {
          log(`Task ${taskId} is ${task.status} — not yet complete.`);
          return;
        }
        if (!task.result) {
          log(`Task ${taskId} has no output.`);
          return;
        }
        // Parse result JSON to extract clean output
        try {
          const parsed = JSON.parse(task.result as string) as Record<string, unknown>;
          const output = (parsed.output as string) ?? JSON.stringify(parsed, null, 2);
          log(`\n--- Task ${taskId} Output ---\n`);
          log(output);
          if (Array.isArray(parsed.artifacts) && parsed.artifacts.length > 0) {
            log(`\n--- Artifacts (${parsed.artifacts.length}) ---`);
            for (const artifact of parsed.artifacts) {
              log(`  • ${JSON.stringify(artifact)}`);
            }
          }
        } catch {
          // result is plain text
          log(`\n--- Task ${taskId} Output ---\n`);
          log(task.result as string);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
      }
    });

  // 17. models (H-20)
  program
    .command('models')
    .description('List available models')
    .action(async () => {
      try {
        const orch = await getOrchestrator();
        const { MODEL_CATALOG } = await import('../router/model-call.js');
        for (const m of MODEL_CATALOG) {
          log(`  ${m.name} (${m.provider}) q=${m.qualityScore.toFixed(2)} max=${m.maxTokens}`);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
      }
    });

  // 17. dispatch — universal command router (H-20: covers remaining 14 commands)
  // Uses createCommandContext factory (Phase A1 UCP unification)
  program
    .command('dispatch <command> [input]')
    .description('Dispatch any of the 25 universal commands (e.g. dispatch context.add \'{"path":"./src"}\' )')
    .action(async (command: string, input?: string) => {
      try {
        const orch = await getOrchestrator();
        const { createCommandContext } = await import('../commands/context-factory.js');
        const { createWiredCommandRouter } = await import('../commands/index.js');
        const cmdRouter = createWiredCommandRouter(createCommandContext(orch));
        const rawInput = input ? JSON.parse(input) : {};
        const result = await cmdRouter.dispatch(command, rawInput);
        log(JSON.stringify(result, null, 2));
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
      }
    });

  // 17b. cmd — UCP unified command (Phase A1)
  // Adds `qos cmd <command>` and `qos cmd-list` for universal command access
  program
    .command('cmd <command>')
    .description('Execute any Universal Command Protocol command')
    .option('--json', 'Output raw JSON')
    .option('-i, --input <json>', 'JSON input for the command')
    .action(async (command: string, opts: Record<string, unknown>) => {
      try {
        const orch = await getOrchestrator();
        const { createCommandContext } = await import('../commands/context-factory.js');
        const { createWiredCommandRouter } = await import('../commands/index.js');
        const cmdRouter = createWiredCommandRouter(createCommandContext(orch));
        const rawInput = typeof opts.input === 'string' ? JSON.parse(opts.input) as unknown : {};
        const result = await cmdRouter.dispatch(command, rawInput);
        if (opts.json) {
          log(JSON.stringify(result, null, 2));
        } else if (result.success) {
          log(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
        } else {
          log(`Error [${result.error?.code ?? 'UNKNOWN'}]: ${result.error?.message ?? 'Unknown error'}`);
          exitProcess(1);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  program
    .command('cmd-list')
    .description('List all available Universal Command Protocol commands')
    .action(async () => {
      try {
        const orch = await getOrchestrator();
        const { createCommandContext } = await import('../commands/context-factory.js');
        const { createWiredCommandRouter } = await import('../commands/index.js');
        const cmdRouter = createWiredCommandRouter(createCommandContext(orch));
        for (const def of cmdRouter.list()) {
          log(`  ${def.name.padEnd(24)} [${def.category}] ${def.description}`);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
      }
    });

  // 19. init (C-14) — Phase 19: Interactive setup wizard (replaces legacy init)
  program
    .command('init')
    .description('Initialize Qualixar OS with interactive setup wizard')
    .option('--no-interactive', 'Skip interactive prompts (use defaults + flags)')
    .option('--default', 'Alias for --no-interactive')
    .option('--provider <name>', 'Primary LLM provider')
    .option('--api-key-env <var>', 'Environment variable name for API key')
    .option('--model <name>', 'Primary model name')
    .option('--channels <list>', 'Comma-separated channel list')
    .option('--budget <usd>', 'Budget limit in USD', parseIntOption)
    .option('--skip-first-task', 'Skip post-install first task')
    .option('--dashboard-port <port>', 'Dashboard port', parseIntOption)
    .action(async (opts: Record<string, unknown>) => {
      try {
        await handleInitCommand(
          {
            provider: opts.provider as string | undefined,
            apiKeyEnv: opts.apiKeyEnv as string | undefined,
            model: opts.model as string | undefined,
            channels: opts.channels ? (opts.channels as string).split(',') : undefined,
            budget: opts.budget as number | undefined,
            noInteractive: Boolean(opts.noInteractive || opts.default),
            skipFirstTask: Boolean(opts.skipFirstTask),
            dashboardPort: opts.dashboardPort as number | undefined,
          },
          { log },
        );
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 20. doctor — Phase 19: Health check
  program
    .command('doctor')
    .description('Run Qualixar OS health check')
    .action(async () => {
      try {
        await handleDoctorCommand({ log });
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 21. new <project> — Phase 19: Template scaffolding
  program
    .command('new <project>')
    .description('Create a new Qualixar OS project from template')
    .action(async (projectName: string) => {
      try {
        await handleNewCommand(projectName, { log });
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 18. mcp (L-13)
  program
    .command('mcp')
    .description('Start MCP server (stdio transport)')
    .action(async () => {
      try {
        const orch = await getOrchestrator();
        const { createMcpServer } = await import('./mcp-server.js');
        const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
        const server = createMcpServer(orch);
        const transport = new StdioServerTransport();
        await server.connect(transport);
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
        exitProcess(1);
      }
    });

  // 20. export (M-20) — Export agents to external formats
  program
    .command('export <agentId>')
    .description('Export an agent to external format')
    .option('-f, --format <format>', 'Target format: soul-md|json|yaml', 'json')
    .option('-o, --output <path>', 'Output file path')
    .action(async (agentId: string, opts: Record<string, unknown>) => {
      try {
        const orch = await getOrchestrator();
        const rows = orch.db.query<{ id: string; agent_spec: string }>(
          'SELECT id, agent_spec FROM imported_agents WHERE id = ?',
          [agentId],
        );
        if (rows.length === 0) {
          // Try agents table
          const agentRows = orch.db.query<Record<string, unknown>>(
            'SELECT * FROM agents WHERE id = ?',
            [agentId],
          );
          if (agentRows.length === 0) {
            log(`Agent "${agentId}" not found.`);
            return;
          }
          const format = (opts.format as string) ?? 'json';
          const output = format === 'yaml'
            ? yaml.stringify(agentRows[0])
            : JSON.stringify(agentRows[0], null, 2);

          if (opts.output) {
            fs.writeFileSync(opts.output as string, output, 'utf-8');
            log(`Exported agent to ${opts.output}`);
          } else {
            log(output);
          }
          return;
        }

        const spec = JSON.parse(rows[0].agent_spec);
        const format = (opts.format as string) ?? 'json';
        let output: string;
        if (format === 'yaml') {
          output = yaml.stringify(spec);
        } else if (format === 'soul-md') {
          // Convert to SOUL.md format
          const lines = [
            `# ${spec.name ?? agentId}`,
            '',
            `## Role`,
            spec.roles?.map((r: { role: string }) => `- ${r.role}`).join('\n') ?? 'agent',
            '',
            `## Tools`,
            spec.tools?.map((t: { name: string }) => `- ${t.name}`).join('\n') ?? 'none',
          ];
          output = lines.join('\n');
        } else {
          output = JSON.stringify(spec, null, 2);
        }

        if (opts.output) {
          fs.writeFileSync(opts.output as string, output, 'utf-8');
          log(`Exported agent to ${opts.output}`);
        } else {
          log(output);
        }
      } catch (err) {
        log(formatError(err instanceof Error ? err : new Error(String(err)), 'cli'));
      }
    });

  return program;
}

export const program = createProgram();

// Parsing is handled by bin/qos.js (calls parseAsync on the exported program).
// Tests call program.parseAsync() directly via createProgram() with injected deps.
