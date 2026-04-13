/**
 * Qualixar OS V2 -- API Docs Tests
 *
 * H-05: Tests for OpenAPI spec and Swagger UI generation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildOpenApiSpec,
  buildSwaggerUiHtml,
  registerApiDocs,
} from '../../src/channels/api-docs.js';

describe('API Docs', () => {
  describe('buildOpenApiSpec', () => {
    it('returns a valid OpenAPI 3.1 spec', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      expect(spec.openapi).toBe('3.1.0');
    });

    it('has info with title and version', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      const info = spec.info as Record<string, unknown>;
      expect(info.title).toBe('Qualixar OS API');
      expect(typeof info.version).toBe('string');
      expect(info.version).toBeTruthy();
    });

    it('has paths defined', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      const paths = spec.paths as Record<string, unknown>;
      expect(paths['/api/health']).toBeDefined();
      expect(paths['/api/tasks']).toBeDefined();
      expect(paths['/api/chat/conversations']).toBeDefined();
      expect(paths['/api/agents']).toBeDefined();
      expect(paths['/api/cost']).toBeDefined();
      expect(paths['/api/models']).toBeDefined();
      expect(paths['/api/docs']).toBeDefined();
      expect(paths['/api/docs/ui']).toBeDefined();
    });

    it('has connectors, datasets, vectors, blueprints, prompts paths', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      const paths = spec.paths as Record<string, unknown>;
      expect(paths['/api/connectors']).toBeDefined();
      expect(paths['/api/datasets']).toBeDefined();
      expect(paths['/api/vectors/search']).toBeDefined();
      expect(paths['/api/blueprints']).toBeDefined();
      expect(paths['/api/prompts']).toBeDefined();
    });

    it('has security schemes', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      const components = spec.components as Record<string, unknown>;
      const securitySchemes = components.securitySchemes as Record<string, unknown>;
      expect(securitySchemes.bearerAuth).toBeDefined();
    });

    it('has tags', () => {
      const spec = buildOpenApiSpec() as Record<string, unknown>;
      const tags = spec.tags as Array<{ name: string }>;
      expect(tags.length).toBeGreaterThanOrEqual(10);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('System');
      expect(tagNames).toContain('Tasks');
      expect(tagNames).toContain('Chat');
      expect(tagNames).toContain('Agents');
      expect(tagNames).toContain('Documentation');
    });

    it('spec is frozen (immutable)', () => {
      const spec = buildOpenApiSpec();
      expect(Object.isFrozen(spec)).toBe(true);
    });
  });

  describe('buildSwaggerUiHtml', () => {
    it('returns HTML string', () => {
      const html = buildSwaggerUiHtml();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('swagger-ui');
    });

    it('includes CDN link for swagger-ui-dist', () => {
      const html = buildSwaggerUiHtml();
      expect(html).toContain('unpkg.com/swagger-ui-dist');
    });

    it('references /api/docs for spec URL', () => {
      const html = buildSwaggerUiHtml();
      expect(html).toContain("url: '/api/docs'");
    });

    it('includes Qualixar OS title', () => {
      const html = buildSwaggerUiHtml();
      expect(html).toContain('Qualixar OS API Documentation');
    });
  });

  describe('registerApiDocs', () => {
    it('registers two routes on the Hono app', () => {
      const routes: Array<{ method: string; path: string }> = [];
      const mockApp = {
        get: vi.fn((path: string, _handler: unknown) => {
          routes.push({ method: 'GET', path });
        }),
      };

      registerApiDocs(mockApp as never);

      expect(mockApp.get).toHaveBeenCalledTimes(2);
      expect(routes).toContainEqual({ method: 'GET', path: '/api/docs' });
      expect(routes).toContainEqual({ method: 'GET', path: '/api/docs/ui' });
    });
  });
});
