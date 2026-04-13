// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Wizard Runner
 * LLD Section 8.1
 *
 * Runs the interactive setup wizard with provider detection,
 * credential storage, and config generation.
 * HR-4: All prompts mockable via DI (promptFn parameter).
 * HR-6: API keys never logged or written to plaintext.
 */

import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import yaml from 'yaml';
import { QosConfigSchema } from '../../types/common.js';
import type { WizardMode, WizardResult, NonInteractiveOptions } from '../../types/phase19.js';
import { getSteps } from './wizard-steps.js';
import { createProviderDetector } from './provider-detector.js';
import { PROVIDER_CATALOG } from '../../config/provider-catalog.js';

// ---------------------------------------------------------------------------
// Prompt Function Types (DI for testability)
// ---------------------------------------------------------------------------

export interface PromptFunctions {
  select: (config: { message: string; choices: readonly { name: string; value: string }[]; default?: string }) => Promise<string>;
  input: (config: { message: string; default?: string }) => Promise<string>;
  confirm: (config: { message: string; default?: boolean }) => Promise<boolean>;
  password: (config: { message: string }) => Promise<string>;
  checkbox: (config: { message: string; choices: readonly { name: string; value: string }[] }) => Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWizardRunner(promptFn: PromptFunctions): {
  run(mode: WizardMode): Promise<WizardResult>;
  runNonInteractive(opts: NonInteractiveOptions): WizardResult;
} {
  return new WizardRunnerImpl(promptFn);
}

// ---------------------------------------------------------------------------
// Config Generation
// ---------------------------------------------------------------------------

export function generateConfig(result: WizardResult): Record<string, unknown> {
  const configDir = resolve(result.workspaceDir || homedir(), '.qualixar-os');
  const configObj: Record<string, unknown> = {
    mode: 'companion',
    models: {
      primary: result.model,
      fallback: result.fallbackModel ?? undefined,
      catalog: [],
    },
    budget: { max_usd: result.budgetUsd, warn_pct: 0.8 },
    security: {
      container_isolation: result.securityContainerIsolation,
      allowed_paths: [...result.allowedPaths],
      denied_commands: [...result.deniedCommands],
    },
    memory: {
      enabled: result.memoryEnabled,
      auto_invoke: true,
      max_ram_mb: 50,
    },
    dashboard: {
      enabled: result.dashboardEnabled,
      port: result.dashboardPort,
    },
    channels: {
      mcp: true,
      http: { enabled: true, port: 3000 },
    },
    observability: { log_level: 'info' },
    db: { path: join(configDir, 'qos.db') },
  };

  // Add channel configs
  const channels = configObj.channels as Record<string, unknown>;
  for (const ch of result.channels) {
    if (ch === 'discord') {
      channels.discord = { enabled: false, token: '' };
    } else if (ch === 'telegram') {
      channels.telegram = { enabled: false, token: '' };
    } else if (ch === 'webhook') {
      channels.webhook = { enabled: false, url: '' };
    }
  }

  // Validate
  QosConfigSchema.parse(configObj);
  return configObj;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class WizardRunnerImpl {
  private readonly _prompt: PromptFunctions;

  constructor(promptFn: PromptFunctions) {
    this._prompt = promptFn;
  }

  async run(mode: WizardMode): Promise<WizardResult> {
    const detector = createProviderDetector();
    const detected = detector.detect();

    // Select provider
    const steps = getSteps(mode);
    const providerStep = steps.find((s) => s.id === 'provider');
    const providerChoices = (providerStep?.choices ?? []).map((c) => {
      const isDetected = detected.some((d) => d.provider === c.value);
      return {
        name: isDetected ? `${c.name} (detected)` : c.name,
        value: c.value,
      };
    });

    // Sort: detected first
    providerChoices.sort((a, b) => {
      const aDetected = a.name.includes('(detected)') ? 0 : 1;
      const bDetected = b.name.includes('(detected)') ? 0 : 1;
      return aDetected - bDetected;
    });

    const defaultProvider = detected[0]?.provider ?? 'anthropic';
    const provider = await this._prompt.select({
      message: 'Select primary LLM provider:',
      choices: providerChoices,
      default: defaultProvider,
    });

    // API key
    const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === provider);
    const defaultEnv = catalogEntry?.defaultApiKeyEnv ?? '';
    let apiKeyMode: 'direct' | 'env_ref' = 'env_ref';
    let apiKeyEnv = defaultEnv;

    if (provider !== 'ollama') {
      const envHasKey = defaultEnv && process.env[defaultEnv];
      if (envHasKey) {
        const useDetected = await this._prompt.confirm({
          message: `Use detected API key from $${defaultEnv}?`,
          default: true,
        });
        if (useDetected) {
          apiKeyMode = 'env_ref';
          apiKeyEnv = defaultEnv;
        } else {
          apiKeyMode = 'direct';
        }
      } else {
        apiKeyMode = await this._prompt.select({
          message: 'How to provide API key?',
          choices: [
            { name: 'Environment variable', value: 'env_ref' },
            { name: 'Enter directly', value: 'direct' },
          ],
        }) as 'direct' | 'env_ref';
      }

      if (apiKeyMode === 'env_ref') {
        apiKeyEnv = await this._prompt.input({
          message: 'Environment variable name:',
          default: defaultEnv,
        });
      }
    }

    // Model defaults
    const detectedInfo = detected.find((d) => d.provider === provider);
    const model = detectedInfo?.defaultModel ?? 'claude-sonnet-4-6';
    const fallbackModel = detectedInfo?.defaultFallback ?? null;

    // Embedding
    const embeddingChoice = await this._prompt.select({
      message: 'Embedding provider:',
      choices: [
        { name: 'Same as primary', value: 'same' },
        { name: 'Skip', value: 'skip' },
      ],
    });
    const embeddingProvider = embeddingChoice === 'same' ? provider : null;

    // Dashboard
    const dashboardEnabled = await this._prompt.confirm({
      message: 'Enable dashboard?',
      default: true,
    });

    // Channels
    const channels = await this._prompt.checkbox({
      message: 'Enable channels:',
      choices: [
        { name: 'Discord', value: 'discord' },
        { name: 'Telegram', value: 'telegram' },
        { name: 'Webhook', value: 'webhook' },
      ],
    });

    // Workspace
    const workspaceDir = await this._prompt.input({
      message: 'Workspace directory:',
      default: process.cwd(),
    });

    // Advanced-only fields
    let budgetUsd = 10;
    let securityContainerIsolation = false;
    let allowedPaths: readonly string[] = ['./'];
    let deniedCommands: readonly string[] = ['rm -rf', 'sudo'];

    if (mode === 'advanced') {
      const budgetStr = await this._prompt.input({ message: 'Budget limit (USD):', default: '10' });
      budgetUsd = parseFloat(budgetStr) || 10;
      securityContainerIsolation = await this._prompt.confirm({ message: 'Container isolation?', default: false });
      const pathsStr = await this._prompt.input({ message: 'Allowed paths:', default: './' });
      allowedPaths = pathsStr.split(',').map((s) => s.trim());
      const deniedStr = await this._prompt.input({ message: 'Denied commands:', default: 'rm -rf, sudo' });
      deniedCommands = deniedStr.split(',').map((s) => s.trim());
    }

    return {
      mode,
      provider,
      apiKeyMode,
      apiKeyEnv,
      model,
      fallbackModel,
      embeddingProvider,
      embeddingModel: null,
      dashboardEnabled,
      dashboardPort: 3333,
      channels,
      budgetUsd,
      memoryEnabled: true,
      securityContainerIsolation,
      allowedPaths,
      deniedCommands,
      workspaceDir,
      mcpServers: [],
      a2aEndpoints: [],
    };
  }

  runNonInteractive(opts: NonInteractiveOptions): WizardResult {
    const detector = createProviderDetector();
    const detected = detector.detect();
    const provider = opts.provider ?? detected[0]?.provider ?? 'anthropic';
    const detectedInfo = detected.find((d) => d.provider === provider);

    return {
      mode: 'quick',
      provider,
      apiKeyMode: 'env_ref',
      apiKeyEnv: opts.apiKeyEnv ?? PROVIDER_CATALOG.find((p) => p.id === provider)?.defaultApiKeyEnv ?? '',
      model: opts.model ?? detectedInfo?.defaultModel ?? 'claude-sonnet-4-6',
      fallbackModel: opts.fallbackModel ?? detectedInfo?.defaultFallback ?? null,
      embeddingProvider: opts.embeddingProvider ?? provider,
      embeddingModel: opts.embeddingModel ?? null,
      dashboardEnabled: opts.dashboard ?? true,
      dashboardPort: opts.dashboardPort ?? 3333,
      channels: opts.channels ?? [],
      budgetUsd: opts.budget ?? 10,
      memoryEnabled: true,
      securityContainerIsolation: false,
      allowedPaths: ['./'],
      deniedCommands: ['rm -rf', 'sudo'],
      workspaceDir: opts.projectDir ?? process.cwd(),
      mcpServers: [],
      a2aEndpoints: [],
    };
  }
}

/**
 * Write generated config to disk.
 */
export function writeConfig(configObj: Record<string, unknown>, configDir: string): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configPath = join(configDir, 'config.yaml');
  writeFileSync(configPath, yaml.stringify(configObj), 'utf-8');
}
