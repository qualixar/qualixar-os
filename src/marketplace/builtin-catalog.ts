// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Built-in Plugin Catalog
 *
 * 18 built-in plugin manifests covering agents, skills, tools, and topologies.
 * HR-9: At least 10 entries (we ship 18).
 * HR-1: All interfaces are readonly + immutable.
 */

import type { PluginManifest } from '../types/phase20.js';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const QUALIXAR_AUTHOR = 'qualixar';
const MIT_LICENSE = 'MIT';
const MIN_VERSION = '2.0.0';
const BUILTIN_VERSION = '1.0.0';
const SONNET_MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Agent plugins (4)
// ---------------------------------------------------------------------------

const WEB_RESEARCHER: PluginManifest = {
  name: 'web-researcher',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'An agent that searches the web, crawls pages, and synthesises research findings into structured summaries.',
  license: MIT_LICENSE,
  tags: ['research', 'web', 'search'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [
      {
        name: 'web-researcher',
        description: 'Searches the web and synthesises information from multiple sources.',
        model: SONNET_MODEL,
        tools: ['web_search', 'web_crawl'],
        systemPrompt:
          'You are a professional research agent. Given a research question, search the web for relevant sources, read the most promising pages, and produce a structured summary with cited evidence. Always prefer primary sources. Cite URLs inline.',
        role: 'researcher',
      },
    ],
    skills: [],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: ['web_search', 'web_crawl'], plugins: [] },
  config: {},
};

const CODE_ASSISTANT: PluginManifest = {
  name: 'code-assistant',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'An agent that reads files, writes code, runs shell commands, and reviews diffs to complete engineering tasks.',
  license: MIT_LICENSE,
  tags: ['code', 'engineering', 'developer'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [
      {
        name: 'code-assistant',
        description: 'Reads, writes, and reviews code. Executes shell commands for build/test tasks.',
        model: SONNET_MODEL,
        tools: ['file_read', 'file_write', 'shell_exec'],
        systemPrompt:
          'You are a senior software engineer. You read existing code carefully before making changes. You write clean, well-typed TypeScript/Python code following existing conventions. You run tests after every change and fix failures before declaring success.',
        role: 'engineer',
      },
    ],
    skills: [],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: ['file_read', 'file_write', 'shell_exec'], plugins: [] },
  config: {},
};

const DATA_ANALYST: PluginManifest = {
  name: 'data-analyst',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'An agent that reads data files, runs analyses, and produces reports with findings and visualisation recommendations.',
  license: MIT_LICENSE,
  tags: ['data', 'analysis', 'reporting'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [
      {
        name: 'data-analyst',
        description: 'Analyses structured data and produces reports with key insights.',
        model: SONNET_MODEL,
        tools: ['file_read', 'shell_exec'],
        systemPrompt:
          'You are a professional data analyst. Read input files, perform statistical summaries, identify trends and anomalies, and output a well-structured report. Suggest chart types for each finding. State assumptions clearly.',
        role: 'analyst',
      },
    ],
    skills: [],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: ['file_read', 'shell_exec'], plugins: [] },
  config: {},
};

const CUSTOMER_SUPPORT: PluginManifest = {
  name: 'customer-support',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'An agent that handles customer queries, drafts empathetic responses, and escalates unresolved issues.',
  license: MIT_LICENSE,
  tags: ['support', 'customer-service', 'helpdesk'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [
      {
        name: 'customer-support',
        description: 'Answers customer questions politely and escalates complex issues.',
        model: SONNET_MODEL,
        tools: ['web_search'],
        systemPrompt:
          'You are a helpful customer support specialist. Read the customer message carefully, acknowledge their concern, and provide a clear and empathetic response. Search the knowledge base when needed. If the issue is beyond your authority, escalate with full context.',
        role: 'support',
      },
    ],
    skills: [],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: ['web_search'], plugins: [] },
  config: {},
};

// ---------------------------------------------------------------------------
// Skill plugins (4)
// ---------------------------------------------------------------------------

