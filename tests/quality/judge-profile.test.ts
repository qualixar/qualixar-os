/**
 * Qualixar OS Phase 3 -- Judge Profile Manager Tests
 * TDD Sequence #8: Profile loading and defaults.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createJudgeProfileManager } from '../../src/quality/judge-profile.js';
import { createDatabase } from '../../src/db/database.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';

describe('JudgeProfileManager', () => {
  let db: QosDatabase;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // Built-in profiles
  // -------------------------------------------------------------------------

  it('returns default profile with 4 criteria', () => {
    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('default');
    expect(profile.name).toBe('default');
    expect(profile.criteria).toHaveLength(4);
    expect(profile.minJudges).toBe(2);
    expect(profile.consensusAlgorithm).toBe('weighted_majority');
    expect(profile.timeoutMs).toBe(60_000);
  });

  it('returns code profile with 5 criteria', () => {
    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('code');
    expect(profile.name).toBe('code');
    expect(profile.criteria).toHaveLength(5);
    expect(profile.timeoutMs).toBe(120_000);
  });

  it('returns research profile with bft_inspired consensus', () => {
    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('research');
    expect(profile.consensusAlgorithm).toBe('bft_inspired');
    expect(profile.minJudges).toBe(3);
  });

  it('returns creative profile with raft_inspired consensus', () => {
    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('creative');
    expect(profile.consensusAlgorithm).toBe('raft_inspired');
  });

  it('returns default profile for unknown name', () => {
    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('nonexistent');
    expect(profile.name).toBe('default');
  });

  // -------------------------------------------------------------------------
  // Weight validation
  // -------------------------------------------------------------------------

  it('all built-in profiles have weights summing to 1.0', () => {
    const manager = createJudgeProfileManager(db);
    for (const name of ['default', 'code', 'research', 'creative', 'analysis']) {
      const profile = manager.getProfile(name);
      const weightSum = Object.values(profile.weights).reduce(
        (s, w) => s + w,
        0,
      );
      expect(weightSum).toBeCloseTo(1.0, 5);
    }
  });

  // -------------------------------------------------------------------------
  // Custom profiles from DB
  // -------------------------------------------------------------------------

  it('loads custom profile from DB', () => {
    const customProfile = {
      name: 'custom-test',
      criteria: [
        { name: 'speed', description: 'Fast response', weight: 0.6 },
        { name: 'quality', description: 'High quality', weight: 0.4 },
      ],
      weights: { speed: 0.6, quality: 0.4 },
      minJudges: 2,
      consensusAlgorithm: 'weighted_majority',
      timeoutMs: 30_000,
    };

    db.insert('judge_profiles', {
      id: 'custom-1',
      name: 'custom-test',
      config: JSON.stringify(customProfile),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const manager = createJudgeProfileManager(db);
    const profile = manager.getProfile('custom-test');
    expect(profile.name).toBe('custom-test');
    expect(profile.criteria).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // listProfiles
  // -------------------------------------------------------------------------

  it('lists all built-in profiles', () => {
    const manager = createJudgeProfileManager(db);
    const profiles = manager.listProfiles();
    expect(profiles).toContain('default');
    expect(profiles).toContain('code');
    expect(profiles).toContain('research');
    expect(profiles).toContain('creative');
    expect(profiles).toContain('analysis');
  });

  it('includes custom profiles in list', () => {
    db.insert('judge_profiles', {
      id: 'custom-2',
      name: 'my-custom',
      config: JSON.stringify({
        name: 'my-custom',
        criteria: [],
        weights: {},
        minJudges: 1,
        consensusAlgorithm: 'weighted_majority',
        timeoutMs: 10_000,
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const manager = createJudgeProfileManager(db);
    const profiles = manager.listProfiles();
    expect(profiles).toContain('my-custom');
    expect(profiles).toContain('default');
  });

  it('deduplicates custom profile names with built-in names', () => {
    // Insert a profile named 'default' into DB (shouldn't duplicate)
    db.insert('judge_profiles', {
      id: 'dup-1',
      name: 'default',
      config: JSON.stringify({
        name: 'default',
        criteria: [],
        weights: {},
        minJudges: 1,
        consensusAlgorithm: 'weighted_majority',
        timeoutMs: 10_000,
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const manager = createJudgeProfileManager(db);
    const profiles = manager.listProfiles();
    const defaultCount = profiles.filter((p) => p === 'default').length;
    expect(defaultCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // DB query failure in listProfiles (line 130 -- catch branch)
  // -------------------------------------------------------------------------

  it('returns only built-in profiles when DB query fails', () => {
    // Create a DB mock that throws on query for judge_profiles
    const brokenDb = {
      get: db.get.bind(db),
      insert: db.insert.bind(db),
      query: vi.fn().mockImplementation(() => {
        throw new Error('Table does not exist');
      }),
      close: db.close.bind(db),
      db: db.db,
    } as unknown as QosDatabase;

    const manager = createJudgeProfileManager(brokenDb);
    const profiles = manager.listProfiles();
    // Should still return built-in profiles despite DB failure
    expect(profiles).toContain('default');
    expect(profiles).toContain('code');
    expect(profiles).toContain('research');
    expect(profiles).toContain('creative');
    expect(profiles.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Zero weights throws error (line 145 -- normalizeWeights)
  // -------------------------------------------------------------------------

  it('falls back to default when custom profile has all-zero weights', () => {
    const customProfile = {
      name: 'zero-weights',
      criteria: [
        { name: 'x', description: 'test', weight: 0 },
      ],
      weights: { x: 0 },
      minJudges: 2,
      consensusAlgorithm: 'weighted_majority',
      timeoutMs: 30_000,
    };

    db.insert('judge_profiles', {
      id: 'zw-1',
      name: 'zero-weights',
      config: JSON.stringify(customProfile),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const manager = createJudgeProfileManager(db);
    // normalizeWeights should throw for all-zero weights, but since
    // the profile was loaded from DB, the error propagates through getProfile
    expect(() => manager.getProfile('zero-weights')).toThrow('All weights are zero');
  });

  // -------------------------------------------------------------------------
  // Without DB
  // -------------------------------------------------------------------------

  it('works without DB (undefined)', () => {
    const manager = createJudgeProfileManager();
    const profile = manager.getProfile('code');
    expect(profile.name).toBe('code');
    const profiles = manager.listProfiles();
    expect(profiles.length).toBe(5);
  });
});
