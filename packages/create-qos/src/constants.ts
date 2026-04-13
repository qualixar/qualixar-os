/**
 * constants.ts — Static data for the create-qualixar-os installer.
 * LLM providers, channels, mode descriptions, and ASCII banner.
 */

export interface LlmProvider {
  readonly value: string;
  readonly label: string;
  readonly envVar: string;
  readonly hint?: string;
}

export const LLM_PROVIDERS: readonly LlmProvider[] = [
  { value: 'azure', label: 'Azure AI Foundry', envVar: 'AZURE_AI_API_KEY', hint: 'recommended' },
  { value: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { value: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { value: 'google', label: 'Google (Gemini)', envVar: 'GOOGLE_API_KEY' },
  { value: 'ollama', label: 'Ollama (local)', envVar: 'OLLAMA_HOST', hint: 'no API key needed' },
  { value: 'custom', label: 'Custom endpoint', envVar: 'LLM_API_KEY' },
] as const;

export const USAGE_MODES = [
  { value: 'mcp', label: 'MCP server in my IDE' },
  { value: 'cli', label: 'CLI tool' },
  { value: 'docker', label: 'Docker service' },
  { value: 'all', label: 'All of the above' },
] as const;

export const CHANNELS = [
  { value: 'dashboard', label: 'Dashboard', hint: 'web UI' },
  { value: 'http', label: 'HTTP API' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
] as const;

export const EXECUTION_MODES = [
  { value: 'companion', label: 'Companion', hint: 'safe — human approves risky actions' },
  { value: 'power', label: 'Power', hint: 'full autonomy — agents execute freely' },
] as const;

export const BANNER = `
  ╭──────────────────────────────────╮
  │   Qualixar OS — The Universal         │
  │   Agent Orchestration Layer       │
  │   v0.1.0                         │
  ╰──────────────────────────────────╯`;

export const DEFAULT_CONFIG = {
  usageMode: 'mcp' as string,
  provider: 'azure' as string,
  channels: ['dashboard', 'http'] as string[],
  executionMode: 'companion' as string,
} as const;
