// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase A1 -- Command Context Factory
 *
 * Creates a CommandContext from an Orchestrator instance.
 * Centralizes the pattern previously inlined in cli.ts dispatch.
 * Every transport calls this once at startup to get a shared context.
 *
 * Source: Phase A1 LLD Section 3.2
 */

import pino from 'pino';
import type { Orchestrator } from '../engine/orchestrator.js';
import type { CommandContext } from './types.js';
import { ConfigManagerImpl } from '../config/config-manager.js';
import type { QosConfig } from '../types/common.js';

/**
 * Create a CommandContext from an Orchestrator.
 *
 * The Orchestrator already owns db, eventBus, and modeEngine.
 * This factory wraps modeEngine.getConfig() in a ConfigManager
 * and provides a silent logger for command dispatch logging.
 */
export function createCommandContext(orchestrator: Orchestrator): CommandContext {
  const config = new ConfigManagerImpl(
    orchestrator.modeEngine.getConfig() as QosConfig,
  );
  const logger = pino({ level: 'silent' });

  return {
    orchestrator,
    db: orchestrator.db,
    eventBus: orchestrator.eventBus,
    config,
    logger,
  };
}
