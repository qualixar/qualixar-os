/**
 * Qualixar OS Phase 19 -- Template Catalog Tests
 * Tests for TEMPLATE_CATALOG structure and content.
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATE_CATALOG } from '../../../src/cli/templates/template-catalog.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TEMPLATE_CATALOG', () => {
  it('has exactly 5 templates', () => {
    expect(TEMPLATE_CATALOG.length).toBe(5);
  });

  it('each template has a unique ID', () => {
    const ids = TEMPLATE_CATALOG.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('each template has a non-empty files array', () => {
    for (const template of TEMPLATE_CATALOG) {
      expect(
        template.files.length,
        `Template '${template.id}' must have at least one file`,
      ).toBeGreaterThan(0);
    }
  });

  it('template file content contains {{PROJECT_NAME}} placeholder', () => {
    for (const template of TEMPLATE_CATALOG) {
      const hasPlaceholder = template.files.some((f) =>
        f.content.includes('{{PROJECT_NAME}}'),
      );
      expect(
        hasPlaceholder,
        `Template '${template.id}' must have at least one file with {{PROJECT_NAME}}`,
      ).toBe(true);
    }
  });

  it("research-agent template has the correct tools array", () => {
    const template = TEMPLATE_CATALOG.find((t) => t.id === 'research-agent');
    expect(template).toBeDefined();

    const tools = template!.tools;
    expect(tools).toContain('web_search');
    expect(tools).toContain('fetch_url');
    expect(tools).toContain('read_file');
    expect(tools).toContain('write_file');
    expect(tools).toContain('rag_query');
  });
});
