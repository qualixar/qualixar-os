// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- Command Registry
 *
 * Wires all 25 commands from 9 category files into a single CommandRouter.
 * Every transport (CLI, MCP, HTTP, WS) calls createWiredCommandRouter()
 * to get a fully-loaded router.
 *
 * Source: Phase 10 LLD Section 2.12
 */

import type { CommandContext } from './types.js';
import type { CommandDefinition } from './types.js';
import { CommandRouter } from './router.js';
import { taskCommands } from './task.js';
import { contextCommands } from './context.js';
import { workspaceCommands } from './workspace.js';
import { agentCommands } from './agents.js';
import { forgeCommands } from './forge.js';
import { qualityCommands } from './quality.js';
import { memoryCommands } from './memory.js';
import { systemCommands } from './system.js';
import { interopCommands } from './interop.js';

// ---------------------------------------------------------------------------
// Expected total -- hard assertion to catch drift
// ---------------------------------------------------------------------------

const EXPECTED_COMMAND_COUNT = 25;

// ---------------------------------------------------------------------------
// All command arrays (9 categories)
// ---------------------------------------------------------------------------

const ALL_COMMANDS: readonly CommandDefinition[] = [
  ...taskCommands,
  ...contextCommands,
  ...workspaceCommands,
  ...agentCommands,
  ...forgeCommands,
  ...qualityCommands,
  ...memoryCommands,
  ...systemCommands,
  ...interopCommands,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register all 25 commands on the given router.
 * Throws if command count does not match expected total.
 */
export function registerAllCommands(router: CommandRouter): void {
  if (ALL_COMMANDS.length !== EXPECTED_COMMAND_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COMMAND_COUNT} commands, got ${ALL_COMMANDS.length}`,
    );
  }

  for (const def of ALL_COMMANDS) {
    router.register(def);
  }
}

/**
 * Create a CommandRouter and register all 25 commands.
 * Convenience factory for transport adapters.
 */
export function createWiredCommandRouter(ctx: CommandContext): CommandRouter {
  const router = new CommandRouter(ctx);
  registerAllCommands(router);
  return router;
}
