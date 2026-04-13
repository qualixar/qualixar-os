// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- HTTP Transport Adapter
 *
 * Returns a Hono sub-app with `/` (list) and `/:command` (dispatch) routes.
 * Coexists with existing `/api/*` routes under a different namespace (`/cmd`).
 *
 * Source: Phase 10 LLD Section 2.15
 */

import { Hono } from 'hono';
import type { CommandRouter } from '../router.js';
import type { CommandError } from '../types.js';

// ---------------------------------------------------------------------------
// Error Code to HTTP Status Mapping
// ---------------------------------------------------------------------------

export function mapErrorToHttpStatus(error?: CommandError): number {
  if (!error) return 500;

  switch (error.code) {
    case 'COMMAND_NOT_FOUND':
    case 'TASK_NOT_FOUND':
    case 'AGENT_NOT_FOUND':
      return 404;
    case 'VALIDATION_ERROR':
      return 400;
    case 'CONFIG_READONLY':
      return 403;
    case 'BUDGET_EXCEEDED':
      return 402;
    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Route Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hono sub-app for Universal Command Protocol dispatch.
 * Mount under `/cmd` in the main HTTP server.
 *
 * GET  /     -> list all registered commands
 * POST /:command -> dispatch command with JSON body as input
 */
export function createCmdRoutes(router: CommandRouter): Hono {
  const cmd = new Hono();

  // Discovery: list all commands
  cmd.get('/', (c) => {
    const commands = router.list().map((d) => ({
      name: d.name,
      category: d.category,
      description: d.description,
      type: d.type,
    }));
    return c.json({ commands });
  });

  // Dispatch: execute any command
  cmd.post('/:command', async (c) => {
    const commandName = c.req.param('command');
    const body = await c.req.json().catch(() => ({})) as unknown;
    const result = await router.dispatch(commandName, body);
    const httpStatus = result.success ? 200 : mapErrorToHttpStatus(result.error);
    return c.json(result, httpStatus as never);
  });

  return cmd;
}
