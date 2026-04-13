// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Output Formatters
 *
 * Per-channel output formatting for TaskResult, TaskStatus, CostSummary, and errors.
 * Used by CLI, MCP, HTTP, Telegram, Discord, and Webhook channels.
 */

import type { TaskResult, CostSummary } from '../types/common.js';
import type { TaskStatus } from '../engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelFormat = 'cli' | 'json' | 'markdown' | 'html' | 'telegram' | 'discord';

// ---------------------------------------------------------------------------
// Result Formatter
// ---------------------------------------------------------------------------

export function formatResult(result: TaskResult, format: ChannelFormat): string {
  switch (format) {
    case 'cli':
      return formatResultCli(result);
    case 'json':
      return JSON.stringify(result, null, 2);
    case 'markdown':
    case 'telegram':
    case 'discord':
      return formatResultMarkdown(result);
    case 'html':
      return formatResultHtml(result);
    default:
      return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Status Formatter
// ---------------------------------------------------------------------------

export function formatStatus(status: TaskStatus, format: ChannelFormat): string {
  switch (format) {
    case 'cli':
      return `Task ${status.taskId} | Phase: ${status.phase} | Progress: ${status.progress}% | Cost: $${status.costSoFar.toFixed(4)}`;
    case 'json':
      return JSON.stringify(status, null, 2);
    case 'markdown':
    case 'telegram':
    case 'discord':
      return `**Task ${status.taskId}**\nPhase: ${status.phase}\nProgress: ${status.progress}%\nCost: $${status.costSoFar.toFixed(4)}`;
    case 'html':
      return `<div class="task-status"><strong>Task ${status.taskId}</strong><br/>Phase: ${status.phase}<br/>Progress: ${status.progress}%<br/>Cost: $${status.costSoFar.toFixed(4)}</div>`;
    default:
      return JSON.stringify(status, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Cost Formatter
// ---------------------------------------------------------------------------

export function formatCost(cost: CostSummary, format: ChannelFormat): string {
  switch (format) {
    case 'cli':
      return formatCostCli(cost);
    case 'json':
      return JSON.stringify(cost, null, 2);
    case 'markdown':
    case 'telegram':
    case 'discord':
      return formatCostMarkdown(cost);
    case 'html':
      return formatCostHtml(cost);
    default:
      return JSON.stringify(cost, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Error Formatter
// ---------------------------------------------------------------------------

export function formatError(error: Error, format: ChannelFormat): string {
  switch (format) {
    case 'cli':
      return `\x1b[31mError: ${error.message}\x1b[0m`;
    case 'json':
      return JSON.stringify({ error: error.message });
    case 'markdown':
    case 'telegram':
    case 'discord':
      return `**Error:** ${error.message}`;
    case 'html':
      return `<div class="error"><strong>Error:</strong> ${escapeHtml(error.message)}</div>`;
    default:
      return JSON.stringify({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Private Helpers
// ---------------------------------------------------------------------------

function formatResultCli(result: TaskResult): string {
  const lines: string[] = [];
  lines.push(`\x1b[1mTask ${result.taskId} -- ${result.status}\x1b[0m`);
  lines.push('');

  const outputText = result.output.length > 5000
    ? result.output.slice(0, 5000) + '... (truncated)'
    : result.output;
  lines.push(outputText);
  lines.push('');

  lines.push(`Cost: $${result.cost.total_usd.toFixed(4)}`);

  const approved = result.judges.filter((j) => j.verdict === 'approve').length;
  const rejected = result.judges.filter((j) => j.verdict === 'reject').length;
  lines.push(`Judges: ${approved} approved, ${rejected} rejected`);
  lines.push(`Duration: ${result.duration_ms}ms`);

  if (result.artifacts.length > 0) {
    lines.push('');
    lines.push('Artifacts:');
    for (const artifact of result.artifacts) {
      lines.push(`  - [${artifact.type}] ${artifact.path}`);
    }
  }

  return lines.join('\n');
}

function formatResultMarkdown(result: TaskResult): string {
  const lines: string[] = [];
  lines.push(`## Task ${result.taskId}`);
  lines.push(`**Status:** ${result.status}`);
  lines.push('');
  lines.push('```');
  lines.push(result.output);
  lines.push('```');
  lines.push('');
  lines.push(`**Cost:** $${result.cost.total_usd.toFixed(4)}`);

  if (result.judges.length > 0) {
    lines.push('');
    lines.push('**Judge Verdicts:**');
    for (const judge of result.judges) {
      lines.push(`- ${judge.judgeModel}: ${judge.verdict} (score: ${judge.score.toFixed(2)})`);
    }
  }

  return lines.join('\n');
}

function formatResultHtml(result: TaskResult): string {
  const lines: string[] = [];
  lines.push('<div class="task-result">');
  lines.push(`  <h2>Task ${escapeHtml(result.taskId)}</h2>`);
  lines.push(`  <p><strong>Status:</strong> ${result.status}</p>`);
  lines.push(`  <pre><code>${escapeHtml(result.output)}</code></pre>`);
  lines.push('  <table>');
  lines.push('    <tr><th>Metric</th><th>Value</th></tr>');
  lines.push(`    <tr><td>Total Cost</td><td>$${result.cost.total_usd.toFixed(4)}</td></tr>`);
  lines.push(`    <tr><td>Duration</td><td>${result.duration_ms}ms</td></tr>`);
  lines.push('  </table>');
  lines.push('</div>');
  return lines.join('\n');
}

function formatBudgetRemaining(value: number): string {
  return value < 0 ? 'unlimited' : `$${value.toFixed(4)}`;
}

function formatCostCli(cost: CostSummary): string {
  const lines: string[] = [];
  lines.push(`Total: $${cost.total_usd.toFixed(4)}`);
  lines.push(`Remaining: ${formatBudgetRemaining(cost.budget_remaining_usd)}`);

  const models = Object.entries(cost.by_model);
  if (models.length > 0) {
    lines.push('');
    lines.push('By Model:');
    for (const [model, amount] of models) {
      lines.push(`  ${model}: $${amount.toFixed(4)}`);
    }
  }

  return lines.join('\n');
}

function formatCostMarkdown(cost: CostSummary): string {
  const lines: string[] = [];
  lines.push(`**Total:** $${cost.total_usd.toFixed(4)}`);
  lines.push(`**Remaining:** ${formatBudgetRemaining(cost.budget_remaining_usd)}`);

  const models = Object.entries(cost.by_model);
  if (models.length > 0) {
    lines.push('');
    lines.push('| Model | Cost |');
    lines.push('|-------|------|');
    for (const [model, amount] of models) {
      lines.push(`| ${model} | $${amount.toFixed(4)} |`);
    }
  }

  return lines.join('\n');
}

function formatCostHtml(cost: CostSummary): string {
  const lines: string[] = [];
  lines.push('<div class="cost-summary">');
  lines.push(`  <p><strong>Total:</strong> $${cost.total_usd.toFixed(4)}</p>`);
  lines.push(`  <p><strong>Remaining:</strong> ${formatBudgetRemaining(cost.budget_remaining_usd)}</p>`);
  lines.push('</div>');
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
