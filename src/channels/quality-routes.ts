// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import type { Orchestrator } from '../engine/orchestrator.js';

export function registerQualityRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Judges ----

  app.get('/api/judges/results', (c) => {
    const taskId = c.req.query('taskId');
    const results = orchestrator.judgePipeline.getResults(taskId);
    return c.json({ results: results ?? [] });
  });

  app.get('/api/judges/profiles', (c) => {
    const profiles = orchestrator.judgePipeline.getProfiles();
    return c.json({ profiles: profiles ?? [] });
  });

  // ---- Forge ----

  app.get('/api/forge/designs', (c) => {
    const taskType = c.req.query('taskType');
    // Try in-memory first; fall back to DB
    const inMemory = orchestrator.forge.getDesigns(taskType);
    if (inMemory.length > 0) {
      return c.json({ designs: inMemory });
    }
    const query = taskType
      ? 'SELECT * FROM team_designs WHERE task_type = ? ORDER BY created_at DESC LIMIT 50'
      : 'SELECT * FROM team_designs ORDER BY created_at DESC LIMIT 50';
    const params = taskType ? [taskType] : [];
    const dbDesigns = orchestrator.db.query<Record<string, unknown>>(query, params);
    // Parse agents JSON column
    const parsed = dbDesigns.map((d) => ({
      ...d,
      agents: typeof d.agents === 'string' ? JSON.parse(d.agents as string) : d.agents,
    }));
    return c.json({ designs: parsed });
  });

  app.get('/api/forge/designs/:taskType', (c) => {
    const taskType = c.req.param('taskType');
    const inMemory = orchestrator.forge.getDesigns(taskType);
    if (inMemory.length > 0) {
      return c.json({ designs: inMemory });
    }
    const dbDesigns = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM team_designs WHERE task_type = ? ORDER BY created_at DESC LIMIT 50',
      [taskType],
    );
    const parsed = dbDesigns.map((d) => ({
      ...d,
      agents: typeof d.agents === 'string' ? JSON.parse(d.agents as string) : d.agents,
    }));
    return c.json({ designs: parsed });
  });

  // ---- Swarm ----

  app.get('/api/swarm/topologies', (c) => {
    const gates = orchestrator.modeEngine.getFeatureGates();
    return c.json({ topologies: gates.topologies });
  });

  // ---- Strategy Scorer ----

  app.get('/api/rl/stats', (c) => {
    const stats = orchestrator.strategyScorer.getStats();
    return c.json({ stats });
  });

  app.get('/api/rl/strategies', (c) => {
    const strategies = orchestrator.strategyScorer.getStrategies();
    return c.json({ strategies: strategies ?? [] });
  });

  // ---- Compatibility ----

  app.get('/api/compatibility/imported', (c) => {
    const rows = orchestrator.db.query<Record<string, unknown>>(
      'SELECT * FROM imported_agents ORDER BY created_at DESC LIMIT 200',
      [],
    );
    return c.json({ agents: rows });
  });

  // ---- MCP Tools Registry ----

  // L-10: LLD DEVIATION (intentional): This endpoint returns a static tool
  // catalog rather than querying live MCP sessions. The static list matches
  // the registered MCP tools and avoids a dependency on active MCP connections.
  app.get('/api/mcp/tools', (c) => {
    const tools = [
      { name: 'run_task', description: 'Submit a task to Qualixar OS', category: 'execution' },
      { name: 'get_status', description: 'Get task status', category: 'monitoring' },
      { name: 'list_tasks', description: 'List all tasks', category: 'monitoring' },
      { name: 'pause_task', description: 'Pause a running task', category: 'control' },
      { name: 'resume_task', description: 'Resume a paused task', category: 'control' },
      { name: 'cancel_task', description: 'Cancel a task', category: 'control' },
      { name: 'redirect_task', description: 'Change task prompt mid-execution', category: 'control' },
      { name: 'list_agents', description: 'List active agents', category: 'monitoring' },
      { name: 'get_cost', description: 'Get cost summary', category: 'monitoring' },
      { name: 'get_judge_results', description: 'Get judge verdicts', category: 'quality' },
      { name: 'get_forge_designs', description: 'Get Forge team designs', category: 'agents' },
      { name: 'search_memory', description: 'Search memory — powered by SuperLocalMemory (Lite)', category: 'memory' },
      { name: 'list_topologies', description: 'List available topologies', category: 'agents' },
      { name: 'get_rl_stats', description: 'Get strategy scoring stats', category: 'learning' },
      { name: 'get_system_config', description: 'Get system configuration', category: 'system' },
    ];
    return c.json({ tools });
  });

  // ---- A2A ----

  app.get('/api/a2a/agents', (c) => {
    const agents = orchestrator.agentRegistry.listAgents();
    return c.json({ agents });
  });
}
