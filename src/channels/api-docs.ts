// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- OpenAPI / Swagger Documentation
 *
 * H-05: Provides OpenAPI 3.1 spec and Swagger UI for the HTTP API.
 * Registers GET /api/docs (JSON spec) and GET /api/docs/ui (Swagger UI).
 *
 * Hard Rules:
 *   - Import .js extensions
 *   - readonly interfaces
 *   - No external Swagger dependencies (inline HTML with CDN)
 */

import type { Hono } from 'hono';
import { VERSION } from '../version.js';

// ================================================================
// OpenAPI Spec
// ================================================================

/**
 * Build the OpenAPI 3.1 specification object for Qualixar OS HTTP API.
 * Returns an immutable spec describing all key endpoints.
 */
export function buildOpenApiSpec(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    openapi: '3.1.0',
    info: {
      title: 'Qualixar OS API',
      version: VERSION,
      description: 'Qualixar OS: The Universal Agent Orchestration Layer. Exposes task management, chat, agent registry, cost tracking, model routing, connectors, datasets, vectors, blueprints, and prompts.',
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [{ url: '/', description: 'Current server' }],
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          operationId: 'healthCheck',
          tags: ['System'],
          responses: { '200': { description: 'Server is healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, version: { type: 'string' } } } } } } },
        },
      },
      '/api/tasks': {
        post: {
          summary: 'Create and run a task',
          operationId: 'createTask',
          tags: ['Tasks'],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' }, type: { type: 'string', enum: ['code', 'research', 'analysis', 'creative', 'custom'] }, mode: { type: 'string', enum: ['companion', 'power'] }, budget_usd: { type: 'number' }, topology: { type: 'string' }, simulate: { type: 'boolean' } } } } } },
          responses: { '200': { description: 'Task result' }, '400': { description: 'Invalid input' } },
        },
        get: {
          summary: 'List tasks',
          operationId: 'listTasks',
          tags: ['Tasks'],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of tasks' } },
        },
      },
      '/api/tasks/{taskId}': {
        get: {
          summary: 'Get task status',
          operationId: 'getTaskStatus',
          tags: ['Tasks'],
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Task status' }, '404': { description: 'Task not found' } },
        },
      },
      '/api/tasks/{taskId}/pause': {
        post: {
          summary: 'Pause a task',
          operationId: 'pauseTask',
          tags: ['Tasks'],
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Task paused' } },
        },
      },
      '/api/tasks/{taskId}/resume': {
        post: {
          summary: 'Resume a task',
          operationId: 'resumeTask',
          tags: ['Tasks'],
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Task resumed' } },
        },
      },
      '/api/tasks/{taskId}/cancel': {
        post: {
          summary: 'Cancel a task',
          operationId: 'cancelTask',
          tags: ['Tasks'],
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Task cancelled' } },
        },
      },
      '/api/chat/conversations': {
        get: {
          summary: 'List chat conversations',
          operationId: 'listConversations',
          tags: ['Chat'],
          responses: { '200': { description: 'List of conversations' } },
        },
        post: {
          summary: 'Create a conversation',
          operationId: 'createConversation',
          tags: ['Chat'],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, model: { type: 'string' } } } } } },
          responses: { '200': { description: 'Conversation created' } },
        },
      },
      '/api/chat/conversations/{conversationId}/messages': {
        post: {
          summary: 'Send a chat message (streamed via SSE)',
          operationId: 'sendChatMessage',
          tags: ['Chat'],
          parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, model: { type: 'string' } } } } } },
          responses: { '200': { description: 'Message sent, tokens streamed via SSE' } },
        },
      },
      '/api/agents': {
        get: {
          summary: 'List registered agents',
          operationId: 'listAgents',
          tags: ['Agents'],
          responses: { '200': { description: 'List of agents' } },
        },
      },
      '/api/cost': {
        get: {
          summary: 'Get cost summary',
          operationId: 'getCostSummary',
          tags: ['Cost'],
          parameters: [{ name: 'taskId', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Cost summary' } },
        },
      },
      '/api/models': {
        get: {
          summary: 'List available models',
          operationId: 'listModels',
          tags: ['Models'],
          responses: { '200': { description: 'List of models with pricing' } },
        },
      },
      '/api/connectors': {
        get: {
          summary: 'List connectors',
          operationId: 'listConnectors',
          tags: ['Connectors'],
          responses: { '200': { description: 'List of configured connectors' } },
        },
      },
      '/api/connectors/{id}/test': {
        post: {
          summary: 'Test a connector',
          operationId: 'testConnector',
          tags: ['Connectors'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Connector test result' } },
        },
      },
      '/api/datasets': {
        get: {
          summary: 'List datasets',
          operationId: 'listDatasets',
          tags: ['Datasets'],
          responses: { '200': { description: 'List of datasets' } },
        },
      },
      '/api/datasets/{id}/preview': {
        get: {
          summary: 'Preview dataset rows',
          operationId: 'previewDataset',
          tags: ['Datasets'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Dataset preview' } },
        },
      },
      '/api/vectors/search': {
        post: {
          summary: 'Search vector store',
          operationId: 'searchVectors',
          tags: ['Vectors'],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', default: 10 }, threshold: { type: 'number' } } } } } },
          responses: { '200': { description: 'Search results' } },
        },
      },
      '/api/blueprints': {
        get: {
          summary: 'List blueprints',
          operationId: 'listBlueprints',
          tags: ['Blueprints'],
          responses: { '200': { description: 'List of blueprints' } },
        },
      },
      '/api/blueprints/{id}/deploy': {
        post: {
          summary: 'Deploy a blueprint',
          operationId: 'deployBlueprint',
          tags: ['Blueprints'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Blueprint deployed' } },
        },
      },
      '/api/prompts': {
        get: {
          summary: 'List prompt templates',
          operationId: 'listPrompts',
          tags: ['Prompts'],
          responses: { '200': { description: 'List of prompt templates' } },
        },
        post: {
          summary: 'Create a prompt template',
          operationId: 'createPrompt',
          tags: ['Prompts'],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'template'], properties: { name: { type: 'string' }, template: { type: 'string' }, description: { type: 'string' }, variables: { type: 'array', items: { type: 'string' } } } } } } },
          responses: { '200': { description: 'Prompt created' } },
        },
      },
      '/api/config': {
        get: {
          summary: 'Get system configuration',
          operationId: 'getConfig',
          tags: ['System'],
          responses: { '200': { description: 'Current configuration' } },
        },
      },
      '/api/docs': {
        get: {
          summary: 'OpenAPI specification (JSON)',
          operationId: 'getOpenApiSpec',
          tags: ['Documentation'],
          responses: { '200': { description: 'OpenAPI 3.1 spec' } },
        },
      },
      '/api/docs/ui': {
        get: {
          summary: 'Swagger UI',
          operationId: 'getSwaggerUi',
          tags: ['Documentation'],
          responses: { '200': { description: 'Swagger UI HTML page' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Bearer token authentication (set QOS_API_TOKEN)',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'System', description: 'Health checks and configuration' },
      { name: 'Tasks', description: 'Task lifecycle management' },
      { name: 'Chat', description: 'Conversational AI interface' },
      { name: 'Agents', description: 'Agent registry' },
      { name: 'Cost', description: 'Cost tracking and budgets' },
      { name: 'Models', description: 'LLM model catalog' },
      { name: 'Connectors', description: 'External service connectors' },
      { name: 'Datasets', description: 'Dataset management' },
      { name: 'Vectors', description: 'Vector search' },
      { name: 'Blueprints', description: 'Agent blueprints' },
      { name: 'Prompts', description: 'Prompt templates' },
      { name: 'Documentation', description: 'API documentation' },
    ],
  });
}

// ================================================================
// Swagger UI HTML
// ================================================================

/**
 * Generate a self-contained Swagger UI HTML page that loads the
 * OpenAPI spec from /api/docs. Uses swagger-ui CDN (no npm dep).
 */
export function buildSwaggerUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Qualixar OS API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background: #0d1117; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { max-width: 1200px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
}

// ================================================================
// Route Registration
// ================================================================

/**
 * Register OpenAPI documentation routes on a Hono app.
 *
 * GET /api/docs    → JSON OpenAPI spec
 * GET /api/docs/ui → Swagger UI HTML
 */
export function registerApiDocs(app: Hono): void {
  const spec = buildOpenApiSpec();
  const uiHtml = buildSwaggerUiHtml();

  app.get('/api/docs', (c) => c.json(spec));

  app.get('/api/docs/ui', (c) => {
    return c.html(uiHtml);
  });
}
