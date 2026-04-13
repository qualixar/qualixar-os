#!/usr/bin/env node

/**
 * Qualixar OS CLI entry point.
 * Uses parseAsync to properly await async command actions (serve, dashboard).
 */
const { program } = await import('../dist/channels/cli.js');
await program.parseAsync(process.argv);
