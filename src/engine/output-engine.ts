// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Output Engine
 * LLD Section 2.3
 *
 * Formats TaskResult for different output channels.
 * Phase 7 channels will handle delivery; this handles formatting only.
 */

import type { ConfigManager } from '../config/config-manager.js';
import type { TaskResult, Artifact } from '../types/common.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutputChannel =
  | 'cli'
  | 'json'
  | 'markdown'
  | 'html'
  | 'telegram'
  | 'discord';

export interface FormattedOutput {
  readonly text: string;
  readonly artifacts: readonly Artifact[];
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OutputEngine {
  format(result: TaskResult, channel: OutputChannel): FormattedOutput;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class OutputEngineImpl implements OutputEngine {
  private readonly configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  format(result: TaskResult, channel: OutputChannel): FormattedOutput {
    let text: string;

    switch (channel) {
      case 'cli':
        text = this.formatCli(result);
        break;
      case 'json':
        text = this.formatJson(result);
        break;
      case 'markdown':
      case 'telegram':
      case 'discord':
        text = this.formatMarkdown(result);
        break;
      case 'html':
        text = this.formatHtml(result);
        break;
      default:
        text = this.formatJson(result);
    }

    return {
      text,
      artifacts: result.artifacts,
      metadata: {
        channel,
        formattedAt: new Date().toISOString(),
        taskId: result.taskId,
        status: result.status,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private formatters
  // -------------------------------------------------------------------------

  private formatCli(result: TaskResult): string {
    const lines: string[] = [];
    lines.push(`Task ${result.taskId} -- ${result.status}`);
    lines.push('');

    // Output text (truncate to 5000 chars)
    const outputText =
      result.output.length > 5000
        ? result.output.slice(0, 5000) + '... (truncated)'
        : result.output;
    lines.push(outputText);
    lines.push('');

    // Cost summary
    lines.push(`Cost: $${result.cost.total_usd.toFixed(4)}`);

    // Judge summary
    const approved = result.judges.filter(
      (j) => j.verdict === 'approve',
    ).length;
    const rejected = result.judges.filter(
      (j) => j.verdict === 'reject',
    ).length;
    lines.push(`Judges: ${approved} approved, ${rejected} rejected`);

    // Duration
    lines.push(`Duration: ${result.duration_ms}ms`);

    // Artifacts
    if (result.artifacts.length > 0) {
      lines.push('');
      lines.push('Artifacts:');
      for (const artifact of result.artifacts) {
        lines.push(`  - [${artifact.type}] ${artifact.path}`);
      }
    }

    return lines.join('\n');
  }

  private formatJson(result: TaskResult): string {
    return JSON.stringify(result, null, 2);
  }

  private formatMarkdown(result: TaskResult): string {
    const lines: string[] = [];
    lines.push(`## Task ${result.taskId}`);
    lines.push(`**Status:** ${result.status}`);
    lines.push('');

    // Output
    if (result.output.includes('```') || result.output.includes('\n')) {
      lines.push('```');
      lines.push(result.output);
      lines.push('```');
    } else {
      lines.push(result.output);
    }
    lines.push('');

    // Cost
    lines.push(`**Cost:** $${result.cost.total_usd.toFixed(4)}`);
    lines.push('');

    // Judge verdicts
    if (result.judges.length > 0) {
      lines.push('**Judge Verdicts:**');
      for (const judge of result.judges) {
        lines.push(
          `- ${judge.judgeModel}: ${judge.verdict} (score: ${judge.score.toFixed(2)})`,
        );
      }
      lines.push('');
    }

    // Artifacts
    if (result.artifacts.length > 0) {
      lines.push('**Artifacts:**');
      for (const artifact of result.artifacts) {
        lines.push(`- [${artifact.type}] ${artifact.path}`);
      }
    }

    return lines.join('\n');
  }

  private formatHtml(result: TaskResult): string {
    const lines: string[] = [];
    lines.push('<div class="task-result">');
    lines.push(`  <h2>Task ${result.taskId}</h2>`);
    lines.push(`  <p><strong>Status:</strong> ${result.status}</p>`);

    // Output
    lines.push('  <pre><code>');
    lines.push(this.escapeHtml(result.output));
    lines.push('  </code></pre>');

    // Cost table
    lines.push('  <table>');
    lines.push('    <tr><th>Metric</th><th>Value</th></tr>');
    lines.push(
      `    <tr><td>Total Cost</td><td>$${result.cost.total_usd.toFixed(4)}</td></tr>`,
    );
    lines.push(
      `    <tr><td>Duration</td><td>${result.duration_ms}ms</td></tr>`,
    );
    lines.push('  </table>');

    // Judge verdicts
    if (result.judges.length > 0) {
      lines.push('  <ul>');
      for (const judge of result.judges) {
        lines.push(
          `    <li>${this.escapeHtml(judge.judgeModel)}: ${judge.verdict} (${judge.score.toFixed(2)})</li>`,
        );
      }
      lines.push('  </ul>');
    }

    // Artifacts
    if (result.artifacts.length > 0) {
      lines.push('  <ul>');
      for (const artifact of result.artifacts) {
        lines.push(
          `    <li>[${artifact.type}] ${this.escapeHtml(artifact.path)}</li>`,
        );
      }
      lines.push('  </ul>');
    }

    lines.push('</div>');
    return lines.join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOutputEngine(configManager: ConfigManager): OutputEngine {
  return new OutputEngineImpl(configManager);
}
