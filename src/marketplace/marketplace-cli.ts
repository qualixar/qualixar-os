// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Marketplace CLI Commands
 *
 * Commander command registrations for the plugin marketplace.
 * Commands: search, install (registry + local), list, uninstall,
 *           enable, disable, refresh.
 *
 * HR-1: All interfaces are readonly + immutable.
 * Each command wraps lifecycle/registry calls with try/catch and logs output.
 */

import { Command } from 'commander';
import type { PluginLifecycleManager, PluginRegistry, PluginType } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printJson(label: string, data: unknown, log: (msg: string) => void): void {
  log(`${label}:\n${JSON.stringify(data, null, 2)}`);
}

function isValidPluginType(value: string): value is PluginType {
  return ['agent', 'skill', 'tool', 'topology'].includes(value);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMarketplaceCommands(
  program: Command,
  lifecycle: PluginLifecycleManager,
  registry: PluginRegistry,
): void {
  const log = (msg: string): void => { process.stdout.write(`${msg}\n`); };
  const err = (msg: string): void => { process.stderr.write(`${msg}\n`); };

  const marketplace = program
    .command('marketplace')
    .description('Browse, install, and manage Qualixar OS plugins.');

  // marketplace search <query>
  marketplace
    .command('search <query>')
    .description('Search the plugin registry.')
    .option('-t, --type <type>', 'Filter by plugin type: agent | skill | tool | topology')
    .option('--verified', 'Show only verified plugins', false)
    .option('--sort <field>', 'Sort by: stars | installs | updated | name', 'stars')
    .action((query: string, opts: { type?: string; verified: boolean; sort: string }) => {
      try {
        const results = registry.search({
          query,
          ...(opts.type && isValidPluginType(opts.type) ? { type: opts.type } : {}),
          ...(opts.verified ? { verifiedOnly: true } : {}),
          sortBy: opts.sort as 'stars' | 'installs' | 'updated' | 'name',
        });

        if (results.length === 0) {
          log(`No plugins found matching "${query}".`);
          return;
        }

        log(`Found ${results.length} plugin(s) matching "${query}":\n`);
        for (const entry of results) {
          const verified = entry.verified ? ' [verified]' : '';
          log(`  ${entry.id}@${entry.version}${verified}`);
          log(`    ${entry.description}`);
          log(`    Stars: ${entry.stars}  Installs: ${entry.installs}  Updated: ${entry.updatedAt}\n`);
        }
      } catch (e) {
        err(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace install <pluginId> | --local <path>
  marketplace
    .command('install [pluginId]')
    .description('Install a plugin from the registry, or from a local directory with --local.')
    .option('--local <path>', 'Install from a local plugin directory')
    .action(async (pluginId: string | undefined, opts: { local?: string }) => {
      try {
        if (opts.local) {
          log(`Installing plugin from local path: ${opts.local} ...`);
          const installed = await lifecycle.installLocal(opts.local);
          log(`Installed: ${installed.name}@${installed.version} (${installed.tier})`);
          return;
        }

        if (!pluginId || pluginId.trim() === '') {
          err('Error: pluginId is required unless --local is specified.');
          process.exitCode = 1;
          return;
        }

        log(`Installing plugin "${pluginId}" from registry ...`);
        const installed = await lifecycle.install(pluginId.trim());
        log(`Installed: ${installed.name}@${installed.version} (${installed.tier})`);
      } catch (e) {
        err(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace list
  marketplace
    .command('list')
    .description('List all installed plugins.')
    .action(() => {
      try {
        const plugins = lifecycle.list();

        if (plugins.length === 0) {
          log('No plugins are currently installed.');
          return;
        }

        log(`Installed plugins (${plugins.length}):\n`);
        for (const p of plugins) {
          const status = p.enabled ? 'enabled' : 'disabled';
          log(`  ${p.name}@${p.version}  [${status}]  tier=${p.tier}`);
          log(`    ${p.description}\n`);
        }
      } catch (e) {
        err(`List failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace uninstall <pluginId>
  marketplace
    .command('uninstall <pluginId>')
    .description('Uninstall a plugin.')
    .action(async (pluginId: string) => {
      try {
        if (!lifecycle.isInstalled(pluginId)) {
          err(`Plugin is not installed: ${pluginId}`);
          process.exitCode = 1;
          return;
        }

        await lifecycle.uninstall(pluginId);
        log(`Uninstalled: ${pluginId}`);
      } catch (e) {
        err(`Uninstall failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace enable <pluginId>
  marketplace
    .command('enable <pluginId>')
    .description('Enable an installed plugin.')
    .action(async (pluginId: string) => {
      try {
        if (!lifecycle.isInstalled(pluginId)) {
          err(`Plugin is not installed: ${pluginId}`);
          process.exitCode = 1;
          return;
        }

        await lifecycle.enable(pluginId);
        log(`Enabled: ${pluginId}`);
      } catch (e) {
        err(`Enable failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace disable <pluginId>
  marketplace
    .command('disable <pluginId>')
    .description('Disable an installed plugin without uninstalling it.')
    .action(async (pluginId: string) => {
      try {
        if (!lifecycle.isInstalled(pluginId)) {
          err(`Plugin is not installed: ${pluginId}`);
          process.exitCode = 1;
          return;
        }

        await lifecycle.disable(pluginId);
        log(`Disabled: ${pluginId}`);
      } catch (e) {
        err(`Disable failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });

  // marketplace refresh
  marketplace
    .command('refresh')
    .description('Refresh the plugin registry index from the upstream source.')
    .action(async () => {
      try {
        log('Refreshing registry ...');
        await registry.refresh();
        const index = registry.getIndex();
        log(`Registry refreshed. ${index.plugins.length} plugin(s) available. Updated at: ${index.updatedAt}`);
      } catch (e) {
        err(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });
}
