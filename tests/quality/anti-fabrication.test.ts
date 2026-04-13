/**
 * Qualixar OS Phase 3 -- Anti-Fabrication Tests
 * TDD Sequence #4: Mock LLM + mock DB. Tests claim extraction and registry lookup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAntiFabrication } from '../../src/quality/anti-fabrication.js';
import { createDatabase } from '../../src/db/database.js';
import { createEventBus } from '../../src/events/event-bus.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { phase3Migrations } from '../../src/db/migrations/phase3.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

// ---------------------------------------------------------------------------
// Mock ModelRouter
// ---------------------------------------------------------------------------

function createMockRouter(response: string) {
  return {
    route: vi.fn().mockResolvedValue({
      content: response,
      model: 'gpt-4.1-mini',
      provider: 'openai',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      latencyMs: 500,
    }),
  };
}

describe('AntiFabrication', () => {
  let db: QosDatabase;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const runner = new MigrationRunner(db.db);
    runner.registerMigrations(phase3Migrations);
    runner.applyPending();
    eventBus = createEventBus(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty issues when LLM returns non-JSON', async () => {
    const mockRouter = createMockRouter('not valid json');
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Some output text', 'task-1');
    expect(issues).toHaveLength(0);
  });

  it('returns empty issues when no claims extracted', async () => {
    const mockRouter = createMockRouter('[]');
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Just an opinion', 'task-2');
    expect(issues).toHaveLength(0);
  });

  it('returns no issue for confirmed (verified) claim', async () => {
    // Insert a verified fact
    db.insert('verified_facts', {
      id: 'vf-1',
      task_context: 'task-3',
      claim_text: 'The Earth orbits the Sun',
      verified_text: 'The Earth orbits the Sun',
      status: 'confirmed',
      source: 'textbook',
      created_at: new Date().toISOString(),
    });

    const claims = JSON.stringify([
      { text: 'The Earth orbits the Sun', category: 'fact', confidence: 0.95 },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('The Earth orbits the Sun', 'task-3');
    // Confirmed claim should produce no issues
    const fabricationIssues = issues.filter((i) => i.category === 'fabrication');
    expect(fabricationIssues).toHaveLength(0);
  });

  it('returns critical issue for contradicted claim', async () => {
    db.insert('verified_facts', {
      id: 'vf-2',
      task_context: 'task-4',
      claim_text: 'Water boils at 50 degrees',
      verified_text: 'Water boils at 100 degrees Celsius',
      status: 'contradicted',
      source: 'physics',
      created_at: new Date().toISOString(),
    });

    const claims = JSON.stringify([
      {
        text: 'Water boils at 50 degrees',
        category: 'fact',
        confidence: 0.9,
      },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify(
      'Water boils at 50 degrees',
      'task-4',
    );

    const critical = issues.filter((i) => i.severity === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0].category).toBe('fabrication');
  });

  it('emits fabrication:detected event for contradicted claim', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.on('fabrication:detected', handler);

    db.insert('verified_facts', {
      id: 'vf-3',
      task_context: 'task-5',
      claim_text: 'False claim text here',
      verified_text: 'True fact text here',
      status: 'contradicted',
      source: 'test',
      created_at: new Date().toISOString(),
    });

    const claims = JSON.stringify([
      { text: 'False claim text here', category: 'fact', confidence: 0.95 },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    await af.verify('False claim text here', 'task-5');

    expect(handler).toHaveBeenCalled();
  });

  it('returns medium issue for unverifiable high-confidence claim', async () => {
    const claims = JSON.stringify([
      {
        text: 'A very specific unverifiable claim',
        category: 'fact',
        confidence: 0.9,
      },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Some text', 'task-6');

    const medium = issues.filter(
      (i) => i.category === 'unverifiable_claim',
    );
    expect(medium.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag low-confidence unverifiable claims', async () => {
    const claims = JSON.stringify([
      {
        text: 'Maybe something',
        category: 'fact',
        confidence: 0.3,
      },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Some text', 'task-7');
    const unverifiable = issues.filter(
      (i) => i.category === 'unverifiable_claim',
    );
    expect(unverifiable).toHaveLength(0);
  });

  it('warns when >50% claims are unverifiable', async () => {
    const claims = JSON.stringify([
      { text: 'Claim A', category: 'fact', confidence: 0.9 },
      { text: 'Claim B', category: 'fact', confidence: 0.9 },
      { text: 'Claim C', category: 'fact', confidence: 0.9 },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Lots of claims', 'task-8');

    const ratio = issues.filter(
      (i) => i.category === 'high_unverifiable_ratio',
    );
    expect(ratio.length).toBeGreaterThanOrEqual(1);
  });

  it('handles LLM route failure gracefully', async () => {
    const mockRouter = {
      route: vi.fn().mockRejectedValue(new Error('LLM down')),
    };
    const af = createAntiFabrication(mockRouter, db, eventBus);

    const issues = await af.verify('Some text', 'task-9');
    expect(issues).toHaveLength(0);
  });

  it('treats claim as unverifiable when DB query throws (line 108)', async () => {
    // DB mock where get() throws to simulate verified_facts table missing
    const brokenDb = {
      get: vi.fn().mockImplementation(() => {
        throw new Error('no such table: verified_facts');
      }),
      insert: db.insert.bind(db),
      query: db.query.bind(db),
      close: db.close.bind(db),
      db: db.db,
    } as unknown as QosDatabase;

    const claims = JSON.stringify([
      { text: 'Claim that needs verification', category: 'fact', confidence: 0.9 },
    ]);
    const mockRouter = createMockRouter(claims);
    const af = createAntiFabrication(mockRouter, brokenDb, eventBus);

    const issues = await af.verify('Some output with claims', 'task-10');

    // Should have unverifiable_claim (since DB threw, claim not found)
    const unverifiable = issues.filter(
      (i) => i.category === 'unverifiable_claim',
    );
    expect(unverifiable.length).toBeGreaterThanOrEqual(1);
  });
});
