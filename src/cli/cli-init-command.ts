// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Init Command Handler
 * LLD Section 3.3, Algorithm 8.1
 *
 * Replaces existing init action in cli.ts with 3-tier wizard.
 * HR-6: API keys never logged or written to plaintext.
 * HR-9: Ctrl+C handled gracefully.
 * HR-14: Detects existing config and prompts overwrite/edit/cancel.
 * HR-15: TTY detection for non-interactive mode.
 */

import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { CredentialStore } from '../types/phase18.js';
import type { NonInteractiveOptions, WizardMode } from '../types/phase19.js';
import { createWizardRunner, generateConfig, writeConfig } from './wizard/wizard-runner.js';
import type { PromptFunctions } from './wizard/wizard-runner.js';

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleInitCommand(
  opts: NonInteractiveOptions & { default?: boolean },
  deps: {
    readonly credentialStore?: CredentialStore;
    readonly log?: (msg: string) => void;
    readonly promptFn?: PromptFunctions;
  },
): Promise<void> {
  const log = deps.log ?? console.log;

  // TTY detection (HR-15)
  const isNonInteractive = opts.noInteractive || opts.default || !process.stdin.isTTY;

  if (isNonInteractive && !opts.noInteractive) {
    log('Non-interactive mode: stdin is not a TTY.');
  }

  // Build prompt functions (use @inquirer/prompts if available, fall back to DI)
  let promptFn: PromptFunctions;
  if (deps.promptFn) {
    promptFn = deps.promptFn;
  } else {
    const inquirer = await import('@inquirer/prompts');
    promptFn = {
      select: (c) => inquirer.select({ message: c.message, choices: c.choices.map((ch) => ({ name: ch.name, value: ch.value })), default: c.default }),
      input: (c) => inquirer.input({ message: c.message, default: c.default }),
      confirm: (c) => inquirer.confirm({ message: c.message, default: c.default }),
      password: (c) => inquirer.password({ message: c.message }),
      checkbox: (c) => inquirer.checkbox({ message: c.message, choices: c.choices.map((ch) => ({ name: ch.name, value: ch.value })) }),
    };
  }

  const configDir = resolve(homedir(), '.qualixar-os');
  const configPath = join(configDir, 'config.yaml');

  try {
    // Check for existing config (HR-14)
    if (existsSync(configPath) && !isNonInteractive) {
      const action = await promptFn.select({
        message: 'Existing configuration found. What would you like to do?',
        choices: [
          { name: 'Overwrite (run full wizard)', value: 'overwrite' },
          { name: 'Cancel', value: 'cancel' },
        ],
      });
      if (action === 'cancel') {
        log('Setup cancelled.');
        return;
      }
    }

    const runner = createWizardRunner(promptFn);

    let result;
    if (isNonInteractive) {
      result = runner.runNonInteractive(opts);
      log('Using non-interactive defaults...');
    } else {
      // Select mode
      const mode = await promptFn.select({
        message: 'Choose setup mode:',
        choices: [
          { name: 'Quick Setup (recommended — 2 minutes)', value: 'quick' },
          { name: 'Advanced Setup (full configuration)', value: 'advanced' },
        ],
        default: 'quick',
      }) as WizardMode;

      result = await runner.run(mode);
    }

    // Generate and write config
    const configObj = generateConfig(result);
    writeConfig(configObj, configDir);
    log(`Config written to ${configPath}`);

    // Store credential via Phase 18 CredentialStore (CROSS-01: no .env writing)
    if (deps.credentialStore && result.apiKeyEnv) {
      deps.credentialStore.store({
        providerName: result.provider,
        storageMode: result.apiKeyMode,
        value: result.apiKeyEnv,
      });
      log(`Credential stored for ${result.provider} (${result.apiKeyMode})`);
    }

    // Summary
    log('');
    log('Qualixar OS initialized successfully!');
    log(`  Provider: ${result.provider}`);
    log(`  Model:    ${result.model}`);
    log(`  Dashboard: ${result.dashboardEnabled ? 'enabled' : 'disabled'}`);
    log('');
    log('Next steps:');
    log('  1. Run: qos serve');
    log('  2. Open: http://localhost:3333');

  } catch (err) {
    // HR-9: Graceful Ctrl+C
    if (err instanceof Error && (err.name === 'ExitPromptError' || err.message.includes('User force closed'))) {
      log('\nSetup cancelled. Run `qos init` to try again.');
      return;
    }
    throw err;
  }
}
