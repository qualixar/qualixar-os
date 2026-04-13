// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Provider Catalog
 * LLD Section 15
 *
 * Static catalog of 15+ LLM/embedding providers with config fields,
 * logos, and embedding model metadata. HR-8: at least 15 entries.
 */

import type { ProviderCatalogEntry } from '../types/phase18.js';

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    type: 'openai',
    icon: 'openai',
    description: 'GPT-4.1, GPT-4.1-mini, o3, o4-mini, DALL-E',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'OPENAI_API_KEY',
    defaultEndpoint: null,
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...', helpText: 'Your OpenAI API key from platform.openai.com', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'text-embedding-3-large', displayName: 'Embedding 3 Large', dimensions: 3072, maxTokens: 8191 },
      { modelId: 'text-embedding-3-small', displayName: 'Embedding 3 Small', dimensions: 1536, maxTokens: 8191 },
      { modelId: 'text-embedding-ada-002', displayName: 'Ada 002 (Legacy)', dimensions: 1536, maxTokens: 8191 },
    ],
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    type: 'anthropic',
    icon: 'anthropic',
    description: 'Claude Opus 4, Sonnet 4, Haiku 4.5',
    supportsEmbeddings: false,
    defaultApiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultEndpoint: null,
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-...', helpText: 'Your Anthropic API key from console.anthropic.com', supportsEnvRef: true },
    ],
    embeddingModels: [],
  },
  {
    id: 'azure-openai',
    displayName: 'Azure OpenAI',
    type: 'azure-openai',
    icon: 'azure',
    description: 'Azure AI Foundry: GPT-4.1, Claude via Azure, embeddings',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'AZURE_AI_API_KEY',
    defaultEndpoint: null,
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Azure AI API key', supportsEnvRef: true },
      { name: 'endpoint', label: 'Endpoint URL', type: 'url', required: true, placeholder: 'https://your-resource.openai.azure.com', helpText: 'Azure OpenAI resource endpoint' },
      { name: 'apiVersion', label: 'API Version', type: 'text', required: false, placeholder: '2024-10-21', helpText: 'API version (defaults to 2024-10-21)' },
    ],
    embeddingModels: [
      { modelId: 'text-embedding-3-large', displayName: 'Embedding 3 Large', dimensions: 3072, maxTokens: 8191 },
      { modelId: 'text-embedding-ada-002', displayName: 'Ada 002', dimensions: 1536, maxTokens: 8191 },
    ],
  },
  {
    id: 'google',
    displayName: 'Google AI',
    type: 'google',
    icon: 'google',
    description: 'Gemini 2.5 Pro, Gemini 2.5 Flash',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'GOOGLE_API_KEY',
    defaultEndpoint: null,
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Google AI API key from aistudio.google.com', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'text-embedding-004', displayName: 'Text Embedding 004', dimensions: 768, maxTokens: 2048 },
      { modelId: 'text-multilingual-embedding-002', displayName: 'Multilingual 002', dimensions: 768, maxTokens: 2048 },
    ],
  },
  {
    id: 'ollama',
    displayName: 'Ollama (Local)',
    type: 'ollama',
    icon: 'ollama',
    description: 'Local models: Llama 3, Mistral, CodeLlama, nomic-embed',
    supportsEmbeddings: true,
    defaultApiKeyEnv: '',
    defaultEndpoint: 'http://localhost:11434',
    configFields: [
      { name: 'endpoint', label: 'Ollama URL', type: 'url', required: false, placeholder: 'http://localhost:11434', helpText: 'Ollama server URL (default: localhost:11434)' },
    ],
    embeddingModels: [
      { modelId: 'nomic-embed-text', displayName: 'Nomic Embed Text', dimensions: 768, maxTokens: 8192 },
      { modelId: 'mxbai-embed-large', displayName: 'mxbai Embed Large', dimensions: 1024, maxTokens: 512 },
      { modelId: 'all-minilm', displayName: 'All MiniLM', dimensions: 384, maxTokens: 256 },
    ],
  },
  {
    id: 'bedrock',
    displayName: 'AWS Bedrock',
    type: 'bedrock',
    icon: 'aws',
    description: 'Claude, Titan, Llama via AWS',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'AWS_ACCESS_KEY_ID',
    defaultEndpoint: null,
    configFields: [
      { name: 'apiKey', label: 'AWS Access Key ID', type: 'password', required: true, placeholder: '', helpText: 'AWS access key', supportsEnvRef: true },
      { name: 'secretKey', label: 'AWS Secret Access Key', type: 'password', required: true, placeholder: '', helpText: 'AWS secret key', supportsEnvRef: true },
      { name: 'region', label: 'AWS Region', type: 'select', required: true, placeholder: '', helpText: 'AWS region', options: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1'] },
    ],
    embeddingModels: [
      { modelId: 'amazon.titan-embed-text-v2:0', displayName: 'Titan Embed v2', dimensions: 1024, maxTokens: 8192 },
    ],
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    type: 'openrouter',
    icon: 'openrouter',
    description: 'Access 100+ models via single API key',
    supportsEmbeddings: false,
    defaultApiKeyEnv: 'OPENROUTER_API_KEY',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-or-...', helpText: 'OpenRouter API key from openrouter.ai', supportsEnvRef: true },
    ],
    embeddingModels: [],
  },
  {
    id: 'groq',
    displayName: 'Groq',
    type: 'groq',
    icon: 'groq',
    description: 'Ultra-fast inference: Llama, Mixtral, Gemma',
    supportsEmbeddings: false,
    defaultApiKeyEnv: 'GROQ_API_KEY',
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'gsk_...', helpText: 'Groq API key from console.groq.com', supportsEnvRef: true },
    ],
    embeddingModels: [],
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    type: 'mistral',
    icon: 'mistral',
    description: 'Mistral Large, Medium, Small, Codestral',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'MISTRAL_API_KEY',
    defaultEndpoint: 'https://api.mistral.ai/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Mistral API key from console.mistral.ai', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'mistral-embed', displayName: 'Mistral Embed', dimensions: 1024, maxTokens: 8192 },
    ],
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    type: 'deepseek',
    icon: 'deepseek',
    description: 'DeepSeek V3, DeepSeek Coder',
    supportsEmbeddings: false,
    defaultApiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...', helpText: 'DeepSeek API key', supportsEnvRef: true },
    ],
    embeddingModels: [],
  },
  {
    id: 'together',
    displayName: 'Together AI',
    type: 'together',
    icon: 'together',
    description: 'Open-source models: Llama, Mixtral, DBRX',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'TOGETHER_API_KEY',
    defaultEndpoint: 'https://api.together.xyz/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Together AI API key', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'togethercomputer/m2-bert-80M-8k-retrieval', displayName: 'M2-BERT 80M', dimensions: 768, maxTokens: 8192 },
    ],
  },
  {
    id: 'fireworks',
    displayName: 'Fireworks AI',
    type: 'fireworks',
    icon: 'fireworks',
    description: 'Fast open-source model hosting',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'FIREWORKS_API_KEY',
    defaultEndpoint: 'https://api.fireworks.ai/inference/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Fireworks AI API key', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'nomic-ai/nomic-embed-text-v1.5', displayName: 'Nomic Embed v1.5', dimensions: 768, maxTokens: 8192 },
    ],
  },
  {
    id: 'cerebras',
    displayName: 'Cerebras',
    type: 'cerebras',
    icon: 'cerebras',
    description: 'Wafer-scale inference: ultra-fast Llama',
    supportsEmbeddings: false,
    defaultApiKeyEnv: 'CEREBRAS_API_KEY',
    defaultEndpoint: 'https://api.cerebras.ai/v1',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Cerebras API key', supportsEnvRef: true },
    ],
    embeddingModels: [],
  },
  {
    id: 'cohere',
    displayName: 'Cohere',
    type: 'cohere',
    icon: 'cohere',
    description: 'Command R+, Embed, Rerank',
    supportsEmbeddings: true,
    defaultApiKeyEnv: 'COHERE_API_KEY',
    defaultEndpoint: 'https://api.cohere.com/v2',
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '', helpText: 'Cohere API key from dashboard.cohere.com', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'embed-english-v3.0', displayName: 'Embed English v3', dimensions: 1024, maxTokens: 512 },
      { modelId: 'embed-multilingual-v3.0', displayName: 'Embed Multilingual v3', dimensions: 1024, maxTokens: 512 },
    ],
  },
  {
    id: 'custom',
    displayName: 'Custom / Local Endpoint',
    type: 'custom',
    icon: 'custom',
    description: 'Any OpenAI-compatible API endpoint',
    supportsEmbeddings: true,
    defaultApiKeyEnv: '',
    defaultEndpoint: null,
    configFields: [
      { name: 'endpoint', label: 'API Endpoint', type: 'url', required: true, placeholder: 'http://localhost:8080/v1', helpText: 'OpenAI-compatible API endpoint URL' },
      { name: 'apiKey', label: 'API Key (optional)', type: 'password', required: false, placeholder: '', helpText: 'API key if endpoint requires authentication', supportsEnvRef: true },
    ],
    embeddingModels: [
      { modelId: 'custom', displayName: 'Custom Model (user-specified)', dimensions: 0, maxTokens: 0 },
    ],
  },
];

/**
 * Get the provider catalog merged with configured status from config.
 * Returns a new array with `configured` and `status` fields added.
 */
export function getProviderCatalog(
  configuredProviders: ReadonlyMap<string, { readonly type: string; readonly endpoint?: string }>,
): readonly (ProviderCatalogEntry & { readonly configured: boolean; readonly status: string })[] {
  return PROVIDER_CATALOG.map((entry) => {
    const configured = configuredProviders.has(entry.id);
    return {
      ...entry,
      configured,
      status: configured ? 'connected' : 'not_configured',
    };
  });
}
