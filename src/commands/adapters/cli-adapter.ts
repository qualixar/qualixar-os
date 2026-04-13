// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 10 -- CLI Transport Adapter
 *
 * Wires Commander.js to the CommandRouter. Adds a single `cmd <command>`
 * subcommand for unified dispatch. Existing CLI commands are NOT modified.
 *
 * Source: Phase 10 LLD Section 2.13
 * Stage 2 note: CliDeps gains optional `commandRouter` field for migration.
 */

import type { Command } from 'commander';
import type { CommandRouter } from '../router.js';

// ---------------------------------------------------------------------------
// Wire CLI to Router
// ---------------------------------------------------------------------------

/**
 * Adds a `cmd <command>` subcommand to the Commander program that dispatches
 * to the CommandRouter. Stage 1: additive only, no changes to existing CLI.
 */
export function wireCliToRouter(program: Command, router: CommandRouter): void {
  program
    .command('cmd <command>')
    .description('Execute any Universal Command Protocol command')
    .option('--json', 'Output raw JSON')
    .option('-i, --input <json>', 'JSON input for the command')
    .action(async (command: string, opts: Record<string, unknown>) => {
      const input = typeof opts.input === 'string'
        ? JSON.parse(opts.input) as unknown
        : {};

      const result = await router.dispatch(command, input);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.success) {
        const output = typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2);
        console.log(output);
      } else {
        console.error(
          `Error [${result.error?.code ?? 'UNKNOWN'}]: ${result.error?.message ?? 'Unknown error'}`,
        );
        process.exit(1);
      }
    });

  // Add per-command subcommands under `cmd` for discoverability
  const cmdList = program
    .command('cmd-list')
    .description('List all available Universal Command Protocol commands');

  cmdList.action(() => {
    const commands = router.list();
    for (const def of commands) {
      console.log(`  ${def.name.padEnd(24)} [${def.category}] ${def.description}`);
    }
  });
}