const SUMMARIZE: PluginManifest = {
  name: 'summarize',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Condenses long text into a clear, concise summary at a configurable detail level.',
  license: MIT_LICENSE,
  tags: ['text', 'summarization', 'productivity'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [
      {
        name: 'summarize',
        description: 'Summarise the provided text at the requested detail level.',
        promptTemplate:
          'Summarise the following text in {{style}} style, targeting roughly {{max_words}} words. Preserve the key points and any critical numbers or names.\n\nText:\n{{text}}',
        parameters: [
          { name: 'text', type: 'string', required: true, default: null, description: 'The text to summarise.' },
          { name: 'style', type: 'string', required: false, default: 'concise', description: 'Summary style: concise, detailed, or bullet-points.' },
          { name: 'max_words', type: 'number', required: false, default: 150, description: 'Target word count for the summary.' },
        ],
      },
    ],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TRANSLATE: PluginManifest = {
  name: 'translate',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Translates text from a source language into the specified target language.',
  license: MIT_LICENSE,
  tags: ['text', 'translation', 'i18n'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [
      {
        name: 'translate',
        description: 'Translate text into the target language.',
        promptTemplate:
          'Translate the following text from {{source_language}} to {{target_language}}. Preserve formatting, tone, and meaning as closely as possible.\n\nText:\n{{text}}',
        parameters: [
          { name: 'text', type: 'string', required: true, default: null, description: 'The text to translate.' },
          { name: 'target_language', type: 'string', required: true, default: null, description: 'Target language name or ISO code (e.g. "French", "fr").' },
          { name: 'source_language', type: 'string', required: false, default: 'auto-detect', description: 'Source language name or ISO code. Defaults to auto-detect.' },
        ],
      },
    ],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const CODE_REVIEW: PluginManifest = {
  name: 'code-review',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Reviews a code snippet or diff for correctness, style, security issues, and improvement opportunities.',
  license: MIT_LICENSE,
  tags: ['code', 'review', 'quality'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [
      {
        name: 'code-review',
        description: 'Review code for correctness, style, and security.',
        promptTemplate:
          'Review the following {{language}} code. Focus on: correctness, naming clarity, edge cases, security issues, and adherence to {{style_guide}} style guide. Output findings as a numbered list grouped by severity (Critical / High / Medium / Low).\n\nCode:\n```{{language}}\n{{code}}\n```',
        parameters: [
          { name: 'code', type: 'string', required: true, default: null, description: 'The code to review.' },
          { name: 'language', type: 'string', required: true, default: null, description: 'Programming language of the code.' },
          { name: 'style_guide', type: 'string', required: false, default: 'idiomatic', description: 'Style guide to apply (e.g. Airbnb, PEP 8, idiomatic).' },
        ],
      },
    ],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const GENERATE_REPORT: PluginManifest = {
  name: 'generate-report',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Generates a structured {{format}} report from the provided data and title.',
  license: MIT_LICENSE,
  tags: ['reporting', 'documents', 'productivity'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [
      {
        name: 'generate-report',
        description: 'Generate a structured report from raw data.',
        promptTemplate:
          'Generate a {{format}} report titled "{{title}}" from the data below. Include: executive summary, key findings, supporting details, and recommended next steps.\n\nData:\n{{data}}',
        parameters: [
          { name: 'data', type: 'string', required: true, default: null, description: 'The raw data or notes to turn into a report.' },
          { name: 'title', type: 'string', required: true, default: null, description: 'Report title.' },
          { name: 'format', type: 'string', required: false, default: 'markdown', description: 'Output format: markdown, html, or plain-text.' },
        ],
      },
    ],
    tools: [],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

// ---------------------------------------------------------------------------
// Tool plugins (5) — wrappers around existing built-ins
// ---------------------------------------------------------------------------

const TOOL_WEB_SEARCH: PluginManifest = {
  name: 'tool-web-search',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Wraps the built-in web_search tool. Performs keyword or semantic web searches and returns ranked results.',
  license: MIT_LICENSE,
  tags: ['search', 'web', 'tool'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [
      {
        name: 'web_search',
        description: 'Search the web and return ranked results with titles, URLs, and snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query.' },
            max_results: { type: 'number', description: 'Maximum results to return (default 10).', default: 10 },
          },
          required: ['query'],
        },
        implementation: { type: 'builtin', handler: 'built-in' },
      },
    ],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOOL_WEB_CRAWL: PluginManifest = {
  name: 'tool-web-crawl',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Wraps the built-in web_crawl tool. Fetches and extracts the main text content from a URL.',
  license: MIT_LICENSE,
  tags: ['crawl', 'web', 'scrape', 'tool'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [
      {
        name: 'web_crawl',
        description: 'Fetch a URL and return the main text content of the page.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to crawl.' },
            timeout_ms: { type: 'number', description: 'Request timeout in milliseconds.', default: 10000 },
          },
          required: ['url'],
        },
        implementation: { type: 'builtin', handler: 'built-in' },
      },
    ],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOOL_FILE_READ: PluginManifest = {
  name: 'tool-file-read',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Wraps the built-in file_read tool. Reads a file from the local filesystem.',
  license: MIT_LICENSE,
  tags: ['file', 'read', 'io', 'tool'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [
      {
        name: 'file_read',
        description: 'Read a file from the local filesystem and return its content.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path to the file.' },
            encoding: { type: 'string', description: 'File encoding (default utf-8).', default: 'utf-8' },
          },
          required: ['path'],
        },
        implementation: { type: 'builtin', handler: 'built-in' },
      },
    ],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOOL_FILE_WRITE: PluginManifest = {
  name: 'tool-file-write',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Wraps the built-in file_write tool. Writes content to a file on the local filesystem.',
  license: MIT_LICENSE,
  tags: ['file', 'write', 'io', 'tool'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [
      {
        name: 'file_write',
        description: 'Write content to a file on the local filesystem.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path to the destination file.' },
            content: { type: 'string', description: 'Content to write.' },
            encoding: { type: 'string', description: 'File encoding (default utf-8).', default: 'utf-8' },
          },
          required: ['path', 'content'],
        },
        implementation: { type: 'builtin', handler: 'built-in' },
      },
    ],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOOL_SHELL_EXEC: PluginManifest = {
  name: 'tool-shell-exec',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Wraps the built-in shell_exec tool. Executes a shell command and returns stdout/stderr.',
  license: MIT_LICENSE,
  tags: ['shell', 'exec', 'command', 'tool'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [
      {
        name: 'shell_exec',
        description: 'Execute a shell command and return its stdout, stderr, and exit code.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute.' },
            cwd: { type: 'string', description: 'Working directory for the command.' },
            timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000).', default: 30000 },
          },
          required: ['command'],
        },
        implementation: { type: 'builtin', handler: 'built-in' },
      },
    ],
    topologies: [],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

// ---------------------------------------------------------------------------
// Topology plugins (5)
// ---------------------------------------------------------------------------

const TOPOLOGY_SEQUENTIAL: PluginManifest = {
  name: 'topology-sequential',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Sequential topology: agents execute one after another, each receiving the previous agent\'s output.',
  license: MIT_LICENSE,
  tags: ['topology', 'sequential', 'pipeline'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [],
    topologies: [
      {
        name: 'sequential',
        description: 'Runs agents in a chain — each agent\'s output feeds the next.',
        topologyType: 'sequential',
        agents: [],
        params: { ordered: true },
      },
    ],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOPOLOGY_PARALLEL: PluginManifest = {
  name: 'topology-parallel',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Parallel topology: all agents execute concurrently on the same input and results are merged.',
  license: MIT_LICENSE,
  tags: ['topology', 'parallel', 'concurrent'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [],
    topologies: [
      {
        name: 'parallel',
        description: 'Dispatches agents simultaneously and collects all outputs.',
        topologyType: 'parallel',
        agents: [],
        params: { mergeStrategy: 'concat' },
      },
    ],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOPOLOGY_DEBATE: PluginManifest = {
  name: 'topology-debate',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Debate topology: two agents argue opposing positions through multiple rounds; a judge agent reaches consensus.',
  license: MIT_LICENSE,
  tags: ['topology', 'debate', 'quality'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [],
    topologies: [
      {
        name: 'debate',
        description: 'Multi-round debate between two agents followed by a judge decision.',
        topologyType: 'debate',
        agents: ['pro', 'con', 'judge'],
        params: { rounds: 2, judgeRole: 'judge' },
      },
    ],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOPOLOGY_REVIEW_CHAIN: PluginManifest = {
  name: 'topology-review-chain',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Review-chain topology: a creator agent produces a draft; a reviewer agent critiques; creator revises until reviewer approves.',
  license: MIT_LICENSE,
  tags: ['topology', 'review', 'quality'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [],
    topologies: [
      {
        name: 'review-chain',
        description: 'Creator produces → reviewer critiques → creator revises, loop until approved.',
        topologyType: 'review-chain',
        agents: ['creator', 'reviewer'],
        params: { maxIterations: 3, approvalSignal: 'APPROVED' },
      },
    ],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

const TOPOLOGY_HIERARCHICAL: PluginManifest = {
  name: 'topology-hierarchical',
  version: BUILTIN_VERSION,
  author: QUALIXAR_AUTHOR,
  description: 'Hierarchical topology: an orchestrator agent decomposes the task and delegates sub-tasks to specialist agents.',
  license: MIT_LICENSE,
  tags: ['topology', 'hierarchical', 'orchestrator'],
  icon: null,
  homepage: null,
  repository: null,
  provides: {
    agents: [],
    skills: [],
    tools: [],
    topologies: [
      {
        name: 'hierarchical',
        description: 'Orchestrator agent plans and delegates sub-tasks to child agents.',
        topologyType: 'hierarchical',
        agents: ['orchestrator'],
        params: { maxDepth: 2, delegateOnKeyword: 'DELEGATE' },
      },
    ],
  },
  requires: { minVersion: MIN_VERSION, providers: [], tools: [], plugins: [] },
  config: {},
};

// ---------------------------------------------------------------------------
// Exported catalog (18 entries — satisfies HR-9: >= 10)
// ---------------------------------------------------------------------------

export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  // Agents (4)
  WEB_RESEARCHER,
  CODE_ASSISTANT,
  DATA_ANALYST,
  CUSTOMER_SUPPORT,
  // Skills (4)
  SUMMARIZE,
  TRANSLATE,
  CODE_REVIEW,
  GENERATE_REPORT,
  // Tools (5)
  TOOL_WEB_SEARCH,
  TOOL_WEB_CRAWL,
  TOOL_FILE_READ,
  TOOL_FILE_WRITE,
  TOOL_SHELL_EXEC,
  // Topologies (5)
  TOPOLOGY_SEQUENTIAL,
  TOPOLOGY_PARALLEL,
  TOPOLOGY_DEBATE,
  TOPOLOGY_REVIEW_CHAIN,
  TOPOLOGY_HIERARCHICAL,
] as const;
