/**
 * Qualixar OS Phase 6 -- Bootstrap Tests
 * TDD Round 5: createQos factory
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createQos } from '../src/bootstrap.js';
import { QosConfigSchema, type QosConfig } from '../src/types/common.js';
import type { Orchestrator } from '../src/engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTestConfig(): QosConfig {
  return QosConfigSchema.parse({
    db: { path: ':memory:' },
    observability: { log_level: 'error' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createQos', () => {
  let orchestrator: Orchestrator | undefined;

  afterEach(() => {
    if (orchestrator?.db) {
      try {
        orchestrator.db.close();
      } catch {
        // Already closed
      }
    }
    orchestrator = undefined;
  });

  // Test 37: createQos returns Orchestrator
  it('returns object with run, pause, resume, cancel, getStatus methods', () => {
    orchestrator = createQos(getTestConfig());
    expect(typeof orchestrator.run).toBe('function');
    expect(typeof orchestrator.pause).toBe('function');
    expect(typeof orchestrator.resume).toBe('function');
    expect(typeof orchestrator.redirect).toBe('function');
    expect(typeof orchestrator.cancel).toBe('function');
    expect(typeof orchestrator.getStatus).toBe('function');
    expect(typeof orchestrator.recoverIncompleteTasks).toBe('function');
  });

  // Test 38: All 32 components instantiated without errors
  it('creates all 32 components without exceptions', () => {
    expect(() => {
      orchestrator = createQos(getTestConfig());
    }).not.toThrow();
  });

  // Test 39: Exposed properties are accessible
  it('exposed Phase 7 properties are accessible', () => {
    orchestrator = createQos(getTestConfig());
    expect(orchestrator.modeEngine).toBeDefined();
    expect(orchestrator.costTracker).toBeDefined();
    expect(orchestrator.forge).toBeDefined();
    expect(orchestrator.judgePipeline).toBeDefined();
    expect(orchestrator.slmLite).toBeDefined();
    expect(orchestrator.agentRegistry).toBeDefined();
    expect(orchestrator.swarmEngine).toBeDefined();
    expect(orchestrator.strategyScorer).toBeDefined();
    expect(orchestrator.eventBus).toBeDefined();
    expect(orchestrator.db).toBeDefined();
  });

  // Test 40: Default config uses companion mode
  it('default config uses companion mode', () => {
    orchestrator = createQos(getTestConfig());
    expect(orchestrator.modeEngine.currentMode).toBe('companion');
  });

  // Test 41: Power mode config
  it('power mode config sets mode correctly', () => {
    const config = QosConfigSchema.parse({
      mode: 'power',
      db: { path: ':memory:' },
      observability: { log_level: 'error' },
    });
    orchestrator = createQos(config);
    expect(orchestrator.modeEngine.currentMode).toBe('power');
  });

  // Test 42: DB is functional after bootstrap
  it('database is functional after bootstrap', () => {
    orchestrator = createQos(getTestConfig());
    // Verify tables exist by querying
    const tables = orchestrator.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      [],
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('agents');
  });
});
