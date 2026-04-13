import { describe, it, expect, beforeEach } from 'vitest';
import { createTeamDesignStore, type TeamDesignStore } from '../../src/agents/team-design.js';
import { createTestDb } from './test-helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { TeamDesign } from '../../src/types/common.js';

function makeDesign(overrides?: Partial<TeamDesign>): TeamDesign {
  return {
    id: 'design-1',
    taskType: 'code',
    topology: 'sequential',
    agents: [
      { role: 'coder', model: 'claude-sonnet-4-6', systemPrompt: 'Write code.' },
      { role: 'reviewer', model: 'claude-sonnet-4-6', systemPrompt: 'Review code.' },
    ],
    reasoning: 'Test design',
    estimatedCostUsd: 0.06,
    version: 1,
    ...overrides,
  };
}

describe('TeamDesignStore', () => {
  let db: QosDatabase;
  let store: TeamDesignStore;

  beforeEach(() => {
    db = createTestDb();
    store = createTeamDesignStore(db);
  });

  describe('save()', () => {
    it('should persist a design to DB', () => {
      const design = makeDesign();
      store.save(design);

      const row = db.get<{ id: string }>('SELECT id FROM team_designs WHERE id = ?', [design.id]);
      expect(row).toBeDefined();
    });

    it('should upsert on duplicate id', () => {
      const design = makeDesign();
      store.save(design);
      store.save({ ...design, topology: 'parallel' });

      const retrieved = store.getById(design.id);
      expect(retrieved!.topology).toBe('parallel');
    });
  });

  describe('getById()', () => {
    it('should return undefined for non-existent design', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });

    it('should return saved design with parsed agents', () => {
      const design = makeDesign();
      store.save(design);

      const retrieved = store.getById(design.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.topology).toBe('sequential');
      expect(retrieved!.agents).toHaveLength(2);
      expect(retrieved!.agents[0].role).toBe('coder');
    });
  });

  describe('getByTaskType()', () => {
    it('should return designs for specific task type', () => {
      store.save(makeDesign({ id: 'd1', taskType: 'code' }));
      store.save(makeDesign({ id: 'd2', taskType: 'research' }));
      store.save(makeDesign({ id: 'd3', taskType: 'code' }));

      const codeDesigns = store.getByTaskType('code');
      expect(codeDesigns).toHaveLength(2);
    });

    it('should return empty array for unknown task type', () => {
      expect(store.getByTaskType('unknown')).toHaveLength(0);
    });
  });

  describe('getBestForTaskType()', () => {
    it('should return best scoring design above threshold', () => {
      store.save(makeDesign({ id: 'd1', taskType: 'code' }));
      store.updatePerformance('d1', 0.8, 0.05);

      const best = store.getBestForTaskType('code', 0.7);
      expect(best).toBeDefined();
      expect(best!.id).toBe('d1');
    });

    it('should return undefined when no design meets threshold', () => {
      store.save(makeDesign({ id: 'd1', taskType: 'code' }));
      store.updatePerformance('d1', 0.3, 0.05);

      expect(store.getBestForTaskType('code', 0.7)).toBeUndefined();
    });

    it('should return undefined for unknown task type', () => {
      expect(store.getBestForTaskType('unknown', 0.5)).toBeUndefined();
    });
  });

  describe('updatePerformance()', () => {
    it('should set initial score and cost', () => {
      store.save(makeDesign({ id: 'd1' }));
      store.updatePerformance('d1', 0.9, 0.05);

      const row = db.get<{ performance_score: number; use_count: number }>(
        'SELECT performance_score, use_count FROM team_designs WHERE id = ?',
        ['d1'],
      );
      expect(row!.performance_score).toBeCloseTo(0.9);
      expect(row!.use_count).toBe(1);
    });

    it('should compute running average on subsequent updates', () => {
      store.save(makeDesign({ id: 'd1' }));
      store.updatePerformance('d1', 0.8, 0.04);
      store.updatePerformance('d1', 1.0, 0.06);

      const row = db.get<{ performance_score: number; use_count: number }>(
        'SELECT performance_score, use_count FROM team_designs WHERE id = ?',
        ['d1'],
      );
      expect(row!.use_count).toBe(2);
      expect(row!.performance_score).toBeCloseTo(0.9, 1);
    });
  });

  describe('listAll()', () => {
    it('should return all designs ordered by updated_at DESC', () => {
      store.save(makeDesign({ id: 'd1' }));
      store.save(makeDesign({ id: 'd2' }));

      const all = store.listAll();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no designs', () => {
      expect(store.listAll()).toHaveLength(0);
    });
  });

  describe('deleteDesign()', () => {
    it('should remove design from DB', () => {
      store.save(makeDesign({ id: 'd1' }));
      store.deleteDesign('d1');
      expect(store.getById('d1')).toBeUndefined();
    });

    it('should not throw for non-existent design', () => {
      expect(() => store.deleteDesign('nonexistent')).not.toThrow();
    });
  });
});
