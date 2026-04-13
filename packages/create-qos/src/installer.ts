/**
 * installer.ts — Main interactive flow using @clack/prompts.
 * Handles the full 9-step installer: intro -> mode -> provider -> key -> channels -> exec mode -> config -> MCP -> doctor -> outro.
 * Every prompt checks isCancel() for graceful SIGINT handling.
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { BANNER, LLM_PROVIDERS, USAGE_MODES, CHANNELS, EXECUTION_MODES, DEFAULT_CONFIG } from './constants.js';
import { generateConfig, type InstallerAnswers } from './config-generator.js';
import { configureMcp, SUPPORTED_IDES, type SupportedIde } from './mcp-config.js';

export interface InstallerOptions {
  readonly useDefaults: boolean;
  readonly mcpIde?: string;
  readonly noTelemetry: boolean;
}

function handleCancel(value: unknown): asserts value {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
}

async function runDoctor(provider: string, apiKey: string): Promise<void> {
  const s = p.spinner();
  s.start('Running diagnostics...');

  const checks: string[] = [];

  // Check 1: Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major >= 22) {
    checks.push(`Node.js ${nodeVersion}`);
  } else {
    s.stop(chalk.red(`Node.js ${nodeVersion} — requires >= 22.0.0`));
    return;
  }

  // Check 2: API key format (basic sanity)
  if (provider === 'ollama') {
    checks.push('Ollama (no key needed)');
  } else if (apiKey.length > 0) {
    checks.push('API key present');
  } else {
    checks.push(chalk.yellow('API key empty — set it in ~/.qualixar-os/.env'));
  }

  // Check 3: Config written
  checks.push('Config generated');

  s.stop(`Diagnostics complete: ${checks.join(' | ')}`);
}

export async function runInstaller(options: InstallerOptions): Promise<void> {
  // Step 1: Intro banner
  p.intro(chalk.cyan(BANNER));

  let answers: InstallerAnswers;

  if (options.useDefaults) {
    // --default: skip all prompts, use sensible defaults
    p.log.info('Using default configuration (companion mode, Azure, dashboard + HTTP)');

    answers = {
      usageMode: DEFAULT_CONFIG.usageMode,
      provider: DEFAULT_CONFIG.provider,
      apiKey: '',
      channels: [...DEFAULT_CONFIG.channels],
      executionMode: DEFAULT_CONFIG.executionMode,
    };
  } else if (options.mcpIde) {
    // --mcp <ide>: skip mode question, go straight to MCP config
    p.log.info(`Configuring MCP for ${options.mcpIde}...`);

    const ide = options.mcpIde as SupportedIde;
    if (!SUPPORTED_IDES.includes(ide)) {
      p.log.error(`Unsupported IDE: ${options.mcpIde}. Supported: ${SUPPORTED_IDES.join(', ')}`);
      process.exit(1);
    }

    const result = await configureMcp(ide);
    if (result.success) {
      p.log.success(`MCP configured at ${result.path}`);
    } else {
      p.log.error(`Failed to configure MCP: ${result.error}`);
      process.exit(1);
    }
    p.outro(chalk.green('Qualixar OS MCP is ready! Restart your IDE to activate.'));
    return;
  } else {
    // Full interactive flow

    // Step 2: Usage mode
    const usageMode = await p.select({
      message: 'How will you use Qualixar OS?',
      options: USAGE_MODES.map(m => ({ value: m.value, label: m.label })),
    });
    handleCancel(usageMode);

    // Step 3: LLM provider
    const provider = await p.select({
      message: 'Select LLM provider:',
      options: LLM_PROVIDERS.map(prov => ({
        value: prov.value,
        label: prov.label,
        hint: prov.hint,
      })),
    });
    handleCancel(provider);

    // Step 4: API key (skip for Ollama)
    let apiKey = '';
    if (provider !== 'ollama') {
      const selectedProvider = LLM_PROVIDERS.find(prov => prov.value === provider);
      const envVar = selectedProvider?.envVar ?? 'LLM_API_KEY';

      const keyInput = await p.text({
        message: `Enter your API key (stored in ~/.qualixar-os/.env as ${envVar}):`,
        placeholder: 'sk-...',
        validate(value) {
          if (!value || value.length === 0) {
            return 'API key is required. You can also set it later in ~/.qualixar-os/.env';
          }
        },
      });
      handleCancel(keyInput);
      apiKey = keyInput as string;
    }

    // Step 5: Channels
    const channels = await p.multiselect({
      message: 'Enable channels:',
      options: CHANNELS.map(ch => ({
        value: ch.value,
        label: ch.label,
        hint: 'hint' in ch ? (ch as { hint: string }).hint : undefined,
      })),
      initialValues: ['dashboard', 'http'],
      required: false,
    });
    handleCancel(channels);

    // Step 6: Execution mode
    const executionMode = await p.select({
      message: 'Execution mode:',
      options: EXECUTION_MODES.map(m => ({
        value: m.value,
        label: m.label,
        hint: m.hint,
      })),
    });
    handleCancel(executionMode);

    answers = {
      usageMode: usageMode as string,
      provider: provider as string,
      apiKey,
      channels: channels as string[],
      executionMode: executionMode as string,
    };
  }

  // Step 7: Generate config
  const s = p.spinner();
  s.start('Generating configuration...');
  const paths = await generateConfig(answers);
  s.stop(`Config written to ${paths.configPath}`);

  // Step 8: MCP configuration (if usage mode includes MCP)
  if (answers.usageMode === 'mcp' || answers.usageMode === 'all') {
    if (!options.useDefaults) {
      const shouldConfigMcp = await p.confirm({
        message: 'Configure MCP for an IDE now?',
        initialValue: true,
      });
      handleCancel(shouldConfigMcp);

      if (shouldConfigMcp) {
        const ide = await p.select({
          message: 'Select IDE:',
          options: SUPPORTED_IDES.map(id => ({ value: id, label: id })),
        });
        handleCancel(ide);

        const mcpResult = await configureMcp(ide as SupportedIde);
        if (mcpResult.success) {
          p.log.success(`MCP configured at ${mcpResult.path}`);
        } else {
          p.log.error(`Failed to configure MCP: ${mcpResult.error}`);
        }
      }
    }
  }

  // Step 9: Doctor diagnostics
  await runDoctor(answers.provider, answers.apiKey);

  // Step 10: Outro
  p.outro(chalk.green([
    'Qualixar OS is ready!',
    '',
    `  Config:  ${paths.configPath}`,
    `  Secrets: ${paths.envPath}`,
    '',
    '  Next steps:',
    '    npx qualixar-os run "Hello world"',
    '    npx qualixar-os doctor',
  ].join('\n')));
}
