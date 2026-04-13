/**
 * Tests for Qualixar OS Phase 3: Unified Skill Store
 */

import { describe, it, expect } from 'vitest';
import { createSkillStore } from '../../src/marketplace/skill-store.js';

describe('SkillStore', () => {
  describe('built-in catalog', () => {
    it('should load all 18 built-in plugins', () => {
      const store = createSkillStore();
      expect(store.count()).toBe(18);
    });

    it('should return all as installed', () => {
      const store = createSkillStore();
      const installed = store.getInstalled();
      expect(installed.length).toBe(18);
      for (const entry of installed) {
        expect(entry.installed).toBe(true);
        expect(entry.tier).toBe('builtin');
      }
    });

    it('should have correct types for agent plugins', () => {
      const store = createSkillStore();
      const webResearcher = store.get('builtin:web-researcher');
      expect(webResearcher).toBeDefined();
      expect(webResearcher!.types).toContain('agent');
      expect(webResearcher!.toolNames).toContain('web_search');
    });

    it('should have correct types for skill plugins', () => {
      const store = createSkillStore();
      const summarize = store.get('builtin:summarize');
      expect(summarize).toBeDefined();
      expect(summarize!.types).toContain('skill');
    });

    it('should have correct types for topology plugins', () => {
      const store = createSkillStore();
      const sequential = store.get('builtin:topology-sequential');
      expect(sequential).toBeDefined();
      expect(sequential!.types).toContain('topology');
    });
  });

  describe('search', () => {
    it('should search by name', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'web-researcher' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('web-researcher');
    });

    it('should search by description', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'customer queries' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.name === 'customer-support')).toBe(true);
    });

    it('should search by tag', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'translation' });
      expect(results.some((r) => r.name === 'translate')).toBe(true);
    });

    it('should search by tool name', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'web_crawl' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for no match', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'xyznonexistent' });
      expect(results).toHaveLength(0);
    });

    it('should filter by type', () => {
      const store = createSkillStore();
      const agents = store.search({ type: 'agent' });
      expect(agents.length).toBe(4);
      for (const a of agents) {
        expect(a.types).toContain('agent');
      }
    });

    it('should filter by installed only', () => {
      const store = createSkillStore();
      const installed = store.search({ installedOnly: true });
      expect(installed.length).toBe(18);
    });

    it('should combine query + type filter', () => {
      const store = createSkillStore();
      const results = store.search({ query: 'code', type: 'skill' });
      expect(results.some((r) => r.name === 'code-review')).toBe(true);
      for (const r of results) {
        expect(r.types).toContain('skill');
      }
    });

    it('should sort by name', () => {
      const store = createSkillStore();
      const results = store.search({ sort: 'name' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].name >= results[i - 1].name).toBe(true);
      }
    });

    it('should sort by toolCount', () => {
      const store = createSkillStore();
      const results = store.search({ sort: 'toolCount' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].toolCount <= results[i - 1].toolCount).toBe(true);
      }
    });
  });

  describe('get', () => {
    it('should get by exact id', () => {
      const store = createSkillStore();
      const entry = store.get('builtin:code-assistant');
      expect(entry).toBeDefined();
      expect(entry!.name).toBe('code-assistant');
    });

    it('should return undefined for missing id', () => {
      const store = createSkillStore();
      expect(store.get('nonexistent')).toBeUndefined();
    });
  });
});
