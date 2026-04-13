#!/usr/bin/env node
/**
 * index.ts — Entry point for `npx create-qualixar-os`.
 * Parses CLI args manually (no heavy framework), then dispatches to the installer.
 *
 * Flags:
 *   --default, -y    Skip all prompts, use sensible defaults
 *   --mcp <ide>      Skip mode question, configure MCP for specified IDE
 *   --no-telemetry   Disable anonymous telemetry
 *   --help, -h       Show help text
 *   --version, -v    Show version
 */

import { runInstaller, type InstallerOptions } from './installer.js';

interface ParsedArgs {
  readonly useDefaults: boolean;
  readonly mcpIde?: string;
  readonly noTelemetry: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  // Skip node and script path — start at index 2
  const args = argv.slice(2);

  let useDefaults = false;
  let mcpIde: string | undefined;
  let noTelemetry = false;
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--default':
      case '-y':
      case '--yes':
        useDefaults = true;
        break;
      case '--mcp': {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          mcpIde = next;
          i++; // consume the next arg
        } else {
          console.error('Error: --mcp requires an IDE name (claude-code, cursor, windsurf, vscode, antigravity)');
          process.exit(1);
        }
        break;
      }
      case '--no-telemetry':
        noTelemetry = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--version':
      case '-v':
        version = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          console.error('Run with --help for usage information.');
          process.exit(1);
        }
        break;
    }
  }

  return { useDefaults, mcpIde, noTelemetry, help, version };
}

function showHelp(): void {
  console.log(`
  create-qualixar-os — The Universal Agent Orchestration Layer

  Usage:
    npx create-qualixar-os [options]

  Options:
    --default, -y     Skip prompts, use sensible defaults
    --mcp <ide>       Configure MCP for an IDE
                      (claude-code, cursor, cursor-global, windsurf, vscode, antigravity)
    --no-telemetry    Disable anonymous telemetry
    --help, -h        Show this help message
    --version, -v     Show version

  Examples:
    npx create-qualixar-os                  # Full interactive setup
    npx create-qualixar-os --default        # Quick start with defaults
    npx create-qualixar-os --mcp cursor     # Configure MCP for Cursor
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.version) {
    console.log('create-qualixar-os v0.1.0');
    return;
  }

  if (parsed.help) {
    showHelp();
    return;
  }

  const options: InstallerOptions = {
    useDefaults: parsed.useDefaults,
    mcpIde: parsed.mcpIde,
    noTelemetry: parsed.noTelemetry,
  };

  await runInstaller(options);
}

main().catch((error: Error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
