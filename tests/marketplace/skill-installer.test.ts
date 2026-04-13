/**
 * Tests for Qualixar OS Phase 3: Skill Installer Bridge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSkillInstaller } from '../../src/marketplace/skill-installer.js';
import { createToolRegistry } from '../../src/tools/tool-registry.js';
import type { EventBus } from '../../src/events/event-bus.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { SkillManifest } from '../../src/marketplace/skill-package.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
    removeAllListeners: vi.fn(),
  } as unknown as EventBus;
}

function mockDb(): QosDatabase {
  const rows: Record<string, unknown>[] = [];
  return {
    db: {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn((...args: unknown[]) => {
          rows.push({ args });
        }),
        get: vi.fn(),
      }),
    },
    query: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    insert: vi.fn(),
    update: vi.fn(),
  } as unknown as QosDatabase;
}

function validManifest(): SkillManifest {
  return {
    name: '@test/skill-github',
    version: '1.0.0',
    description: 'GitHub PR tools',
    author: { name: 'Test' },
    license: 'MIT',
    category: 'code-dev',
    tags: ['github'],
    screenshots: [],
    pricing: { model: 'free' },
    tools: [
      { name: 'create_pr', description: 'Create a pull request', inputSchema: { type: 'object' } },
      { name: 'review_pr', description: 'Review a pull request', inputSchema: { type: 'object' } },
    ],
    transport: { type: 'stdio', command: 'node', args: ['./dist/index.js'] },
    compatibility: { qos: '>=2.0.0', node: '>=20.0.0' },
    dependencies: {},
  } as SkillManifest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SkillInstaller', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = mockDb();
    eventBus = mockEventBus();
  });

  describe('install', () => {
    it('should register tools in ToolRegistry', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      const result = installer.install(validManifest());

      expect(result.name).toBe('@test/skill-github');
      expect(result.toolCount).toBe(2);
      expect(result.toolNames).toContain('@test/skill-github/create_pr');
      expect(result.toolNames).toContain('@test/skill-github/review_pr');

      // Tools should be in registry
      expect(registry.get('@test/skill-github/create_pr')).toBeDefined();
      expect(registry.get('@test/skill-github/review_pr')).toBeDefined();

      // Tools should have correct category
      const tool = registry.get('@test/skill-github/create_pr')!;
      expect(tool.category).toBe('code-dev');
      expect(tool.source).toBe('skill');
    });

    it('should persist to DB', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      installer.install(validManifest());

      expect(db.db.prepare).toHaveBeenCalled();
    });

    it('should emit skill:installed event', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      installer.install(validManifest());

      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skill:installed',
          payload: expect.objectContaining({ name: '@test/skill-github' }),
        }),
      );
    });

    it('should make tools visible to Forge via getCatalogSummary', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      installer.install(validManifest());

      const catalog = registry.getCatalogSummary();
      const skillTools = catalog.filter((t) => t.name.includes('skill-github'));
      expect(skillTools).toHaveLength(2);
    });

    it('should make tools visible via listByCategory', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      installer.install(validManifest());

      const codeDevTools = registry.listByCategory('code-dev');
      const skillTools = codeDevTools.filter((t) => t.name.includes('skill-github'));
      expect(skillTools).toHaveLength(2);
    });
  });

  describe('uninstall', () => {
    it('should remove tools from ToolRegistry', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      // Install first
      const { id } = installer.install(validManifest());
      expect(registry.get('@test/skill-github/create_pr')).toBeDefined();

      // Mock DB get to return the skill
      (db.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        id,
        name: '@test/skill-github',
        manifest: JSON.stringify(validManifest()),
      });

      // Uninstall
      const result = installer.uninstall(id);
      expect(result.removed).toBe(true);
      expect(result.toolsRemoved).toBeGreaterThanOrEqual(0);
    });

    it('should return removed=false for unknown skill', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      const result = installer.uninstall('nonexistent-id');
      expect(result.removed).toBe(false);
    });
  });

  describe('deleteSkill', () => {
    it('should hard delete from DB', () => {
      const registry = createToolRegistry();
      const installer = createSkillInstaller(db, registry, eventBus);

      const { id } = installer.install(validManifest());

      // Mock DB get for uninstall step
      (db.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        id,
        name: '@test/skill-github',
        manifest: JSON.stringify(validManifest()),
      });

      const result = installer.deleteSkill(id);
      expect(result.deleted).toBe(true);

      // Verify DELETE was called
      expect(db.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM skill_packages'),
      );
    });
  });
});
