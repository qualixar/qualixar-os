/**
 * config-generator.ts — Generates ~/.qualixar-os/config.yaml and ~/.qualixar-os/.env
 * API keys go in .env (security), everything else in YAML.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stringify } from 'yaml';

export interface InstallerAnswers {
  readonly usageMode: string;
  readonly provider: string;
  readonly apiKey: string;
  readonly channels: string[];
  readonly executionMode: string;
}

export interface GeneratedPaths {
  readonly configDir: string;
  readonly configPath: string;
  readonly envPath: string;
}

export async function generateConfig(answers: InstallerAnswers): Promise<GeneratedPaths> {
  const configDir = join(homedir(), '.qualixar-os');
  const configPath = join(configDir, 'config.yaml');
  const envPath = join(configDir, '.env');

  await mkdir(configDir, { recursive: true });

  // Config YAML — no secrets here
  const config = {
    version: '0.1.0',
    usage_mode: answers.usageMode,
    provider: answers.provider,
    channels: answers.channels,
    execution_mode: answers.executionMode,
    telemetry: false,
  };

  await writeFile(configPath, stringify(config), 'utf-8');

  // .env — secrets only
  const envContent = answers.apiKey
    ? `# Qualixar OS secrets — do NOT commit this file\nLLM_API_KEY=${answers.apiKey}\n`
    : `# Qualixar OS secrets — do NOT commit this file\n# LLM_API_KEY=your-key-here\n`;

  await writeFile(envPath, envContent, { encoding: 'utf-8', mode: 0o600 });

  return { configDir, configPath, envPath };
}
