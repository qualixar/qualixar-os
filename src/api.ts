// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Programmatic API Surface
 *
 * Clean, minimal API for library consumers who want to use
 * Qualixar OS without running the CLI or HTTP server.
 *
 * Usage:
 *   import { createQosInstance } from 'qualixar-os';
 *   const qos = await createQosInstance({ dbPath: ':memory:' });
 *   const result = await qos.runTask('Write a hello world in Python');
 *   await qos.shutdown();
 *
 * WHY a separate file from bootstrap.ts:
 *   bootstrap.ts returns an Orchestrator (internal interface with 18+
 *   dependencies). This file wraps it in a developer-friendly facade
 *   that handles config defaults, in-memory mode, and clean shutdown.
 *
 * Pattern: Facade -- hides DI complexity behind a minimal public API.
 */

import { QosConfigSchema, type QosConfig, type TaskResult } from './types/common.js';
import { createQos as createQosInternal } from './bootstrap.js';
import type { Orchestrator, TaskStatus } from './engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/**
 * Simplified configuration for library consumers.
 * All fields optional -- sensible defaults applied.
 */
export interface QosLibConfig {
  /** Path to config.yaml. When set, file-based config takes precedence. */
  readonly configPath?: string;
  /** Path to SQLite DB. Defaults to ':memory:' for in-process usage. */
  readonly dbPath?: string;
  /** Operating mode. Defaults to 'companion'. */
  readonly mode?: 'companion' | 'power';
  /** Log level. Defaults to 'warn' to keep library usage quiet. */
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Describes a model available in the runtime catalog.
 * Subset of the internal ModelInfo -- only what library consumers need.
 */
export interface ModelSummary {
  readonly name: string;
  readonly provider: string;
  readonly qualityScore: number;
}

/**
 * The public handle returned by createQosInstance().
 * Minimal surface -- expand only as needed.
 */
export interface QosInstance {
  /** Run a task and return the full result. */
  runTask(
    prompt: string,
    options?: {
      /** Execution topology (e.g. 'single', 'pipeline', 'debate'). */
      readonly topology?: string;
      /** Budget cap in USD for this task. */
      readonly budget?: number;
      /** Task type hint for forge team design. */
      readonly type?: 'code' | 'research' | 'analysis' | 'creative' | 'custom';
    },
  ): Promise<TaskResult>;

  /** Get the status of a running or completed task. */
  getStatus(taskId: string): TaskStatus;

  /** List models currently available in the catalog. */
  listModels(): readonly ModelSummary[];

  /** Cleanly shut down the instance (closes DB, stops watchers). */
  shutdown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use Qualixar OS instance for programmatic usage.
 *
 * Handles config defaults and DI bootstrap internally so callers
 * don't need to construct a full QosConfig.
 *
 * @param config - Optional simplified config. Defaults give you an
 *                 in-memory, companion-mode instance that works
 *                 without any external files.
 * @returns A QosInstance facade wrapping the full orchestrator.
 */
export async function createQosInstance(config?: QosLibConfig): Promise<QosInstance> {
  // Step 1: Build a full QosConfig from the simplified input.
  // QosConfigSchema.parse() fills all nested defaults via Zod v4.
  const fullConfig: QosConfig = QosConfigSchema.parse({
    mode: config?.mode ?? 'companion',
    db: { path: config?.dbPath ?? ':memory:' },
    observability: { log_level: config?.logLevel ?? 'warn' },
  });

  // Step 2: Bootstrap all 32 components via the internal factory.
  const orchestrator: Orchestrator = createQosInternal(fullConfig);

  // Step 3: Build the public facade.
  let closed = false;

  const instance: QosInstance = {
    async runTask(prompt, options) {
      if (closed) {
        throw new Error('QosInstance has been shut down');
      }
      return orchestrator.run({
        prompt,
        topology: options?.topology,
        budget_usd: options?.budget,
        type: options?.type,
      });
    },

    getStatus(taskId) {
      if (closed) {
        throw new Error('QosInstance has been shut down');
      }
      return orchestrator.getStatus(taskId);
    },

    listModels() {
      if (closed) {
        throw new Error('QosInstance has been shut down');
      }
      return orchestrator.modelRouter.getAvailableModels();
    },

    async shutdown() {
      if (closed) {
        return; // Idempotent
      }
      closed = true;
      try {
        orchestrator.db.close();
      } catch {
        // DB may already be closed -- non-fatal
      }
    },
  };

  return instance;
}
