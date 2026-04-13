/**
 * Qualixar OS Phase 18 -- Channel Manager Tests
 * Tests for createChannelManager(): list, get, update, and testChannel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChannelManager } from '../../src/channels/channel-manager.js';
import type { CredentialStore } from '../../src/types/phase18.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentialStore(token?: string): CredentialStore {
  return {
    store: vi.fn(),
    resolve: vi.fn().mockReturnValue(token),
    list: vi.fn().mockReturnValue([]),
    remove: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(!!token),
  };
}

function mockFetchOk(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChannelManager', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1
  it('list() returns all 7 channels', () => {
    const manager = createChannelManager();
    const channels = manager.list();
    expect(channels).toHaveLength(7);
    const ids = channels.map((c) => c.channelId);
    expect(ids).toContain('mcp');
    expect(ids).toContain('http');
    expect(ids).toContain('discord');
    expect(ids).toContain('telegram');
    expect(ids).toContain('webhook');
    expect(ids).toContain('a2a');
    expect(ids).toContain('sse');
  });

  // Test 2
  it('get() returns the channel config by ID', () => {
    const manager = createChannelManager();
    const mcp = manager.get('mcp');
    expect(mcp).toBeDefined();
    expect(mcp!.channelId).toBe('mcp');
    expect(mcp!.type).toBe('mcp');
  });

  // Test 3
  it('get() returns undefined for an unknown channel ID', () => {
    const manager = createChannelManager();
    const result = manager.get('does-not-exist');
    expect(result).toBeUndefined();
  });

  // Test 4
  it('update() enables a channel and sets status to connected', () => {
    const manager = createChannelManager();
    const updated = manager.update('discord', true, {});
    expect(updated.enabled).toBe(true);
    expect(updated.status).toBe('connected');
  });

  // Test 5
  it('update() disables a channel and sets status to disconnected', () => {
    const manager = createChannelManager();
    const updated = manager.update('mcp', false, {});
    expect(updated.enabled).toBe(false);
    expect(updated.status).toBe('disconnected');
  });

  // Test 6
  it('update() merges new settings with existing ones', () => {
    const manager = createChannelManager();
    const updated = manager.update('http', true, { port: 4000, newOption: 'hello' });
    const settings = updated.settings as Record<string, unknown>;
    // Existing key preserved / overridden
    expect(settings['port']).toBe(4000);
    // New key added
    expect(settings['newOption']).toBe('hello');
    // Pre-existing keys not in the patch are kept
    expect(settings['corsOrigins']).toBeDefined();
  });

  // Test 7
  it('update() throws an error for an invalid channel ID', () => {
    const manager = createChannelManager();
    expect(() => manager.update('invalid-channel', true, {})).toThrow(
      /Unknown channel type/,
    );
  });

  // Test 8
  it('testChannel() returns success for MCP (in-process, no network)', async () => {
    const manager = createChannelManager();
    const result = await manager.testChannel('mcp', makeCredentialStore());
    expect(result.channelId).toBe('mcp');
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Test 9
  it('testChannel() returns success for SSE (in-process, no network)', async () => {
    const manager = createChannelManager();
    const result = await manager.testChannel('sse', makeCredentialStore());
    expect(result.channelId).toBe('sse');
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Test 10
  it('testChannel() throws an error for an invalid channel ID', async () => {
    const manager = createChannelManager();
    await expect(
      manager.testChannel('nonexistent', makeCredentialStore()),
    ).rejects.toThrow(/Unknown channel type/);
  });
});
