/**
 * Qualixar OS Phase 5 -- Team Memory Tests
 * LLD Section 6.8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreImpl } from '../../src/memory/store.js';
import { TeamMemoryImpl, createTeamMemory } from '../../src/memory/team-memory.js';
import { MemoryEntryNotFoundError } from '../../src/memory/store.js';
import { createTestDb, createTestEventBus, createEventSpy } from './helpers.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { EventBus } from '../../src/events/event-bus.js';

describe('TeamMemoryImpl', () => {
  let db: QosDatabase;
  let eventBus: EventBus;
  let store: MemoryStoreImpl;
  let teamMemory: TeamMemoryImpl;

  beforeEach(() => {
    db = createTestDb();
    eventBus = createTestEventBus(db);
    store = new MemoryStoreImpl(db, eventBus);
    teamMemory = new TeamMemoryImpl(store, eventBus);
  });

  it('shareWithTeam creates a copy with teamId', async () => {
    const id = await store.store({
      content: 'personal knowledge',
      layer: 'episodic',
      source: 'user',
    });

    await teamMemory.shareWithTeam(id, 'team-alpha');

    const teamEntries = store.getByTeamId('team-alpha');
    expect(teamEntries.length).toBe(1);
    expect(teamEntries[0].content).toBe('personal knowledge');
    expect(teamEntries[0].metadata.shared_from).toBe(id);
  });

  it('original remains unchanged after sharing', async () => {
    const id = await store.store({
      content: 'original stays personal',
      layer: 'episodic',
      source: 'user',
    });

    await teamMemory.shareWithTeam(id, 'team-beta');

    const original = store.getById(id);
    expect(original!.teamId).toBeNull();
  });

  it('getTeamMemory returns only team entries', async () => {
    await store.store({
      content: 'team-a data',
      layer: 'episodic',
      source: 'user',
      teamId: 'team-a',
    });
    await store.store({
      content: 'team-b data',
      layer: 'episodic',
      source: 'user',
      teamId: 'team-b',
    });

    const context = await teamMemory.getTeamMemory('team-a');
    expect(context.entries.length).toBe(1);
    expect(context.entries[0].content).toBe('team-a data');
  });

  it('team A cannot see team B entries', async () => {
    await store.store({
      content: 'secret team-b',
      layer: 'episodic',
      source: 'user',
      teamId: 'team-b',
    });

    const context = await teamMemory.getTeamMemory('team-a');
    expect(context.entries.length).toBe(0);
  });

  it('personal entries (team_id=null) are visible to validateTeamAccess', () => {
    expect(teamMemory.validateTeamAccess('team-a', null)).toBe(true);
    expect(teamMemory.validateTeamAccess(null, null)).toBe(true);
  });

  it('validateTeamAccess: same team returns true', () => {
    expect(teamMemory.validateTeamAccess('team-a', 'team-a')).toBe(true);
  });

  it('validateTeamAccess: different team returns false', () => {
    expect(teamMemory.validateTeamAccess('team-a', 'team-b')).toBe(false);
  });

  it('validateTeamAccess: null agent cannot see team entries', () => {
    expect(teamMemory.validateTeamAccess(null, 'team-a')).toBe(false);
  });

  it('emits memory:team_shared event', async () => {
    const captured = createEventSpy(eventBus);
    const id = await store.store({
      content: 'shared item',
      layer: 'episodic',
      source: 'user',
    });

    await teamMemory.shareWithTeam(id, 'team-gamma');

    const sharedEvent = captured.find((e) => e.type === 'memory:team_shared');
    expect(sharedEvent).toBeDefined();
    expect(sharedEvent!.payload.teamId).toBe('team-gamma');
  });

  it('shareWithTeam throws for non-existent entry', async () => {
    await expect(
      teamMemory.shareWithTeam('nonexistent', 'team-a'),
    ).rejects.toThrow(MemoryEntryNotFoundError);
  });
});

describe('createTeamMemory factory', () => {
  it('returns TeamMemory instance', () => {
    const db2 = createTestDb();
    const eb2 = createTestEventBus(db2);
    const store2 = new MemoryStoreImpl(db2, eb2);
    const tm = createTeamMemory(store2, eb2);
    expect(tm).toBeDefined();
    expect(typeof tm.shareWithTeam).toBe('function');
    expect(typeof tm.getTeamMemory).toBe('function');
    expect(typeof tm.validateTeamAccess).toBe('function');
  });
});
