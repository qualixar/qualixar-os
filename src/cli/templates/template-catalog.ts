// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Template Catalog
 * LLD Section 8.4: 5 built-in project templates.
 *
 * Placeholders used in file content:
 *   {{PROJECT_NAME}}  -- replaced with the scaffold target directory name
 *   {{PROVIDER}}      -- replaced with the chosen provider id
 *   {{MODEL}}         -- replaced with the chosen primary model
 */

import type { TemplateDefinition } from '../../types/phase19.js';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const TEMPLATE_CATALOG: readonly TemplateDefinition[] = [
  // -------------------------------------------------------------------------
  // 1. Research Agent
  // -------------------------------------------------------------------------
  {
    id: 'research-agent',
    name: 'Research Agent',
    description:
      'Web search + RAG pipeline that ingests URLs/documents and produces structured reports.',
    tagline: 'Search the web. Retrieve context. Write reports.',
    files: [
      {
        path: 'config.yaml',
        overwrite: false,
        content: `# Qualixar OS config -- {{PROJECT_NAME}}
version: "2"

provider:
  primary: {{PROVIDER}}
  model: {{MODEL}}
  apiKeyEnv: ANTHROPIC_API_KEY

memory:
  enabled: true
  backend: sqlite

tools:
  - web_search
  - fetch_url
  - read_file
  - write_file
  - rag_query

channels:
  dashboard:
    enabled: true
    port: 4000

security:
  containerIsolation: false
  allowedPaths:
    - ./workspace
  deniedCommands: []
`,
      },
      {
        path: 'README.md',
        overwrite: false,
        content: `# {{PROJECT_NAME}} — Research Agent

Powered by Qualixar OS. Uses **{{PROVIDER}}** / **{{MODEL}}**.

## Quick start

\`\`\`bash
qos run --task "Research the latest advances in transformer efficiency"
\`\`\`

## Tools available
- \`web_search\` — search the web
- \`fetch_url\` — fetch a URL and extract text
- \`rag_query\` — query the local vector store
- \`read_file\` / \`write_file\` — read/write files in workspace/
`,
      },
      {
        path: 'task.md',
        overwrite: false,
        content: `# Research Task

## Objective

<!-- Describe your research goal here -->

## Sources to explore

- [ ] <!-- Add URLs or search queries -->

## Output format

Produce a structured report saved to workspace/report.md.
`,
      },
    ],
    requiredProviders: ['anthropic', 'openai', 'google'],
    tools: ['web_search', 'fetch_url', 'read_file', 'write_file', 'rag_query'],
    topology: 'chain',
    postInstructions: [
      'Add your API key to ~/.qualixar-os/.env',
      'Place source documents in ./workspace/ for RAG ingestion',
      'Run: qos run --task "Your research goal"',
    ],
  },

  // -------------------------------------------------------------------------
  // 2. Code Assistant
  // -------------------------------------------------------------------------
  {
    id: 'code-assistant',
    name: 'Code Assistant',
    description:
      'File read/write + shell execution + automated code review for software projects.',
    tagline: 'Read. Write. Review. Ship.',
    files: [
      {
        path: 'config.yaml',
        overwrite: false,
        content: `# Qualixar OS config -- {{PROJECT_NAME}}
version: "2"

provider:
  primary: {{PROVIDER}}
  model: {{MODEL}}
  apiKeyEnv: ANTHROPIC_API_KEY

memory:
  enabled: true
  backend: sqlite

tools:
  - read_file
  - write_file
  - list_directory
  - execute_command
  - code_review

channels:
  dashboard:
    enabled: true
    port: 4000

security:
  containerIsolation: true
  allowedPaths:
    - ./
  deniedCommands:
    - rm -rf
    - sudo
`,
      },
      {
        path: 'README.md',
        overwrite: false,
        content: `# {{PROJECT_NAME}} — Code Assistant

Powered by Qualixar OS. Uses **{{PROVIDER}}** / **{{MODEL}}**.

## Quick start

\`\`\`bash
qos run --task "Add unit tests for src/utils.ts"
\`\`\`

## Tools available
- \`read_file\` / \`write_file\` / \`list_directory\` — file system access
- \`execute_command\` — run shell commands (sandboxed)
- \`code_review\` — automated review of changed files
`,
      },
    ],
    requiredProviders: ['anthropic', 'openai'],
    tools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'code_review'],
    topology: 'chain',
    postInstructions: [
      'Add your API key to ~/.qualixar-os/.env',
      'Point Qualixar OS at your project directory with --workspace ./your-project',
      'Run: qos run --task "Describe the coding task"',
    ],
  },

  // -------------------------------------------------------------------------
  // 3. Customer Support
  // -------------------------------------------------------------------------
  {
    id: 'customer-support',
    name: 'Customer Support',
    description:
      'Multi-channel support agent with knowledge base look-up and escalation routing.',
    tagline: 'Resolve tickets. Route escalations. Delight customers.',
    files: [
      {
        path: 'config.yaml',
        overwrite: false,
        content: `# Qualixar OS config -- {{PROJECT_NAME}}
version: "2"

provider:
  primary: {{PROVIDER}}
  model: {{MODEL}}
  apiKeyEnv: ANTHROPIC_API_KEY

memory:
  enabled: true
  backend: sqlite

tools:
  - rag_query
  - write_file
  - send_message

channels:
  http:
    enabled: true
    port: 3000
  dashboard:
    enabled: true
    port: 4000

security:
  containerIsolation: false
  allowedPaths:
    - ./knowledge-base
  deniedCommands: []
`,
      },
      {
        path: 'README.md',
        overwrite: false,
        content: `# {{PROJECT_NAME}} — Customer Support Agent

Powered by Qualixar OS. Uses **{{PROVIDER}}** / **{{MODEL}}**.

## Quick start

1. Add your knowledge base documents to ./knowledge-base/
2. Run: \`qos start\`
3. POST tickets to http://localhost:3000/message

## Knowledge base
Drop Markdown or plain-text files in ./knowledge-base/.
The agent will index them automatically on startup.
`,
      },
    ],
    requiredProviders: ['anthropic', 'openai', 'google'],
    tools: ['rag_query', 'write_file', 'send_message'],
    topology: 'router',
    postInstructions: [
      'Add your API key to ~/.qualixar-os/.env',
      'Populate ./knowledge-base/ with your product docs',
      'Run: qos start  to launch the HTTP channel',
    ],
  },

  // -------------------------------------------------------------------------
  // 4. Data Pipeline
  // -------------------------------------------------------------------------
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    description:
      'Ingest CSV/JSON data, transform with code execution, analyze with LLM, export results.',
    tagline: 'Ingest. Transform. Analyse. Export.',
    files: [
      {
        path: 'config.yaml',
        overwrite: false,
        content: `# Qualixar OS config -- {{PROJECT_NAME}}
version: "2"

provider:
  primary: {{PROVIDER}}
  model: {{MODEL}}
  apiKeyEnv: ANTHROPIC_API_KEY

memory:
  enabled: true
  backend: sqlite

tools:
  - read_file
  - write_file
  - execute_command
  - list_directory

channels:
  dashboard:
    enabled: true
    port: 4000

security:
  containerIsolation: true
  allowedPaths:
    - ./data
    - ./output
  deniedCommands:
    - rm -rf
`,
      },
      {
        path: 'README.md',
        overwrite: false,
        content: `# {{PROJECT_NAME}} — Data Pipeline

Powered by Qualixar OS. Uses **{{PROVIDER}}** / **{{MODEL}}**.

## Quick start

\`\`\`bash
# Place input files in ./data/
qos run --task "Summarise and analyse data/sales-q1.csv"
\`\`\`

## Directory layout
- \`data/\`   — input files (CSV, JSON, NDJSON)
- \`output/\` — transformed & exported results
`,
      },
    ],
    requiredProviders: ['anthropic', 'openai', 'google'],
    tools: ['read_file', 'write_file', 'execute_command', 'list_directory'],
    topology: 'chain',
    postInstructions: [
      'Add your API key to ~/.qualixar-os/.env',
      'Place input files in ./data/',
      'Run: qos run --task "Describe the transformation you need"',
    ],
  },

  // -------------------------------------------------------------------------
  // 5. Blank
  // -------------------------------------------------------------------------
  {
    id: 'blank',
    name: 'Blank',
    description: 'Minimal Qualixar OS configuration. Start from scratch.',
    tagline: 'Your canvas. Your rules.',
    files: [
      {
        path: 'config.yaml',
        overwrite: false,
        content: `# Qualixar OS config -- {{PROJECT_NAME}}
version: "2"

provider:
  primary: {{PROVIDER}}
  model: {{MODEL}}
  apiKeyEnv: ANTHROPIC_API_KEY

memory:
  enabled: false

tools: []

channels:
  dashboard:
    enabled: true
    port: 4000

security:
  containerIsolation: false
  allowedPaths: []
  deniedCommands: []
`,
      },
      {
        path: 'README.md',
        overwrite: false,
        content: `# {{PROJECT_NAME}}

Powered by Qualixar OS. Uses **{{PROVIDER}}** / **{{MODEL}}**.

Edit \`config.yaml\` to configure tools, channels, and security settings.

## Docs

https://github.com/qualixar/qualixar-os
`,
      },
    ],
    requiredProviders: [],
    tools: [],
    topology: null,
    postInstructions: [
      'Add your API key to ~/.qualixar-os/.env',
      'Edit config.yaml to add the tools and channels you need',
      'Run: qos run --task "Your first task"',
    ],
  },
] as const;
