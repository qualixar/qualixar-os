// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Health Checker (qos doctor)
 * LLD Section 8.3: System, config, provider, channel, and database checks.
 *
 * Score formula: ok=1pt, warn=0.5pt, fail=0pt, skip=excluded.
 * Score = (points / activeItems) * 10
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { HealthCheckItem, HealthCheckResult, HealthChecker } from '../../types/phase19.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.qualixar-os');
const CONFIG_YAML = join(CONFIG_DIR, 'config.yaml');
const QOS_DB = join(CONFIG_DIR, 'qos.db');
const MIN_NODE_MAJOR = 22;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHealthChecker(): HealthChecker {
  return new HealthCheckerImpl();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class HealthCheckerImpl implements HealthChecker {
  async check(): Promise<HealthCheckResult> {
    const items: HealthCheckItem[] = [
      ...this.systemChecks(),
      ...this.configChecks(),
      ...this.providerChecks(),
      ...this.channelChecks(),
    ];

    const activeItems = items.filter((i) => i.status !== 'skip');
    const points = activeItems.reduce((sum, i) => {
      if (i.status === 'ok') return sum + 1;
      if (i.status === 'warn') return sum + 0.5;
      return sum; // fail = 0
    }, 0);

    const score =
      activeItems.length > 0
        ? Math.round((points / activeItems.length) * 10 * 10) / 10
        : 10;

    const failCount = activeItems.filter((i) => i.status === 'fail').length;
    const warnCount = activeItems.filter((i) => i.status === 'warn').length;

    let summary: string;
    if (failCount === 0 && warnCount === 0) {
      summary = 'All checks passed.';
    } else if (failCount === 0) {
      summary = `${warnCount} warning(s) found. Review and resolve for optimal operation.`;
    } else {
      summary = `${failCount} failure(s) and ${warnCount} warning(s) found. Run suggested fixes.`;
    }

    return {
      items,
      score,
      totalChecks: items.length,
      summary,
      checkedAt: new Date().toISOString(),
    };
  }

  async checkOne(name: string): Promise<HealthCheckItem> {
    const result = await this.check();
    const found = result.items.find((i) => i.name === name);
    if (!found) {
      return {
        name,
        category: 'system',
        status: 'skip',
        message: `Check '${name}' not found.`,
        fix: null,
      };
    }
    return found;
  }

  // -------------------------------------------------------------------------
  // System checks
  // -------------------------------------------------------------------------

  private systemChecks(): readonly HealthCheckItem[] {
    return [
      this.checkNodeVersion(),
      this.checkSqlite(),
    ];
  }

  private checkNodeVersion(): HealthCheckItem {
    const raw = process.versions.node;
    const major = parseInt(raw.split('.')[0] ?? '0', 10);

    if (major >= MIN_NODE_MAJOR) {
      return {
        name: 'node-version',
        category: 'system',
        status: 'ok',
        message: `Node.js ${raw} (>= ${MIN_NODE_MAJOR} required)`,
        fix: null,
      };
    }
    return {
      name: 'node-version',
      category: 'system',
      status: 'fail',
      message: `Node.js ${raw} is below minimum ${MIN_NODE_MAJOR}.x`,
      fix: `Install Node.js >= ${MIN_NODE_MAJOR} via https://nodejs.org or nvm: nvm install ${MIN_NODE_MAJOR}`,
    };
  }

  private checkSqlite(): HealthCheckItem {
    try {
      const db = new Database(':memory:');
      db.prepare('SELECT 1').get();
      db.close();
      return {
        name: 'sqlite',
        category: 'system',
        status: 'ok',
        message: 'better-sqlite3 is functional.',
        fix: null,
      };
    } catch {
      return {
        name: 'sqlite',
        category: 'system',
        status: 'fail',
        message: 'better-sqlite3 is not installed or failed to load.',
        fix: 'Run: npm install better-sqlite3',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Config checks
  // -------------------------------------------------------------------------

  private configChecks(): readonly HealthCheckItem[] {
    return [
      this.checkConfigYaml(),
      this.checkQclawDb(),
    ];
  }

  private checkConfigYaml(): HealthCheckItem {
    if (existsSync(CONFIG_YAML)) {
      return {
        name: 'config-yaml',
        category: 'config',
        status: 'ok',
        message: `${CONFIG_YAML} found.`,
        fix: null,
      };
    }
    return {
      name: 'config-yaml',
      category: 'config',
      status: 'fail',
      message: `${CONFIG_YAML} not found.`,
      fix: 'Run: qos init  to create the configuration file.',
    };
  }

  private checkQclawDb(): HealthCheckItem {
    if (existsSync(QOS_DB)) {
      return {
        name: 'qos-db',
        category: 'config',
        status: 'ok',
        message: `${QOS_DB} found.`,
        fix: null,
      };
    }
    return {
      name: 'qos-db',
      category: 'config',
      status: 'warn',
      message: `${QOS_DB} not found. Will be created on first run.`,
      fix: 'Run: qos init  to initialise the database.',
    };
  }

  // -------------------------------------------------------------------------
  // Provider checks
  // -------------------------------------------------------------------------

  private providerChecks(): readonly HealthCheckItem[] {
    return [
      this.checkPrimaryProvider(),
      this.checkFallbackProvider(),
    ];
  }

  private checkPrimaryProvider(): HealthCheckItem {
    const commonEnvVars: readonly string[] = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
    ];

    const found = commonEnvVars.find((v) => process.env[v]);
    if (found) {
      return {
        name: 'provider-primary',
        category: 'provider',
        status: 'ok',
        message: `Primary provider API key set (${found}).`,
        fix: null,
      };
    }

    const ollama = process.env['OLLAMA_HOST'] ?? process.env['OLLAMA_BASE_URL'];
    if (ollama) {
      return {
        name: 'provider-primary',
        category: 'provider',
        status: 'ok',
        message: 'Ollama endpoint configured — no API key required.',
        fix: null,
      };
    }

    return {
      name: 'provider-primary',
      category: 'provider',
      status: 'fail',
      message: 'No provider API key detected in environment.',
      fix:
        'Set an API key env var (e.g. ANTHROPIC_API_KEY) in ~/.qualixar-os/.env or your shell profile.',
    };
  }

  private checkFallbackProvider(): HealthCheckItem {
    const fallbackVars: readonly string[] = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GROQ_API_KEY',
    ];

    const count = fallbackVars.filter((v) => process.env[v]).length;

    if (count >= 2) {
      return {
        name: 'provider-fallback',
        category: 'provider',
        status: 'ok',
        message: `${count} provider API keys set — fallback available.`,
        fix: null,
      };
    }

    return {
      name: 'provider-fallback',
      category: 'provider',
      status: 'warn',
      message: 'Only one provider configured. Consider adding a fallback for resilience.',
      fix:
        'Add a second provider API key (e.g. GROQ_API_KEY for a fast/cheap fallback) to ~/.qualixar-os/.env.',
    };
  }

  // -------------------------------------------------------------------------
  // Channel checks
  // -------------------------------------------------------------------------

  private channelChecks(): readonly HealthCheckItem[] {
    return [
      this.checkDashboardPort(),
    ];
  }

  private checkDashboardPort(): HealthCheckItem {
    const portEnv = process.env['QOS_DASHBOARD_PORT'];
    const port = portEnv ? parseInt(portEnv, 10) : 4000;

    if (Number.isNaN(port) || port < 1 || port > 65535) {
      return {
        name: 'dashboard-port',
        category: 'channel',
        status: 'fail',
        message: `QOS_DASHBOARD_PORT="${portEnv ?? ''}" is not a valid port number.`,
        fix: 'Set QOS_DASHBOARD_PORT to a number between 1 and 65535 in ~/.qualixar-os/.env.',
      };
    }

    if (port < 1024) {
      return {
        name: 'dashboard-port',
        category: 'channel',
        status: 'warn',
        message: `Dashboard port ${port} is a privileged port (< 1024). May require elevated permissions.`,
        fix: `Change QOS_DASHBOARD_PORT to a value >= 1024 (default: 4000).`,
      };
    }

    return {
      name: 'dashboard-port',
      category: 'channel',
      status: 'ok',
      message: `Dashboard port ${port} is valid.`,
      fix: null,
    };
  }
}
