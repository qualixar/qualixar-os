// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2

import type { Hono } from 'hono';
import type { Orchestrator } from '../engine/orchestrator.js';

export function registerCostRoutes(app: Hono, orchestrator: Orchestrator): void {
  // ---- Cost ----

  app.get('/api/cost', (c) => {
    try {
      const summary = orchestrator.costTracker.getSummary();
      // Add budget context from config for convenience
      const config = orchestrator.modeEngine.getConfig();
      const budgetConfig = config.budget as { max_usd?: number; warn_pct?: number } | undefined;
      const budgetMax = budgetConfig?.max_usd ?? 100;
      const computedRemaining = budgetMax - summary.total_usd;
      // Replace sentinel -1 with computed remaining so clients never see raw -$1
      const costWithBudget = {
        ...summary,
        budget_remaining_usd: summary.budget_remaining_usd < 0 ? computedRemaining : summary.budget_remaining_usd,
      };
      const budget = {
        max: budgetMax,
        used: summary.total_usd,
        remaining: computedRemaining,
        warnPct: budgetConfig?.warn_pct ?? 0.8,
      };
      return c.json({ cost: costWithBudget, budget });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  app.get('/api/cost/history', (c) => {
    try {
      const entries = orchestrator.db.query<Record<string, unknown>>(
        'SELECT * FROM cost_entries ORDER BY created_at DESC LIMIT 100',
        [],
      );
      return c.json({ entries });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });
}
