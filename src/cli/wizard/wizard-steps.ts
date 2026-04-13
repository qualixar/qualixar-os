// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Wizard Step Definitions
 * LLD Section 8.1
 *
 * Step definitions for Quick (9 steps), Advanced (21 steps), Manual (3 steps).
 * Each step has a unique ID, prompt type, and mode filter.
 */

import type { WizardStep } from '../../types/phase19.js';

export const WIZARD_STEPS: readonly WizardStep[] = [
  // --- Quick + Advanced: Core Setup ---
  {
    id: 'mode',
    title: 'Setup Mode',
    modes: ['quick', 'advanced', 'manual'],
    promptType: 'select',
    message: 'Choose setup mode:',
    defaultValue: 'quick',
    choices: [
      { name: 'Quick Setup (recommended — 2 minutes)', value: 'quick' },
      { name: 'Advanced Setup (full configuration)', value: 'advanced' },
      { name: 'Manual Setup (expert mode — config.yaml editor)', value: 'manual' },
    ],
  },
  {
    id: 'provider',
    title: 'Primary Provider',
    modes: ['quick', 'advanced'],
    promptType: 'select',
    message: 'Select primary LLM provider:',
    defaultValue: 'anthropic',
    choices: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT-4.1)', value: 'openai' },
      { name: 'Azure OpenAI', value: 'azure-openai' },
      { name: 'Google AI (Gemini)', value: 'google' },
      { name: 'Ollama (Local)', value: 'ollama' },
      { name: 'AWS Bedrock', value: 'bedrock' },
      { name: 'OpenRouter', value: 'openrouter' },
      { name: 'Groq', value: 'groq' },
      { name: 'Mistral AI', value: 'mistral' },
      { name: 'DeepSeek', value: 'deepseek' },
      { name: 'Together AI', value: 'together' },
      { name: 'Fireworks AI', value: 'fireworks' },
      { name: 'Cerebras', value: 'cerebras' },
      { name: 'Cohere', value: 'cohere' },
    ],
  },
  {
    id: 'api_key_mode',
    title: 'API Key Mode',
    modes: ['quick', 'advanced'],
    promptType: 'select',
    message: 'How to provide API key?',
    defaultValue: 'env_ref',
    choices: [
      { name: 'Environment variable (recommended)', value: 'env_ref' },
      { name: 'Enter directly (encrypted storage)', value: 'direct' },
    ],
    skipWhen: 'provider_is_ollama',
  },
  {
    id: 'api_key_env',
    title: 'API Key Env Var',
    modes: ['quick', 'advanced'],
    promptType: 'input',
    message: 'Enter environment variable name:',
    defaultValue: null,
  },
  {
    id: 'api_key_direct',
    title: 'API Key',
    modes: ['quick', 'advanced'],
    promptType: 'password',
    message: 'Enter API key:',
    defaultValue: null,
  },
  {
    id: 'embedding',
    title: 'Embedding Provider',
    modes: ['quick', 'advanced'],
    promptType: 'select',
    message: 'Embedding provider:',
    defaultValue: 'same',
    choices: [
      { name: 'Same as primary provider', value: 'same' },
      { name: 'Different provider', value: 'different' },
      { name: 'Skip (no embeddings)', value: 'skip' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    modes: ['quick', 'advanced'],
    promptType: 'confirm',
    message: 'Enable dashboard?',
    defaultValue: true,
  },
  {
    id: 'channels',
    title: 'Channels',
    modes: ['quick', 'advanced'],
    promptType: 'checkbox',
    message: 'Enable channels:',
    defaultValue: [],
    choices: [
      { name: 'Discord', value: 'discord' },
      { name: 'Telegram', value: 'telegram' },
      { name: 'Webhook', value: 'webhook' },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace Directory',
    modes: ['quick', 'advanced'],
    promptType: 'input',
    message: 'Workspace directory:',
    defaultValue: null,
  },

  // --- Advanced Only ---
  {
    id: 'fallback_provider',
    title: 'Fallback Provider',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Add fallback provider?',
    defaultValue: false,
  },
  {
    id: 'judge_model',
    title: 'Judge Model',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Add judge model?',
    defaultValue: false,
  },
  {
    id: 'budget',
    title: 'Budget Limit',
    modes: ['advanced'],
    promptType: 'input',
    message: 'Budget limit (USD):',
    defaultValue: '10',
  },
  {
    id: 'budget_warn',
    title: 'Budget Warning',
    modes: ['advanced'],
    promptType: 'input',
    message: 'Budget warning threshold (%):',
    defaultValue: '80',
  },
  {
    id: 'security_paths',
    title: 'Allowed Paths',
    modes: ['advanced'],
    promptType: 'input',
    message: 'Allowed paths (comma-separated):',
    defaultValue: './',
  },
  {
    id: 'security_denied',
    title: 'Denied Commands',
    modes: ['advanced'],
    promptType: 'input',
    message: 'Denied commands (comma-separated):',
    defaultValue: 'rm -rf, sudo',
  },
  {
    id: 'security_container',
    title: 'Container Isolation',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Enable container isolation?',
    defaultValue: false,
  },
  {
    id: 'memory_auto',
    title: 'Memory Auto-Invoke',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Enable memory auto-invoke?',
    defaultValue: true,
  },
  {
    id: 'memory_ram',
    title: 'Max RAM',
    modes: ['advanced'],
    promptType: 'input',
    message: 'Max memory RAM (MB):',
    defaultValue: '50',
  },
  {
    id: 'mcp_servers',
    title: 'MCP Servers',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Configure MCP servers?',
    defaultValue: false,
  },
  {
    id: 'a2a_endpoints',
    title: 'A2A Endpoints',
    modes: ['advanced'],
    promptType: 'confirm',
    message: 'Configure A2A endpoints?',
    defaultValue: false,
  },

  // --- Manual ---
  {
    id: 'manual_edit',
    title: 'Edit Config',
    modes: ['manual'],
    promptType: 'confirm',
    message: 'Open config.yaml in editor?',
    defaultValue: true,
  },
  {
    id: 'manual_doctor',
    title: 'Run Doctor',
    modes: ['manual'],
    promptType: 'confirm',
    message: 'Run doctor to verify?',
    defaultValue: true,
  },
];

/**
 * Get wizard steps filtered by mode.
 */
export function getSteps(mode: 'quick' | 'advanced' | 'manual'): readonly WizardStep[] {
  return WIZARD_STEPS.filter((step) => step.modes.includes(mode));
}
