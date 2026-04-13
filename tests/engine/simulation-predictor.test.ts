/**
 * Phase C5 -- Simulation Predictor Tests
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createSimulationPredictor } from '../../src/engine/simulation-predictor.js';
import type { QosDatabase } from '../../src/db/database.js';

function createTestDb(): QosDatabase {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE tasks (id TEXT, type TEXT, status TEXT, cost_usd REAL, duration_ms REAL, created_at TEXT);
    CREATE TABLE forge_designs (id TEXT, task_id TEXT, topology TEXT);
    CREATE TABLE judge_results (id TEXT, task_id TEXT, score REAL);
  `);
  return { db: raw, insert: vi.fn(), get: vi.fn(), query: vi.fn(), update: vi.fn() } as unknown as QosDatabase;
}

function seedHistory(db: QosDatabase): void {
  const raw = db.db as Database.Database;
  for (let i = 0; i < 10; i++) {
    raw.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').run(
      `t-${i}`, 'code', i < 8 ? 'completed' : 'failed', 0.02 + i * 0.005, 3000 + i * 500, '2026-04-01',
    );
    raw.prepare('INSERT INTO forge_designs VALUES (?,?,?)').run(`fd-${i}`, `t-${i}`, 'parallel');
    raw.prepare('INSERT INTO judge_results VALUES (?,?,?)').run(`jr-${i}`, `t-${i}`, 0.7 + i * 0.02);
  }
}

describe('SimulationPredictor', () => {
  it('returns caution with zero confidence when no history', () => {
    const db = createTestDb();
    const predictor = createSimulationPredictor(db);
    const result = predictor.predict(
      { id: 'x', taskType: 'code', topology: 'parallel', agents: [{ role: 'coder' }], reasoning: '', estimatedCostUsd: 0, version: 1 } as never,
      { prompt: 'test', type: 'code' } as never,
    );
    expect(result.confidence).toBe(0);
    expect(result.recommendation).toBe('caution');
  });

  it('predicts from historical data with confidence', () => {
    const db = createTestDb();
    seedHistory(db);
    const predictor = createSimulationPredictor(db);
    const result = predictor.predict(
      { id: 'x', taskType: 'code', topology: 'parallel', agents: [{ role: 'a' }, { role: 'b' }, { role: 'c' }], reasoning: '', estimatedCostUsd: 0, version: 1 } as never,
      { prompt: 'test', type: 'code' } as never,
    );
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.basedOnSamples).toBeGreaterThan(0);
  });

  it('recommends redesign when failure rate is high', () => {
    const db = createTestDb();
    const raw = db.db as Database.Database;
    for (let i = 0; i < 10; i++) {
      raw.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?)').run(`t-${i}`, 'code', 'failed', 0.05, 5000, '2026-04-01');
      raw.prepare('INSERT INTO forge_designs VALUES (?,?,?)').run(`fd-${i}`, `t-${i}`, 'sequential');
      raw.prepare('INSERT INTO judge_results VALUES (?,?,?)').run(`jr-${i}`, `t-${i}`, 0.2);
    }
    const predictor = createSimulationPredictor(db);
    const result = predictor.predict(
      { id: 'x', taskType: 'code', topology: 'sequential', agents: [{ role: 'a' }], reasoning: '', estimatedCostUsd: 0, version: 1 } as never,
      { prompt: 'test', type: 'code' } as never,
    );
    expect(result.recommendation).toBe('redesign');
    expect(result.failureProbability).toBeGreaterThan(0.5);
  });
});
